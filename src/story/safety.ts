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

// Hard ceiling applied to RAW input before any regex runs. The strip/normalize passes below can do
// super-linear work on pathological input, so we bound their input first (defense against a ReDoS /
// CPU-exhaustion attempt); the final result is then capped to `maxLength` anyway. 2000 is 10x the
// normal cap, so it never truncates a legitimate choice.
export const MAX_RAW_INPUT_LENGTH = 2000

export type ModerationResult = { ok: boolean; reason?: string }

// Trim, cap length, and strip control chars, URLs, and HTML/markdown markup so neither
// raw markup nor a link can ride along into the prompt or be echoed back to the learner.
export function sanitizeUserInput(raw: string, maxLength: number = MAX_USER_INPUT_LENGTH): string {
  if (typeof raw !== 'string') return ''

  // Bound the work the regexes below do on untrusted input before touching it.
  let text = raw.length > MAX_RAW_INPUT_LENGTH ? raw.slice(0, MAX_RAW_INPUT_LENGTH) : raw
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

// Single unsafe terms (weapons/violence, self-harm, drugs) checked on WORD BOUNDARIES, so an ordinary
// word that merely CONTAINS one is never false-flagged: "begun" ⊅ "gun", "something" ⊅ "meth",
// "method" ⊅ "meth", "heroine" ⊅ "heroin", "lucky stars" ⊅ "kys". (The drug/self-harm tokens used to
// live in UNSAFE_PHRASES and were substring-matched on the DESPACED text, which flagged ordinary
// story prose — any beat with the word "something" — as unsafe and dropped Story Mode to its offline
// default beat.)
const UNSAFE_WORDS = [
  // weapons / violence
  'gun',
  'guns',
  'gunshot',
  'shooting',
  'bomb',
  'grenade',
  'explosive',
  'rape',
  'molest',
  // self-harm / drugs
  'kys',
  'suicide',
  'heroin',
  'cocaine',
  'meth',
  'overdose',
]

// Multi-word unsafe phrases, matched as a word SEQUENCE with flexible whitespace and word-boundary
// anchors (so normal spacing is caught without collapsing across unrelated words).
const UNSAFE_PHRASES = [
  'kill yourself',
  'self harm',
  'cut myself',
  'cutting myself',
  'make a bomb',
  'build a bomb',
  'make a pipe bomb',
  'pipe bomb',
  'school shooting',
  'shoot up the',
  'how to kill',
]

// Despaced forms of the LONG, distinctive phrases — used ONLY on untrusted INPUT to also catch
// deliberate spacing/leetspeak evasion ("s e l f h a r m", "killyourself"). They are long enough not
// to be substrings of ordinary words. NOT used on model OUTPUT (the model isn't evading), which is
// what makes dropping the cross-word substring matching safe there.
const UNSAFE_DESPACED = [
  'killyourself',
  'selfharm',
  'cutmyself',
  'cuttingmyself',
  'makeabomb',
  'buildabomb',
  'makeapipebomb',
  'schoolshooting',
  'howtokill',
]

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

// Match a multi-word phrase as a whitespace-separated word sequence (word-boundary anchored), so
// "make a bomb" hits "...make a bomb..." while nothing collapses across unrelated words.
const matchesPhrase = (spaced: string, phrase: string): boolean =>
  new RegExp(`\\b${phrase.split(' ').join('\\s+')}\\b`).test(spaced)

// Aggressive profanity check (leetspeak + spaced-out evasion) for UNTRUSTED user input.
export function containsProfanity(text: string): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false
  const spaced = normalizeSpaced(text)
  const collapsed = despace(text)
  return PROFANITY.some((word) => matchesWord(spaced, word) || collapsed.includes(word))
}

// Self-harm / weapons / drugs / abuse check for UNTRUSTED user input. Single terms + phrases use
// word boundaries (no cross-word false positives), and the long despaced forms add evasion-catching
// on INPUT only.
export function containsUnsafeContent(text: string): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false
  const spaced = normalizeSpaced(text)
  const collapsed = despace(text)
  if (UNSAFE_WORDS.some((word) => matchesWord(spaced, word))) return true
  if (UNSAFE_PHRASES.some((phrase) => matchesPhrase(spaced, phrase))) return true
  return UNSAFE_DESPACED.some((phrase) => collapsed.includes(phrase))
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

// Output moderation runs on the model's narrative/labels before display. The model is not trying to
// evade, so EVERYTHING uses word-boundary matching (single terms) or whitespace-anchored phrase
// matching — never the despaced cross-word substring check used for untrusted input. This avoids the
// Scunthorpe-style false positives ("begun" ⊅ "gun", "something" ⊅ "meth", "heroine" ⊅ "heroin",
// "lucky stars" ⊅ "kys") that previously discarded safe beats and forced the offline default text.
export function moderateOutput(text: string): ModerationResult {
  if (typeof text !== 'string') return { ok: false, reason: 'empty' }
  const spaced = normalizeSpaced(text)
  if (PROFANITY.some((word) => matchesWord(spaced, word))) return { ok: false, reason: 'profanity' }
  if (UNSAFE_WORDS.some((word) => matchesWord(spaced, word))) return { ok: false, reason: 'unsafe' }
  if (UNSAFE_PHRASES.some((phrase) => matchesPhrase(spaced, phrase))) return { ok: false, reason: 'unsafe' }
  return { ok: true }
}

export function isOutputSafe(text: string): boolean {
  return moderateOutput(text).ok
}
