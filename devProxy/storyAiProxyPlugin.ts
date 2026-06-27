// LOCAL-DEV-ONLY OpenAI proxy, mounted as Vite dev-server middleware.
//
// It holds OPENAI_API_KEY server-side (read from .env via loadEnv, NEVER a VITE_ var, so it is never
// shipped to the browser) and forwards Story Mode generate/moderate calls to OpenAI. The client posts
// same-origin to VITE_STORY_AI_PROXY_URL (default /api/story) with no key. Because it uses
// `apply: 'serve'`, it runs ONLY during `vite dev` — a production static build has no proxy, so for
// deploy you must stand up a real serverless/Cloud Function proxy speaking the same protocol.

import { loadEnv, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  OPENAI_MODERATION_MODEL,
  PROXY_LIMITS,
  extractCompletionText,
  extractModerationFlag,
  toChatCompletionsBody,
  validateProxyRequest,
} from '../src/story/openAiProxyProtocol'

const OPENAI_BASE = 'https://api.openai.com/v1'
const MAX_BODY_BYTES = PROXY_LIMITS.maxBodyBytes

const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer | string) => {
      raw += chunk
      if (raw.length > MAX_BODY_BYTES) reject(new Error('request body too large'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

const callOpenAi = (path: string, apiKey: string, body: unknown): Promise<Response> =>
  fetch(`${OPENAI_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

const handleProxyRequest = async (req: IncomingMessage, res: ServerResponse, apiKey: string): Promise<void> => {
  if (!apiKey) {
    sendJson(res, 500, { error: 'OPENAI_API_KEY is not configured on the dev proxy' })
    return
  }

  let raw: unknown
  try {
    raw = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'bad request' })
    return
  }

  // Validate + normalize before spending the key: allow-list the model, clamp output tokens, and
  // cap prompt/input size (shared with the production proxies via openAiProxyProtocol).
  const validated = validateProxyRequest(raw)
  if (!validated.ok) {
    sendJson(res, validated.status, { error: validated.error })
    return
  }
  const body = validated.request

  try {
    if (body.op === 'generate') {
      const requestBody = toChatCompletionsBody(body)
      let upstream = await callOpenAi('/chat/completions', apiKey, requestBody)
      if (!upstream.ok) {
        // Surface OpenAI's own error (key already masked by OpenAI) to the dev console and the
        // response so misconfigured-key/scope problems are diagnosable instead of a silent null.
        let detail = (await upstream.text()).slice(0, 500)
        // Resilience: if the model rejected `reasoning_effort` (e.g. a non-reasoning model override),
        // retry ONCE without it so a model swap can't hard-break generation.
        if (upstream.status === 400 && requestBody.reasoning_effort && /reasoning/i.test(detail)) {
          const retryBody = { ...requestBody }
          delete retryBody.reasoning_effort
          upstream = await callOpenAi('/chat/completions', apiKey, retryBody)
          if (!upstream.ok) detail = (await upstream.text()).slice(0, 500)
        }
        if (!upstream.ok) {
          console.error(`[story-ai-proxy] OpenAI /chat/completions ${upstream.status}: ${detail}`)
          sendJson(res, upstream.status, { text: null, error: detail })
          return
        }
      }
      sendJson(res, 200, { text: extractCompletionText(await upstream.json()) })
      return
    }
    if (body.op === 'moderate') {
      const upstream = await callOpenAi('/moderations', apiKey, { model: OPENAI_MODERATION_MODEL, input: body.input })
      if (!upstream.ok) {
        // Fail CLOSED: if the moderation call itself fails we cannot vouch for the input, so report it
        // as flagged. The adapter then drops the untrusted choice and the story steers back safely.
        console.error(`[story-ai-proxy] OpenAI /moderations ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`)
        sendJson(res, 200, { flagged: true })
        return
      }
      sendJson(res, 200, { flagged: extractModerationFlag(await upstream.json()) })
      return
    }
    sendJson(res, 400, { error: 'unknown op' })
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'proxy error' })
  }
}

export function storyAiProxyPlugin(): Plugin {
  let apiKey = ''
  let routePath = '/api/story'

  return {
    name: 'story-ai-openai-proxy',
    apply: 'serve',
    configResolved(config) {
      // Read the SERVER-side key (and the configured route) from .env without exposing either to the
      // client bundle. The empty prefix loads non-VITE vars too, which is safe here (Node only).
      const env = loadEnv(config.mode, config.root, '')
      apiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
      const configured = env.VITE_STORY_AI_PROXY_URL
      if (configured && configured.startsWith('/')) routePath = configured
      if (!apiKey) {
        config.logger.warn(
          '[story-ai-proxy] OPENAI_API_KEY is not set; Story Mode "proxy" calls will return 500. ' +
            'Add OPENAI_API_KEY (no VITE_ prefix) to .env to enable the local OpenAI proxy.',
        )
      }
    },
    configureServer(server) {
      server.middlewares.use(routePath, (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        void handleProxyRequest(req, res, apiKey)
      })
    },
  }
}
