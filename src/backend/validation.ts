// Runtime guards, normalizers, and sign-up validation that defend the local store against untrusted JSON.

import type {
  AttemptEvent,
  ChapterBeat,
  CustomCharacter,
  LessonId,
  LessonProgress,
  LessonScore,
  MainCharacterSource,
  SkillMastery,
  StepResult,
  StoryInterestId,
  StorySegment,
  StorySession,
  StorySessionStatus,
  StoryTheme,
  ThemedQuestion,
  UserProfile,
} from '../domain'
import { lessons } from '../domain'
import { isValidEmail, validateDisplayName } from '../authValidation'
import {
  isKnownBackstoryId,
  isKnownPersonalityId,
  MAX_CHARACTER_NAME_LEN,
  MAX_CUSTOM_CHARACTERS,
} from '../story/characterPresets'
import { isSceneId } from '../story/scenery'
import type { LocalDatabase, LocalUser, SignUpInput } from './types'

export const emptyDatabase = (): LocalDatabase => ({
  users: {},
  progress: {},
  mastery: {},
  attempts: [],
  story: {},
  storyActive: {},
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isLessonId = (value: unknown): value is LessonId =>
  isString(value) && value in lessons

const isStepResult = (value: unknown): value is StepResult => {
  if (!isRecord(value)) return false

  return (
    typeof value.correct === 'boolean' &&
    isNumber(value.attempts) &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 0 &&
    isString(value.feedback)
  )
}

const isLessonScore = (value: unknown): value is LessonScore => {
  if (!isRecord(value)) return false

  return (
    isNumber(value.scorePercent) &&
    Number.isInteger(value.scorePercent) &&
    value.scorePercent >= 0 &&
    value.scorePercent <= 100 &&
    isNumber(value.correctFirstTryCount) &&
    Number.isInteger(value.correctFirstTryCount) &&
    value.correctFirstTryCount >= 0 &&
    isNumber(value.assessedStepCount) &&
    Number.isInteger(value.assessedStepCount) &&
    value.assessedStepCount >= 0 &&
    value.correctFirstTryCount <= value.assessedStepCount &&
    isString(value.completedAt)
  )
}

const normalizeRecordWith = <Value>(
  value: unknown,
  normalize: (candidate: unknown) => Value | null,
): Record<string, Value> => {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, Value>>((record, [key, candidate]) => {
    const normalized = normalize(candidate)
    if (normalized !== null) {
      record[key] = normalized
    }

    return record
  }, {})
}

export const normalizeUserProfile = (value: unknown): UserProfile | null => {
  if (!isRecord(value)) return null

  if (
    !isString(value.id) ||
    !isString(value.email) ||
    !isString(value.displayName) ||
    !isString(value.createdAt) ||
    (value.avatarUrl !== undefined && !isString(value.avatarUrl))
  ) {
    return null
  }

  return {
    id: value.id,
    email: value.email,
    displayName: value.displayName,
    ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}),
    ...(typeof value.emailVerified === 'boolean' ? { emailVerified: value.emailVerified } : {}),
    createdAt: value.createdAt,
  }
}

// Local-only variant of normalizeUserProfile that additionally preserves the salted password
// credential so stored hashes survive a reload. Plaintext `password` is intentionally never copied.
export const normalizeLocalUser = (value: unknown): LocalUser | null => {
  const profile = normalizeUserProfile(value)
  if (!profile || !isRecord(value)) return null

  return {
    ...profile,
    ...(typeof value.passwordHash === 'string' ? { passwordHash: value.passwordHash } : {}),
    ...(typeof value.passwordSalt === 'string' ? { passwordSalt: value.passwordSalt } : {}),
  }
}

const normalizeStepResults = (
  value: unknown,
  lessonId: LessonId,
): Record<string, StepResult> => {
  if (!isRecord(value)) return {}

  const validStepIds = new Set(lessons[lessonId].steps.map((step) => step.id))

  return Object.entries(value).reduce<Record<string, StepResult>>((results, [stepId, result]) => {
    if (validStepIds.has(stepId) && isStepResult(result)) {
      results[stepId] = result
    }

    return results
  }, {})
}

