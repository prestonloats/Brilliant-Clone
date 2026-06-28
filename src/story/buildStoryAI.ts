// Shared StoryAI factory (work item B1).
//
// The four StoryAI adapters (openAiStoryAi, openAiDeveloperStoryAi, geminiDeveloperStoryAi,
// firebaseStoryAi) used to copy-paste a near-identical StoryAI implementation; only the TRANSPORT
// actually differed (which SDK/proxy is called, the exact request shape, model selection, token
// budgets, temperature, schema, reasoning effort, retry, timeout, and empty-completion handling).
// This module centralizes the provider-AGNOSTIC logic ONCE — prompt building (storyPrompts), the
// JSON parse/validate, output moderation (safety), and the per-call fallback decisions — so each
// adapter shrinks to a transport closure plus `return buildStoryAI(transport)`.
//
// PURE: like storyPrompts/safety/sceneMatchPrompt this imports NO SDK, so the shared logic is
// unit-testable without a network (see tests/story-build-ai.test.ts) and never pulls an LLM SDK
// into the type graph. Each provider keeps its own transport mechanics inside its adapter.

import { isOutputSafe, moderateUserInput } from './safety'
import { buildSceneMatchPrompt } from './sceneMatchPrompt'
import type { RethemeRequest, RethemeResult, SceneMatchRequest, StoryAI } from './storyAi'
import {
  RETHEME_FALLBACK,
  buildContinuePrompt,
  buildRethemePrompt,
  buildScenePrompt,
  buildSegmentPrompt,
  buildStartStoryPrompt,
  buildStoryBiblePrompt,
  buildSummarizePrompt,
  isStringRecord,
  parseRethemeResult,
  parseSceneId,
} from './storyPrompts'

// The provider-agnostic "kind" of generation the shared logic needs. Each maps 1:1 to a StoryAI
// call family; the transport turns a purpose into its OWN request config (model, token budget,
// temperature, schema, JSON mode) and per-call deadline (always STORY_TIMEOUTS[purpose] today).
export type StoryTransportPurpose = 'start' | 'retheme' | 'prose' | 'bible' | 'scene' | 'summarize'

// The provider-specific seam. An adapter constructs ONE of these (closing over its SDK/proxy client,
// schemas, model list, token budgets, retry policy, and timeout usage) and hands it to
// `buildStoryAI`. `generate` returns the raw model text, or null when the provider ultimately fails
// AFTER its own retries + model fallback (so the shared logic then applies the right fallback).
export type StoryTransport = {
  generate(prompt: string, purpose: StoryTransportPurpose): Promise<string | null>
  // OPTIONAL provider-side moderation of the RAW user choice. OpenAI text generation has no inline
  // safety filter, so its adapters add a free OpenAI Moderations pass (returns true when flagged);
  // the Gemini/Firebase adapters rely on the model's inline safetySettings and omit this.
  moderateRawChoice?(input: string): Promise<boolean>
}

// Assemble a full StoryAI from a provider transport, using the shared parse/validate/moderate/
// fallback logic. Behavior here is the SAME for every provider; only `transport` differs.
export function buildStoryAI(transport: StoryTransport): StoryAI {
  // Prose beats THROW on failure/timeout/safety-block so the controller picks the right theme-aware,
  // per-beat fallback (never reprinting the opening as an "outcome"). Transient failures were already
  // retried inside the transport's `generate`.
  const generateProse = async (prompt: string): Promise<string> => {
    const text = (await transport.generate(prompt, 'prose'))?.trim() ?? ''
    if (!text || !isOutputSafe(text)) {
      throw new Error('story-ai: prose generation failed or was blocked')
    }
    return text
  }

  return {
    async startStory(theme) {
      // Start THROWS on failure so the controller's catch uses its theme-aware opening fallback +
      // interest-aware protagonist (instead of a canned opening + "the Explorer").
      const raw = await transport.generate(buildStartStoryPrompt(theme), 'start')
      if (!raw) throw new Error('story-ai: start generation failed')
      try {
        const data: unknown = JSON.parse(raw)
        if (
          isStringRecord(data) &&
          typeof data.premise === 'string' &&
          typeof data.protagonist === 'string' &&
          typeof data.opening === 'string' &&
          isOutputSafe(`${data.premise} ${data.protagonist} ${data.opening}`)
        ) {
          return { premise: data.premise, protagonist: data.protagonist, opening: data.opening }
        }
      } catch {
        /* fall through to throw */
      }
      throw new Error('story-ai: start response invalid or blocked')
    },

    async rethemeQuestion(req: RethemeRequest): Promise<RethemeResult> {
      const raw = await transport.generate(buildRethemePrompt(req), 'retheme')
      if (!raw) return RETHEME_FALLBACK
      const parsed = parseRethemeResult(raw)
      if (!parsed) return RETHEME_FALLBACK
      // Output moderation on every themed string; a hit forces the original (un-themed) question.
      const texts = [
        parsed.themedPrompt,
        ...(parsed.themedOptions ?? []).map((o) => o.label),
        ...(parsed.themedTiles ?? []).map((t) => t.label),
      ]
      if (!texts.every((t) => isOutputSafe(t))) return RETHEME_FALLBACK
      return parsed
    },

    async writeSegment(input) {
      return generateProse(buildSegmentPrompt(input))
    },

    async writeStoryBible(req) {
      // The hidden plan: longer structured output. On any failure/empty/unsafe output we return ''
      // so the controller keeps the existing plan (never throws into the play loop), like summarize.
      const text = (await transport.generate(buildStoryBiblePrompt(req), 'bible'))?.trim() ?? ''
      return text && isOutputSafe(text) ? text : ''
    },

    async continueStory(input) {
      // Input sanitization + local moderation BEFORE the model. OpenAI adapters additionally run a
      // free OpenAI Moderations pass on the RAW choice (transport.moderateRawChoice) as the model-
      // side safety net that the Gemini/Firebase inline safetySettings already provide. Any block
      // blanks the choice so the prompt's "steer back safely" instruction applies instead.
      const moderation = moderateUserInput(input.userChoice)
      let safeChoice = moderation.ok ? moderation.sanitized : ''
      if (safeChoice && transport.moderateRawChoice && (await transport.moderateRawChoice(input.userChoice))) {
        safeChoice = ''
      }
      return generateProse(buildContinuePrompt({ ...input, userChoice: safeChoice }))
    },

    async pickScene(input) {
      // One catalog id (or "none"); a failure/timeout or unknown id parses to null -> no image.
      const raw = await transport.generate(buildScenePrompt(input), 'scene')
      return parseSceneId(raw)
    },

    async matchSceneToInterests(req: SceneMatchRequest) {
      // Closest-match picker (rules 5 & 6): same tiny single-id classification as pickScene, matched
      // against the candidate shortlist + interests. A failure/timeout, the NO_SCENE sentinel, or an
      // unknown id all parse to null -> no image when nothing is close enough.
      const raw = await transport.generate(buildSceneMatchPrompt(req), 'scene')
      return parseSceneId(raw)
    },

    async summarize(input) {
      // If summarization fails/blocks, keep the existing narrative untouched (empty signal).
      const text = (await transport.generate(buildSummarizePrompt(input), 'summarize'))?.trim() ?? ''
      return text && isOutputSafe(text) ? text : ''
    },
  }
}
