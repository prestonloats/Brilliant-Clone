// Teen-appropriate content safety helpers (plan 5.6).
//
// These are PURE and unit-testable. They form layers 3 and 4 of the safety posture:
//   3. Input sanitization + moderation BEFORE the model sees the learner's free text.
//   4. Output filtering AFTER the model, before any narrative/label is displayed.
//
// They are a lightweight, deterministic backstop — the primary defenses are the model
// `safetySettings` and the system-prompt rules (plan 5.4). A filter hit never hard-blocks
// the learner; the caller re-prompts for a safe choice or drops to a canned fallback.

export const MAX_USER_INPUT_LENGTH = 200

export type ModerationResult = { ok: boolean; reason?: string }

// Trim, cap length, and strip control chars, URLs, and HTML/markdown markup so neither
// raw markup nor a link can ride along into the prompt or be echoed back to the learner.
export function sanitizeUserInput(raw: string, maxLength: number = MAX_USER_INPUT_LENGTH): string {
  if (typeof raw !== 'string') return ''

  let text = raw
  // Strip explicit URLs first (http/https/protocol-relative and www. prefixes)...
  text = text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
  // ...then bare domains with a common TLD (e.g. "phishy.com/abc").
  text = text.replace(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|gg|xyz|co|edu|gov|info|app|dev|me|tv)\b\S*/gi, ' ')
  // Drop HTML/XML tags, then any leftover markup/control punctuation used for markdown
  // or prompt-injection framing.
  text = text.replace(/<[^>]*>/g, ' ')
  text = text.replace(/[<>*_`~|#\\{}[\]]/g, ' ')
  // Remove ASCII + C1 control characters (newlines, tabs, etc. collapse to spaces).
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  // Collapse whitespace and trim.
  text = text.replace(/\s+/g, ' ').trim()

  if (text.length > maxLength) {
    text = text.slice(0, maxLength).trim()
  }
  return text
}

// Words that are never appropriate for a teen audience. Kept deliberately small and
// representative; the model safety settings are the comprehensive filter.
const PROFANITY = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'piss',
  'cunt',
  'slut',
  'whore',
  'nigger',
  'faggot',
  'retard',
]

// Self-harm, weapons/violence, drugs, and abuse phrases. Multi-word phrases are matched
// on the despaced form so "self harm" and "selfharm" both hit.
const UNSAFE_PHRASES = [
  'killyourself',
  'kys',
  'suicide',
  'selfharm',
  'cutmyself',
  'cuttingmyself',
  'makeabomb',
  'buildabomb',
  'makeapipebomb',
  'schoolshooting',
  'shootupthe',
  'howtokill',
  'heroin',
  'cocaine',
  'meth',
  'overdose',
]

// Single weapon/violence words checked on word boundaries (so "begun" never matches "gun").
const UNSAFE_WORDS = ['gun', 'guns', 'gunshot', 'shooting', 'bomb', 'grenade', 'explosive', 'rape', 'molest']

// Map common leetspeak/symbol substitutions back to letters so "sh1t" / "f@ck" are caught.
const deLeet = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')

// Letters + spaces only (collapsed), for word-boundary checks on normalized text.
const normalizeSpaced = (text: string): string =>
  deLeet(text)
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// All letters, no separators, for catching spaced-out evasion like "s h i t".
const despace = (text: string): string => deLeet(text).replace(/[^a-z]/g, '')

const matchesWord = (haystack: string, word: string): boolean => new RegExp(`\\b${word}\\b`).test(haystack)

// Aggressive profanity check (leetspeak + spaced-out evasion) for UNTRUSTED user input.
export function containsProfanity(text: string): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false
  const spaced = normalizeSpaced(text)
  const collapsed = despace(text)
  return PROFANITY.some((word) => matchesWord(spaced, word) || collapsed.includes(word))
}

// Self-harm / weapons / drugs / abuse check for UNTRUSTED user input.
export function containsUnsafeContent(text: string): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false
  const spaced = normalizeSpaced(text)
  const collapsed = despace(text)
  if (UNSAFE_WORDS.some((word) => matchesWord(spaced, word))) return true
  return UNSAFE_PHRASES.some((phrase) => collapsed.includes(phrase))
}

// Full input pipeline: sanitize, then reject empty/profane/unsafe input. The returned
// `sanitized` text is what should be sent to the model when `ok` is true.
export function moderateUserInput(raw: string): ModerationResult & { sanitized: string } {
  const sanitized = sanitizeUserInput(raw)
  if (sanitized === '') return { ok: false, reason: 'empty', sanitized }
  if (containsProfanity(sanitized)) return { ok: false, reason: 'profanity', sanitized }
  if (containsUnsafeContent(sanitized)) return { ok: false, reason: 'unsafe', sanitized }
  return { ok: true, sanitized }
}

// Output moderation runs on the model's narrative/labels before display. The model is not
// trying to evade, so word-boundary matching is used to avoid false positives (e.g. the
// "class" / "begun" Scunthorpe problem) while still catching profanity and unsafe topics.
export function moderateOutput(text: string): ModerationResult {
  if (typeof text !== 'string') return { ok: false, reason: 'empty' }
  const spaced = normalizeSpaced(text)
  const collapsed = despace(text)
  if (PROFANITY.some((word) => matchesWord(spaced, word))) return { ok: false, reason: 'profanity' }
  if (UNSAFE_WORDS.some((word) => matchesWord(spaced, word))) return { ok: false, reason: 'unsafe' }
  if (UNSAFE_PHRASES.some((phrase) => collapsed.includes(phrase))) return { ok: false, reason: 'unsafe' }
  return { ok: true }
}

export function isOutputSafe(text: string): boolean {
  return moderateOutput(text).ok
}