export const normalizeLessonProgress = (value: unknown): LessonProgress | null => {
  if (!isRecord(value)) return null
  if (!isString(value.userId) || !isLessonId(value.lessonId)) return null
  if (
    value.status !== 'notStarted' &&
    value.status !== 'inProgress' &&
    value.status !== 'completed'
  ) {
    return null
  }
  if (!isNumber(value.currentStepIndex) || !Number.isInteger(value.currentStepIndex)) return null

  const lesson = lessons[value.lessonId]
  if (value.currentStepIndex < 0 || value.currentStepIndex >= lesson.steps.length) return null
  if (!isString(value.startedAt) || !isString(value.updatedAt)) return null
  if (value.completedAt !== undefined && !isString(value.completedAt)) return null
  const completionHistory = Array.isArray(value.completionHistory)
    ? value.completionHistory.filter(isLessonScore)
    : []

  return {
    userId: value.userId,
    lessonId: value.lessonId,
    status: value.status,
    currentStepIndex: value.currentStepIndex,
    stepResults: normalizeStepResults(value.stepResults, value.lessonId),
    ...(isLessonScore(value.latestScore) ? { latestScore: value.latestScore } : {}),
    ...(isLessonScore(value.bestScore) ? { bestScore: value.bestScore } : {}),
    ...(completionHistory.length > 0 ? { completionHistory } : {}),
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    ...(value.completedAt ? { completedAt: value.completedAt } : {}),
  }
}

export const isSkillMastery = (value: unknown): value is SkillMastery => {
  if (!isRecord(value)) return false

  return (
    isString(value.userId) &&
    isString(value.skillId) &&
    isNumber(value.score) &&
    isNumber(value.attempts) &&
    isNumber(value.correct) &&
    isString(value.lastPracticedAt)
  )
}

export const isAttemptEvent = (value: unknown): value is AttemptEvent => {
  if (!isRecord(value)) return false

  return (
    isString(value.id) &&
    isString(value.userId) &&
    isString(value.lessonId) &&
    isString(value.stepId) &&
    typeof value.correct === 'boolean' &&
    isNumber(value.attemptCount) &&
    isNumber(value.msToAnswer) &&
    isString(value.at)
  )
}

// Free-text interest is capped at 80 chars per the StoryTheme contract; over-long input is
// repaired by truncation rather than dropping the whole theme.
const STORY_FREEFORM_MAX_LENGTH = 80

// Coerce a counter to a non-negative integer. Non-finite/negative values repair to 0 so the
// checkpoint cadence and lifetime totals can never go backwards from corrupt input.
const normalizeStoryCount = (value: unknown): number =>
  isNumber(value) && value >= 0 ? Math.floor(value) : 0

// Persistence-layer hygiene for user free text: collapse ASCII C0 + DEL + C1 control characters
// (and the whitespace they leave) so neither raw control bytes nor stray whitespace can ride
// through storage into a prompt. Deep teen-safety moderation is the UI/prompt layers' job; this
// normalizer only guarantees type + length + control-char safety on reload.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g

const collapseControlAndSpace = (text: string): string =>
  text.replace(CONTROL_CHAR_PATTERN, ' ').replace(/\s+/g, ' ').trim()

// Sanitize then cap a scalar free-text field (character/main-character names).
const sanitizeScalarText = (text: string, maxLength: number): string =>
  collapseControlAndSpace(text).slice(0, maxLength).trim()

// "Coerce to string" for an id/name: keep strings, stringify finite numbers, else give up (null).
const coerceScalarString = (value: unknown): string | null =>
  isString(value) ? value : isNumber(value) ? String(value) : null

