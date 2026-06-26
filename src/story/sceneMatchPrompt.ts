// Closest-match scene picker prompt (rules 5 & 6) — the "best candidate, or nothing" matcher.
//
// This is SEPARATE from `buildScenePrompt` (and deliberately does NOT reuse or modify it):
//   - `buildScenePrompt` matches a story BEAT to a setting and lists the WHOLE catalog.
//   - `buildSceneMatchPrompt` matches the reader's chosen TOPICS to ONE image from a small CANDIDATE
//     shortlist, EMPHASIZING the custom (freeform) topics, and answers the NO_SCENE sentinel when no
//     candidate is close enough (a "not close enough" threshold — a closest match is not accepted on
//     its own).
//
// Pure (no SDK import) so the four adapters reuse it and the logic is unit-testable without a
// network. It reads the same scenery descriptions and NO_SCENE sentinel as `buildScenePrompt`, and
// its strict "answer with only the id" instruction keeps the output trivially parseable by the
// shared `parseSceneId` (so the sentinel / an unknown id both become null).

import { getInterestLabel } from './interests'
import { NO_SCENE, getSceneDescription } from './scenery'
import type { SceneMatchRequest } from './storyAi'

export function buildSceneMatchPrompt(req: SceneMatchRequest): string {
  // Split the interests into SUGGESTED (preset labels, e.g. "Sci-fi, Fantasy quests") and CUSTOM
  // (the learner's freeform text) — the describeInterests-style phrasing — so the model can weight
  // the custom topics most when asked.
  const suggested = req.theme.interestIds.map((id) => getInterestLabel(id)).join(', ')
  const custom = (req.theme.freeformInterest ?? '').trim()

  // The candidate shortlist (and ONLY the shortlist) as "- <id>: <setting description>" lines,
  // mirroring the catalog formatting in `buildScenePrompt` so the model reads each image the same way.
  const candidateLines = req.candidates.map((id) => `- ${id}: ${getSceneDescription(id)}`).join('\n')

  const lines: string[] = [
    "You are matching the reader's chosen TOPICS to ONE background image, picked from a short list of candidate images. This is a matching task — do not write any story.",
    `SUGGESTED TOPICS (the reader's chosen interests): ${suggested || '(none)'}`,
    `CUSTOM TOPICS (the reader's own typed-in topics): ${custom || '(none)'}`,
    '',
    'CANDIDATE IMAGES (id: what the image shows) — you may ONLY choose from these:',
    candidateLines,
    `- ${NO_SCENE}: none of the candidate images is close enough to the topics`,
    '',
    "Pick the SINGLE candidate id whose setting most closely RESEMBLES the reader's topics above. Judge by how well the image as a whole fits the topics (its setting, subject, and any strongly themed elements).",
  ]

  // Emphasis is the headline behavior: weight the CUSTOM topics most when asked (and there are any).
  // When there is no custom text there is nothing to over-weight, so the strong line is omitted.
  if (req.emphasizeCustom && custom) {
    lines.push(
      `EMPHASIZE THE CUSTOM TOPICS — give the MOST weight to the custom topics ("${custom}"): strongly prefer the candidate that best matches those custom topics, and only lean on the suggested topics to break a tie.`,
    )
  }

  // The "not close enough" THRESHOLD: a closest match is NOT accepted on its own. If nothing
  // genuinely resembles the topics, answer the sentinel instead of forcing a weak pick.
  lines.push(
    `If NONE of the candidate images is genuinely close enough to the topics — only a weak, loose, or unrelated match — answer with exactly "${NO_SCENE}" instead of forcing a poor pick.`,
    `Answer with ONLY the chosen id (or "${NO_SCENE}") on its own — no quotes, no punctuation, no explanation, no other words.`,
  )
  return lines.join('\n')
}
