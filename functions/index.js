// Deploy-time Story Mode OpenAI proxy (the production equivalent of devProxy/storyAiProxyPlugin.ts).
//
// Firebase Hosting is static, so the dev-only Vite proxy at /api/story does not exist in production.
// This Cloud Function serves that same /api/story path (wired via the Hosting rewrite in
// firebase.json) and speaks the exact same browser<->proxy protocol as src/story/openAiProxyProtocol.ts.
//
// SECURITY: the OpenAI key NEVER ships to the browser. It is stored in Secret Manager and bound to
// this function via defineSecret('OPENAI_API_KEY'); set it once with:
//   firebase functions:secrets:set OPENAI_API_KEY
// The client posts the normalized protocol (no key) same-origin to /api/story.

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

const OPENAI_BASE = 'https://api.openai.com/v1'
// Mirrors OPENAI_MODERATION_MODEL in src/story/openAiProxyProtocol.ts.
const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

// --- protocol mapping (mirrors the pure helpers in src/story/openAiProxyProtocol.ts) ---------

const toChatCompletionsBody = (req) => {
  const body = {
    model: req.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
  }
  if (req.json) body.response_format = { type: 'json_object' }
  if (typeof req.maxOutputTokens === 'number') body.max_completion_tokens = req.maxOutputTokens
  return body
}

const extractCompletionText = (data) => {
  const choices = data?.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const content = choices[0]?.message?.content
  return typeof content === 'string' && content.length > 0 ? content : null
}

const extractModerationFlag = (data) => {
  const results = data?.results
  if (!Array.isArray(results) || results.length === 0) return false
  return Boolean(results[0]?.flagged)
}

const callOpenAi = (path, apiKey, body) =>
  fetch(`${OPENAI_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

export const storyProxy = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    // A small ceiling keeps a runaway/abuse loop from fanning out into a big OpenAI bill.
    maxInstances: 10,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' })
      return
    }

    const apiKey = OPENAI_API_KEY.value()
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY secret is not configured on the function' })
      return
    }

    // onRequest auto-parses a JSON body (Content-Type: application/json), which the client always sends.
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    try {
      if (body.op === 'generate') {
        const upstream = await callOpenAi('/chat/completions', apiKey, toChatCompletionsBody(body))
        if (!upstream.ok) {
          // Surface OpenAI's own error so a misconfigured/over-quota key is diagnosable in the logs and
          // the status flows back to the client's backoff layer (retry 429/5xx, fail fast on 4xx).
          const detail = (await upstream.text()).slice(0, 500)
          console.error(`[story-proxy] OpenAI /chat/completions ${upstream.status}: ${detail}`)
          res.status(upstream.status).json({ text: null, error: detail })
          return
        }
        res.status(200).json({ text: extractCompletionText(await upstream.json()) })
        return
      }

      if (body.op === 'moderate') {
        const upstream = await callOpenAi('/moderations', apiKey, {
          model: OPENAI_MODERATION_MODEL,
          input: body.input,
        })
        if (!upstream.ok) {
          console.error(`[story-proxy] OpenAI /moderations ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`)
          res.status(200).json({ flagged: false }) // fail-open on moderation infra errors
          return
        }
        res.status(200).json({ flagged: extractModerationFlag(await upstream.json()) })
        return
      }

      res.status(400).json({ error: 'unknown op' })
    } catch (error) {
      console.error('[story-proxy] error', error)
      res.status(502).json({ error: error instanceof Error ? error.message : 'proxy error' })
    }
  },
)