// Repair one custom character. Returns null (so the entry is filtered out, mirroring how
// malformed segments/history entries are dropped) when it is not a record or lacks a usable
// id/name. `name` is sanitized + capped; only KNOWN preset ids survive for personality/backstory.
const normalizeCustomCharacter = (value: unknown): CustomCharacter | null => {
  if (!isRecord(value)) return null
  const rawId = coerceScalarString(value.id)
  const rawName = coerceScalarString(value.name)
  if (rawId === null || rawName === null) return null
  const id = collapseControlAndSpace(rawId)
  const name = sanitizeScalarText(rawName, MAX_CHARACTER_NAME_LEN)
  if (id === '' || name === '') return null
  const personalityId =
    isString(value.personalityId) && isKnownPersonalityId(value.personalityId)
      ? value.personalityId
      : undefined
  const backstoryId =
    isString(value.backstoryId) && isKnownBackstoryId(value.backstoryId) ? value.backstoryId : undefined

  return {
    id,
    name,
    ...(personalityId ? { personalityId } : {}),
    ...(backstoryId ? { backstoryId } : {}),
  }
}

// The supporting cast: a coerced `CustomCharacter[]` capped at MAX_CUSTOM_CHARACTERS. Returns
// undefined when the field is absent / not an array so the key stays OMITTED (keeping the theme a
// structural identity for sessions that never set custom characters).
const normalizeCustomCharacters = (value: unknown): CustomCharacter[] | undefined => {
  if (!Array.isArray(value)) return undefined
  return value
    .map(normalizeCustomCharacter)
    .filter((character): character is CustomCharacter => character !== null)
    .slice(0, MAX_CUSTOM_CHARACTERS)
}

const MAIN_CHARACTER_SOURCES: readonly MainCharacterSource[] = ['displayName', 'random', 'custom']

// Coerce the main-character source to the enum. Absent stays undefined (omitted -> consumers read
// it as the default 'random'); a PRESENT-but-invalid value is repaired to 'random'.
const normalizeMainCharacterSource = (value: unknown): MainCharacterSource | undefined => {
  if (value === undefined) return undefined
  return isString(value) && (MAIN_CHARACTER_SOURCES as readonly string[]).includes(value)
    ? (value as MainCharacterSource)
    : 'random'
}

// Theme is always repaired (never the cause of a dropped session): coerce each field to its
// safe shape and keep only string interest ids / a string free-text within the length cap. The
// custom-character additions are all OPTIONAL and only emitted when present in the input, so a
// theme that never used them normalizes to exactly its original shape (round-trip identity).
const normalizeStoryTheme = (value: unknown): StoryTheme => {
  if (!isRecord(value)) {
    return { interestIds: [], premise: '', protagonist: '' }
  }

  const interestIds = (
    Array.isArray(value.interestIds) ? value.interestIds.filter(isString) : []
  ) as StoryInterestId[]
  const freeformInterest = isString(value.freeformInterest)
    ? value.freeformInterest.slice(0, STORY_FREEFORM_MAX_LENGTH)
    : undefined

  const characters = normalizeCustomCharacters(value.characters)
  const mainCharacterSource = normalizeMainCharacterSource(value.mainCharacterSource)
  const mainCharacterName = isString(value.mainCharacterName)
    ? sanitizeScalarText(value.mainCharacterName, MAX_CHARACTER_NAME_LEN)
    : undefined

  return {
    interestIds,
    ...(freeformInterest !== undefined ? { freeformInterest } : {}),
    premise: isString(value.premise) ? value.premise : '',
    protagonist: isString(value.protagonist) ? value.protagonist : '',
    ...(characters !== undefined ? { characters } : {}),
    ...(mainCharacterSource !== undefined ? { mainCharacterSource } : {}),
    ...(mainCharacterName !== undefined ? { mainCharacterName } : {}),
  }
}

// One narrative beat. A malformed beat is dropped from the array (returns null) instead of
// dropping the whole session, mirroring how `normalizeStepResults` filters bad entries.
const normalizeStorySegment = (value: unknown): StorySegment | null => {
  if (!isRecord(value)) return null
  if (!isNumber(value.index) || !Number.isInteger(value.index) || value.index < 0) return null
  if (!isString(value.text)) return null
  if (!isString(value.createdAt)) return null
  if (value.userChoice !== undefined && !isString(value.userChoice)) return null

  // The matched background image is OPTIONAL and only kept when it is a KNOWN catalog id (so a
  // renamed/removed asset or stray value drops to "no image" rather than rendering a broken src),
  // mirroring how preset character ids are kept only when known.
  return {
    index: value.index,
    text: value.text,
    ...(isString(value.userChoice) ? { userChoice: value.userChoice } : {}),
    ...(isSceneId(value.sceneId) ? { sceneId: value.sceneId } : {}),
    createdAt: value.createdAt,
  }
}

// One persisted chapter opening-beat snapshot. A malformed beat is dropped from the array (returns
// null) instead of dropping the whole session, mirroring `normalizeStorySegment`. The `chapter` is
// a 1-based integer; `sceneId` is kept ONLY when it is a KNOWN catalog id (omitted otherwise).
const normalizeChapterBeat = (value: unknown): ChapterBeat | null => {
  if (!isRecord(value)) return null
  if (!isNumber(value.chapter) || !Number.isInteger(value.chapter) || value.chapter < 1) return null
  if (!isString(value.text)) return null

  return {
    chapter: value.chapter,
    text: value.text,
    ...(isSceneId(value.sceneId) ? { sceneId: value.sceneId } : {}),
    ...(isString(value.userChoice) ? { userChoice: value.userChoice } : {}),
    ...(isString(value.outcomeText) ? { outcomeText: value.outcomeText } : {}),
    ...(isSceneId(value.outcomeSceneId) ? { outcomeSceneId: value.outcomeSceneId } : {}),
  }
}

// Rethemed label list ({ id, label }[]) for mcq/operation-choice options or sequence tiles.
// Returns undefined when the field is absent (so it stays omitted) and filters bad entries.
const normalizeThemedLabels = (
  value: unknown,
): { id: string; label: string }[] | undefined => {
  if (!Array.isArray(value)) return undefined

  return value
    .filter(
      (item): item is { id: string; label: string } =>
        isRecord(item) && isString(item.id) && isString(item.label),
    )
    .map((item) => ({ id: item.id, label: item.label }))
}

// The currently-served themed question. Returns null (so the field is omitted) when the source
// identity or required display fields are unusable; the controller then simply selects a new
// question on resume. The answer key is never stored here, so this only guards display text.
const normalizeThemedQuestion = (value: unknown): ThemedQuestion | null => {
  if (!isRecord(value)) return null
  if (!isLessonId(value.sourceLessonId)) return null
  if (!isString(value.sourceStepId)) return null
  if (!isString(value.stepType)) return null
  if (!isString(value.themedPrompt)) return null
  if (typeof value.themed !== 'boolean') return null
  if (!isString(value.generatedAt)) return null

  const themedOptions = normalizeThemedLabels(value.themedOptions)
  const themedTiles = normalizeThemedLabels(value.themedTiles)
  // The number-variation seed is optional and only kept when it is a non-negative integer (a
  // valid uint32 PRNG seed). A bad/absent seed is simply dropped — the question stays valid and
  // resume just rebuilds it without a variant, never with a wrong answer key.
  const variantSeed =
    isNumber(value.variantSeed) && Number.isInteger(value.variantSeed) && value.variantSeed >= 0
      ? value.variantSeed
      : undefined
  // Question-architecture fields are OPTIONAL/back-compatible: each is kept only when valid and
  // otherwise dropped (never rejecting the whole question), so a legacy question that sets
  // neither normalizes to exactly its original shape. `architectureId` must be a non-empty
  // string; `paramSeed` mirrors the `variantSeed` repair (a non-negative integer uint32 seed).
  const architectureId =
    isString(value.architectureId) && value.architectureId !== '' ? value.architectureId : undefined
  const paramSeed =
    isNumber(value.paramSeed) && Number.isInteger(value.paramSeed) && value.paramSeed >= 0
      ? value.paramSeed
      : undefined

  return {
    sourceLessonId: value.sourceLessonId,
    sourceStepId: value.sourceStepId,
    stepType: value.stepType as ThemedQuestion['stepType'],
    themedPrompt: value.themedPrompt,
    ...(themedOptions !== undefined ? { themedOptions } : {}),
    ...(themedTiles !== undefined ? { themedTiles } : {}),
    themed: value.themed,
    ...(variantSeed !== undefined ? { variantSeed } : {}),
    ...(architectureId !== undefined ? { architectureId } : {}),
    ...(paramSeed !== undefined ? { paramSeed } : {}),
    generatedAt: value.generatedAt,
  }
}

// An ordered list of persisted themed questions (the back/forward review history). Malformed
// entries are filtered out rather than dropping the whole session, mirroring `segments`.
const normalizeQuestionHistory = (value: unknown): ThemedQuestion[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeThemedQuestion)
    .filter((question): question is ThemedQuestion => question !== null)
}

// The stable id used for a MIGRATED legacy session (one that was stored single-per-user under
// the old `story/{userId}` shape with no `id`). Deterministic from the userId so repeated
// migrations are idempotent (the same legacy doc always maps to the same library id).
export const legacyStorySessionId = (userId: string): string => `legacy-${userId}`

// A unique, Firestore-safe session id used only as a last-resort repair when a persisted
// session has neither an `id` nor a fallback. Mirrors the reducer/backend generators; kept
// local so validation does not import the React/runtime layers.
const generateStorySessionId = (): string => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return `story-${cryptoApi.randomUUID()}`
  return `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Full per-field normalizer/repairer for a persisted Story Mode session, modeled on
// `normalizeLessonProgress`. The session is dropped (null) only when its identity is unusable
// (not a record, or no string `userId`); every other field is repaired to a safe value or its
// bad sub-entries filtered out, and the function never throws on untrusted JSON.
//
// `fallbackId` supplies the session `id` when the stored value has none — used by the
// legacy->library migration (the old single-session doc had no id) and by the Firestore reader
// (the document id). With no stored id and no fallback, a fresh id is minted.
export const normalizeStorySession = (value: unknown, fallbackId?: string): StorySession | null => {
  if (!isRecord(value)) return null
  if (!isString(value.userId)) return null

  const id =
    isString(value.id) && value.id.trim()
      ? value.id
      : fallbackId && fallbackId.trim()
        ? fallbackId
        : generateStorySessionId()

  const status: StorySessionStatus = value.status === 'ended' ? 'ended' : 'active'
  const currentQuestion = normalizeThemedQuestion(value.currentQuestion)
  const segments = Array.isArray(value.segments)
    ? value.segments
        .map(normalizeStorySegment)
        .filter((segment): segment is StorySegment => segment !== null)
    : []
  // Persisted chapter opening-beats are OPTIONAL/additive: filter out malformed entries and OMIT
  // the field entirely when none survive, so legacy sessions (no beats) round-trip unchanged.
  const chapterBeats = Array.isArray(value.chapterBeats)
    ? value.chapterBeats.map(normalizeChapterBeat).filter((beat): beat is ChapterBeat => beat !== null)
    : []

  // History seeds from `currentQuestion` for legacy/v1 sessions that never tracked it, so resume
  // still has a one-entry review history at the live edge. The index is clamped into range and
  // defaults to the live edge (last) when missing/out of range.
  let history = normalizeQuestionHistory(value.history)
  if (history.length === 0 && currentQuestion) history = [currentQuestion]
  const lastIndex = history.length > 0 ? history.length - 1 : 0
  const rawIndex =
    isNumber(value.historyIndex) && Number.isInteger(value.historyIndex) ? value.historyIndex : lastIndex
  const historyIndex = Math.min(Math.max(rawIndex, 0), lastIndex)

  return {
    id,
    userId: value.userId,
    theme: normalizeStoryTheme(value.theme),
    status,
    questionsSolvedTotal: normalizeStoryCount(value.questionsSolvedTotal),
    questionsSinceCheckpoint: normalizeStoryCount(value.questionsSinceCheckpoint),
    ...(currentQuestion ? { currentQuestion } : {}),
    history,
    historyIndex,
    servedStepIds: Array.isArray(value.servedStepIds)
      ? value.servedStepIds.filter(isString)
      : [],
    segments,
    ...(chapterBeats.length > 0 ? { chapterBeats } : {}),
    narrativeSummary: isString(value.narrativeSummary) ? value.narrativeSummary : '',
    createdAt: isString(value.createdAt) ? value.createdAt : new Date().toISOString(),
    updatedAt: isString(value.updatedAt) ? value.updatedAt : new Date().toISOString(),
    schemaVersion: 2,
  }
}

// Normalize the whole Story library (the `story` map + the `storyActive` pointers) and migrate
// legacy single-per-user sessions in one pass. Returns the new-shape `story` (keyed by
// sessionId) and `storyActive` (userId -> sessionId).
//
// Migration: in the legacy shape the `story` map was keyed by userId and the session had no
// `id`. Such an entry is detected (no own `id`), given a deterministic `legacy-<userId>` id, and
// kept as that user's first saved story; if the user has no explicit active pointer it becomes
// active. Already-migrated entries (with their own `id`) pass through unchanged.
export const normalizeStoryLibrary = (
  rawStory: unknown,
  rawActive: unknown,
): { story: Record<string, StorySession>; storyActive: Record<string, string> } => {
  const story: Record<string, StorySession> = {}
  const derivedActive: Record<string, string> = {}

  if (isRecord(rawStory)) {
    for (const [key, candidate] of Object.entries(rawStory)) {
      const ownId = isRecord(candidate) && isString(candidate.id) && candidate.id.trim() ? candidate.id.trim() : null
      const isLegacy = ownId === null
      // Legacy entries are keyed by userId, so derive a stable legacy id from that key.
      const session = normalizeStorySession(candidate, ownId ?? legacyStorySessionId(key))
      if (!session) continue
      story[session.id] = session
      if (isLegacy && !(session.userId in derivedActive)) {
        derivedActive[session.userId] = session.id
      }
    }
  }

  const storyActive: Record<string, string> = {}
  // Explicit pointers win, but only when they reference an existing session owned by that user.
  if (isRecord(rawActive)) {
    for (const [userId, sessionId] of Object.entries(rawActive)) {
      if (isString(sessionId) && story[sessionId]?.userId === userId) {
        storyActive[userId] = sessionId
      }
    }
  }
  // Fill in derived legacy pointers only where the user has no explicit one.
  for (const [userId, sessionId] of Object.entries(derivedActive)) {
    if (!(userId in storyActive)) storyActive[userId] = sessionId
  }

  return { story, storyActive }
}

export const normalizeDatabase = (value: unknown): LocalDatabase => {
  if (!isRecord(value)) return emptyDatabase()

  const { story, storyActive } = normalizeStoryLibrary(value.story, value.storyActive)

  return {
    users: normalizeRecordWith(value.users, normalizeLocalUser),
    progress: normalizeRecordWith(value.progress, normalizeLessonProgress),
    mastery: normalizeRecordWith(value.mastery, (candidate) =>
      isSkillMastery(candidate) ? candidate : null,
    ),
    attempts: Array.isArray(value.attempts) ? value.attempts.filter(isAttemptEvent) : [],
    story,
    storyActive,
  }
}

export const validateSignUpInput = (input: SignUpInput) => {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()

  if (!email) {
    throw new Error('Email is required.')
  }
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.')
  }
  if (!displayName) {
    throw new Error('Display name is required.')
  }

  return { email, displayName }
}

// Trim + validate a display name for the update-profile flow, reusing the shared auth rule so
// account creation and editing enforce identical non-empty/length constraints. Mirrors
// `validateSignUpInput`: returns the normalized (trimmed) name, or throws a user-facing error.
export const validateDisplayNameInput = (name: string): string => {
  const error = validateDisplayName(name)
  if (error) {
    throw new Error(error)
  }

  return name.trim()
}
