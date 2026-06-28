// Story Mode controller hook (plan section 6.3).
//
// This is the React seam that wires the PURE pieces together: the session reducer
// (`storySessionReducer`), the question-architecture bank (`selectNextArchitecture` +
// `generateForArchitecture` — Story Mode pulls code-graded questions from the bank, NOT reused
// lesson steps), the LLM adapter (`createStoryAI`), the re-theme reconstructor (`applyRetheme`),
// the teen-safety helpers (`safety`), and the `story` persistence repository. The LLM only ever
// re-themes the DISPLAY TEXT; the answer key always comes from code. It persists the session after every
// transition, guards against double calls with `storyBusy`, pre-fetches the next themed question
// while the learner answers, resumes by re-hydrating the persisted question, and compacts the
// narrative once it grows past a threshold.
//
// PRACTICE INVARIANT (Phase 3, narrowed): Story Mode NEVER writes LessonProgress or the lesson
// `mastery` ratio, so lesson grading/unlocks are unaffected. It DOES now write a DEDICATED,
// separate learning-science store — per-skill `practice` state (spaced repetition + recency-weighted
// mastery estimate) and `source:'story'` attempt events — plus its own session via
// `saveStorySession`. Results from the reused step views are routed here: `recordPracticeAttempt`
// captures the FIRST-try retrieval signal, and `submitQuestionResult` advances the loop on a correct
// answer — never to `LearningApp.completeStep`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChapterBeat,
  LessonStep,
  StorySession,
  StoryTheme,
  ThemedQuestion,
  UserProfile,
} from '../domain'
import type { AttemptEvent, SkillMastery, SkillPracticeState } from '../domain'
import type { Backend } from '../backend'
import { createAttemptEvent } from '../backend'
import {
  createVariantSeed,
  generateForArchitecture,
  isThemedStepCoherent,
  selectNextArchitecture,
  skillForArchitecture,
} from '../engine'
import type { ProgressByLesson } from '../engine'
import { applyRetheme } from './applyRetheme'
import { questionKey, rehydrateQuestion, toThemedQuestion } from './rehydrateQuestion'
import { createStoryAI, type StoryAiEnv } from './createStoryAI'
import { resolveProtagonist } from './resolveMainCharacter'
import { themeWithSceneSetting } from './scenePremise'
import { selectSceneForBeat } from './selectSceneForBeat'
import type { RethemeResult, StoryAI } from './storyAi'
import { RETHEME_FALLBACK, fallbackProtagonist } from './storyPrompts'
import { isOutputSafe, moderateUserInput } from './safety'
import {
  buildCompactionNarrative,
  buildRethemeRequest,
  choiceRejectionMessage,
  isProviderConfigured,
  matcherFor,
  messageFrom,
  newestRecapChapter,
  previousSceneId,
  resolveBeatText,
  sceneForBeat,
  themedStepText,
} from './storyBeats'
import { sortStorySessionsByRecent } from './storyLibrary'
import {
  CHECKPOINT_INTERVAL,
  KEEP_VERBATIM_SEGMENTS,
  appendSegment,
  canReviewBackChapter,
  canReviewForwardChapter,
  canReviewStepBack,
  canReviewStepForward,
  chapterBeatFor,
  clearCurrentQuestion,
  compactNarrative,
  createInitialSession,
  createStorySessionId,
  displayedChapter,
  displayedQuestion,
  endSession,
  isAtLiveEdge,
  isAwaitingOutcomeAck,
  isCheckpointDue,
  isLiveReviewPos,
  jumpToLiveEdge,
  latestChapter,
  recentNarrative,
  recordChapterBeat,
  recordChapterOutcome,
  recordSolved,
  resetCheckpoint,
  rethemeNarrative,
  reviewChapterStart,
  reviewStepBack,
  reviewStepForward,
  setCurrentQuestion,
  setLatestSegmentChoice,
  setStoryBible,
  withHistoryIndex,
  type StoryReviewPos,
} from './storySessionReducer'

// The Story Mode screens the hook drives via the injected `navigate` callback.
export type StoryView =
  | 'story-interests'
  | 'story-intro'
  | 'story-question'
  | 'story-checkpoint'
  | 'story-outcome'
  | 'story-library'

type UseStorySessionInput = {
  backend: Backend
  user: UserProfile | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  attempts: AttemptEvent[]
  // Per-skill Story Mode practice state (Phase 3): drives spaced-repetition due-first selection,
  // interleaving, the overdue boost, and (later) the mastery meters. Read-only here.
  practice: SkillPracticeState[]
  navigate: (view: StoryView) => void
  // Called after Story Mode writes a practice signal (a retrieval attempt), so the app can re-read
  // the learner data (attempts/practice) that drives the next question's selection. Optional so the
  // hook stays usable without it (e.g. in isolation/tests).
  onLearnerDataChanged?: () => void | Promise<void>
}

export type UseStorySession = {
  session: StorySession | null
  // Every saved story for the active user (most-recently-played first), for the library UI.
  library: StorySession[]
  savedCount: number
  currentStep: LessonStep | null
  currentThemed: boolean
  // True while the learner is reviewing a PAST (already-answered) question read-only.
  reviewing: boolean
  // True while Back has landed on a chapter's STORY TEXT (read-only narrative review).
  showingChapterText: boolean
  // The chapter beat currently under review (set only while showingChapterText), else null.
  chapterText: ChapterBeat | null
  // The read-only "look back at the story" overlay used by the checkpoint/outcome screens (which
  // have no inline review). It pages through CHAPTER RECAPS (setup -> choice -> outcome). `canReview`
  // gates the "Look back" entry; open/close toggle the overlay; back/forward move one chapter.
  reviewActive: boolean
  canReview: boolean
  openReview: () => void
  closeReview: () => void
  recapBeat: ChapterBeat | null
  recapChapter: number
  recapChapterCount: number
  canRecapBack: boolean
  canRecapForward: boolean
  recapBack: () => void
  recapForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  // The chapter currently on display + the highest chapter reached, plus whether a previous/next
  // chapter exists to jump to (a pure view over the question history; see storySessionReducer).
  chapter: number
  chapterCount: number
  canGoBackChapter: boolean
  canGoForwardChapter: boolean
  storyBusy: boolean
  storyError: string
  providerConfigured: boolean
  hasActiveSession: boolean
  questionNumberInChapter: number
  openStory: () => Promise<void>
  openLibrary: () => Promise<void>
  startNewStory: () => Promise<void>
  switchToStory: (sessionId: string) => Promise<void>
  deleteStory: (sessionId: string) => Promise<void>
  beginAdventure: (theme: StoryTheme) => Promise<void>
  // Records the FIRST-try retrieval signal for the live question (correct/incorrect). Idempotent per
  // question, no-op while reviewing — see the controller for details.
  recordPracticeAttempt: (correct: boolean) => void
  submitQuestionResult: () => Promise<void>
  submitCheckpointChoice: (text: string) => Promise<void>
  continueFromOutcome: () => Promise<void>
  goBack: () => void
  goForward: () => void
  goBackChapter: () => void
  goForwardChapter: () => void
  endStory: () => Promise<void>
  dismissError: () => void
}

// Vite injects VITE_* at build; the cast mirrors src/firebaseConfig.ts. Read once at module
// scope so the provider check never re-evaluates per render.
const STORY_AI_ENV = import.meta.env as unknown as StoryAiEnv

// Once the narrative passes this many beats, fold the older ones into the rolling summary so
// each prompt stays cheap (plan section 8). KEEP_VERBATIM_SEGMENTS lives in the reducer alongside
// the pure `recentNarrative`/`rethemeNarrative` builders that consume it.
const COMPACT_THRESHOLD = 6

// Safe, offline premise fallback used when no provider is configured or a generation fails/blocks.
// The opening/bridge/outcome BEAT fallbacks are theme-aware and distinct-per-beat (storyFallbackBeat
// in storyPrompts), so a failed continuation can never reprint the opening verbatim, and the
// protagonist fallback is interest-aware (fallbackProtagonist) instead of a hardcoded "the Explorer".
const DEFAULT_PREMISE = 'A bright new adventure stretches out ahead, full of puzzles to solve.'

const nowIso = (): string => new Date().toISOString()

export function useStorySession({
  backend,
  user,
  progressByLesson,
  mastery,
  attempts,
  practice,
  navigate,
  onLearnerDataChanged,
}: UseStorySessionInput): UseStorySession {
  const [session, setSession] = useState<StorySession | null>(null)
  const [library, setLibrary] = useState<StorySession[]>([])
  const [storyBusy, setStoryBusy] = useState(false)
  const [storyError, setStoryError] = useState('')
  // Transient (never persisted) review flag: true while Back has surfaced a chapter's story text.
  const [showingChapterText, setShowingChapterText] = useState(false)
  // Transient: true while the read-only "look back at the story" overlay is open. It lets the
  // checkpoint/outcome screens (which have no inline review) page back through earlier chapter
  // recaps, then Return. The question screen reviews inline via Back and never sets this.
  const [reviewActive, setReviewActive] = useState(false)
  // Which chapter's recap the overlay currently shows (meaningful only while reviewActive).
  const [recapChapter, setRecapChapter] = useState(1)

  // Synchronous guard against double-generation (state updates lag a render behind).
  const busyRef = useRef(false)
  // Always-current session for callbacks handed to reused step views (avoids stale closures).
  const sessionRef = useRef<StorySession | null>(null)
  // Always-current chapter-text review flag for callbacks (mirrors sessionRef; avoids stale closures).
  const showingChapterTextRef = useRef(false)
  // Lazily-created StoryAI promise so the SDK only loads when Story Mode actually generates.
  const aiPromiseRef = useRef<Promise<StoryAI | null> | null | undefined>(undefined)
  // The next themed question, pre-fetched while the learner answers the current one.
  const prefetchRef = useRef<Promise<ThemedQuestion | null> | null>(null)
  // Practice capture (Phase 3): when the live question became visible (for answer latency), the
  // signature of the question whose FIRST attempt was already recorded (so a multi-try question
  // records exactly one retrieval), and an always-current ref to the learner-data refresh callback.
  const questionShownAtRef = useRef(0)
  const lastRecordedQuestionRef = useRef<string | null>(null)
  // Keep the latest refresh callback in a ref (updated in an effect, never during render) so the
  // stable `recordPracticeAttempt` can call it without taking it as a dependency.
  const onLearnerDataChangedRef = useRef(onLearnerDataChanged)
  useEffect(() => {
    onLearnerDataChangedRef.current = onLearnerDataChanged
  }, [onLearnerDataChanged])

  const providerConfigured = useMemo(() => isProviderConfigured(STORY_AI_ENV), [])

  const commitSession = useCallback((next: StorySession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  // Stamp when the live question became visible so `recordPracticeAttempt` can derive answer latency.
  const markQuestionShown = useCallback(() => {
    questionShownAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
  }, [])

  // Record the FIRST graded submit of the LIVE question as one retrieval (Phase 3). First-try
  // correctness is the retrieval-practice signal, so only the first attempt per question is captured
  // (keyed by session + question + solve count); later retries of the SAME question are ignored, and
  // reviewing a past question never records. Writes the dedicated `practice` state (spaced repetition
  // + mastery estimate) and a `source:'story'` attempt event, then asks the app to refresh the
  // learner data that feeds the next selection. Never throws into the play loop.
  const recordPracticeAttempt = useCallback(
    (correct: boolean) => {
      const current = sessionRef.current
      if (!user || !current || !current.currentQuestion || !isAtLiveEdge(current)) return
      const question = current.currentQuestion
      const skillId = question.architectureId ? skillForArchitecture(question.architectureId) : undefined
      if (!skillId) return
      const signature = `${current.id}:${questionKey(question)}:${current.questionsSolvedTotal}`
      if (lastRecordedQuestionRef.current === signature) return
      lastRecordedQuestionRef.current = signature
      const clock = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const msToAnswer = questionShownAtRef.current > 0 ? Math.max(0, Math.round(clock - questionShownAtRef.current)) : 0
      void (async () => {
        try {
          await Promise.all([
            backend.practice.updatePractice(user.id, skillId, { firstTryCorrect: correct }),
            backend.attempts.recordAttempt(
              createAttemptEvent(user.id, question.sourceLessonId, questionKey(question), correct, 1, msToAnswer, 'story'),
            ),
          ])
          await onLearnerDataChangedRef.current?.()
        } catch {
          // Non-fatal: capturing the practice signal must never break the play loop.
        }
      })()
    },
    [user, backend],
  )

  // Update the transient chapter-text review flag in both the ref (for callbacks) and state (render).
  const setReviewChapterText = useCallback((value: boolean) => {
    showingChapterTextRef.current = value
    setShowingChapterText(value)
  }, [])

  // Leave all review state (called on every entry/resume/new-story path so play never begins
  // mid-review). The Back/Forward handlers set the chapter-text flag explicitly instead.
  const resetReview = useCallback(() => {
    setReviewChapterText(false)
    setReviewActive(false)
  }, [setReviewChapterText])

  // Open the read-only "look back at the story" overlay at the NEWEST reviewable chapter recap. From
  // the OUTCOME screen that is the CURRENT chapter, so the first thing shown is the setup (and choice)
  // that prompted "what happens next"; from the CHECKPOINT screen it is the previous chapter. Then
  // Back/Forward page chapter-by-chapter through the story.
  const openReview = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const newest = newestRecapChapter(current)
    if (newest < 1) return
    setRecapChapter(newest)
    setReviewActive(true)
  }, [])

  // Close the overlay and return to the live screen.
  const closeReview = useCallback(() => setReviewActive(false), [])

  // Page the recap overlay back/forward one chapter at a time (clamped to [1, newest reviewable]).
  const recapBack = useCallback(() => setRecapChapter((chapter) => Math.max(1, chapter - 1)), [])
  const recapForward = useCallback(() => {
    const current = sessionRef.current
    const newest = current ? newestRecapChapter(current) : 1
    setRecapChapter((chapter) => Math.min(Math.max(newest, 1), chapter + 1))
  }, [])

  const persist = useCallback(
    async (next: StorySession) => {
      await backend.story.saveStorySession(next)
    },
    [backend],
  )

  // Reload the saved-stories library into state (most-recently-played first) and return it.
  const refreshLibrary = useCallback(
    async (userId: string): Promise<StorySession[]> => {
      try {
        const sorted = sortStorySessionsByRecent(await backend.story.listStorySessions(userId))
        setLibrary(sorted)
        return sorted
      } catch {
        setLibrary([])
        return []
      }
    },
    [backend],
  )

  const ensureAi = useCallback(async (): Promise<StoryAI | null> => {
    if (aiPromiseRef.current === undefined) {
      try {
        aiPromiseRef.current = createStoryAI(STORY_AI_ENV)
      } catch {
        aiPromiseRef.current = null
      }
    }
    const promise = aiPromiseRef.current
    if (!promise) return null
    try {
      return await promise
    } catch {
      return null
    }
  }, [])

  // Pick + re-theme the next question. Selection is pure and now draws from the code-authoritative
  // question-architecture BANK (not reused lesson steps); re-theme degrades to the canonical
  // question on any AI failure/timeout/quota/safety block (applyRetheme returns themed:false).
  const selectAndRetheme = useCallback(
    async (current: StorySession, excludeKey?: string): Promise<ThemedQuestion | null> => {
      const arch = selectNextArchitecture({
        progressByLesson,
        // Served architecture keys are `arch:<id>` (recorded on solve); legacy `${lessonId}:${stepId}`
        // entries simply never match a candidate.
        servedKeys: current.servedStepIds,
        mastery,
        attempts,
        // Phase 3: spaced-repetition due-first + interleaving + overdue/proficiency weighting.
        practice,
        now: nowIso(),
        // Exclude the on-screen question (not yet in servedStepIds, which only grows on solve) so a
        // prefetch can never re-pick the question currently being answered (the duplicate-question bug).
        ...(excludeKey ? { excludeKey } : {}),
      })
      // Null only if no architecture's required lesson is completed — preserve the "no question
      // available" empty state (the unlock gate normally guarantees at least one is eligible).
      if (!arch) return null

      // Generate the CANONICAL question FIRST: a deterministic, code-graded instance of the chosen
      // architecture, so the LLM rethemes the canonical prompt and grading uses the architecture's
      // code-computed answer key. The seed is persisted so resume rebuilds the exact same instance
      // (and key). A null result (unknown id) is treated defensively as "no question available".
      const paramSeed = createVariantSeed()
      const generated = generateForArchitecture(arch.id, paramSeed)
      if (!generated) return null
      const canonicalStep = generated.step

      const ai = await ensureAi()
      let result: RethemeResult = RETHEME_FALLBACK
      if (ai) {
        try {
          // rethemeNarrative (not plain recentNarrative) so the question chains from the PREVIOUS
          // question's scene and the committed choice/outcome — one coherent thread, not a fresh
          // scenario each time. `current` is always the latest committed state at call time.
          result = await ai.rethemeQuestion(buildRethemeRequest(current.theme, rethemeNarrative(current), canonicalStep))
        } catch {
          result = RETHEME_FALLBACK
        }
      }

      const applied = applyRetheme(canonicalStep, result)
      // Two gates before we trust the rewrite, else we show the coherent (un-themed) canonical step:
      //   - output moderation (an unsafe rewrite is dropped), and
      //   - NUMBER COHERENCE: the themed prompt/labels must state the SAME math as the canonical
      //     step, so the question, the shown equation, and the code-computed answer can never
      //     disagree (the LLM occasionally changes a number despite the "never change" instruction).
      const themed =
        applied.themed &&
        isOutputSafe(themedStepText(applied.step)) &&
        isThemedStepCoherent(canonicalStep, applied.step)
      const step = themed ? applied.step : canonicalStep
      return toThemedQuestion(arch, step, themed, paramSeed)
    },
    [progressByLesson, mastery, attempts, practice, ensureAi],
  )

  const startPrefetch = useCallback(
    (current: StorySession) => {
      // Exclude whatever question is on screen right now (if any). At a checkpoint boundary
      // `currentQuestion` is cleared, so this is undefined and the just-solved questions in
      // `servedStepIds` provide the anti-repeat instead.
      const excludeKey = current.currentQuestion ? questionKey(current.currentQuestion) : undefined
      prefetchRef.current = selectAndRetheme(current, excludeKey).catch(() => null)
    },
    [selectAndRetheme],
  )

  // Prefetch the NEXT question ONLY when it will stay within the CURRENT chapter — i.e. the live
  // question is not the last one before a checkpoint. Across a checkpoint the next question must be
  // re-themed AFTER the learner's choice + the outcome are committed (done in submitCheckpointChoice),
  // so prefetching it now would lock in a STALE, pre-choice scene (the root cause of the first
  // question of each chapter ignoring the choice). When skipped, the prefetch slot is cleared so a
  // stale one can never be consumed.
  const startPrefetchWithinChapter = useCallback(
    (current: StorySession) => {
      if (current.questionsSinceCheckpoint < CHECKPOINT_INTERVAL - 1) {
        startPrefetch(current)
      } else {
        prefetchRef.current = null
      }
    },
    [startPrefetch],
  )

  // Commit an active session and navigate to the right screen to resume it. Always snaps the
  // review pointer back to the live edge so resume continues play rather than mid-review.
  const routeToActive = useCallback(
    (loaded: StorySession) => {
      resetReview()
      const atEdge = jumpToLiveEdge(loaded)
      commitSession(atEdge)
      if (atEdge.currentQuestion && rehydrateQuestion(atEdge.currentQuestion)) {
        navigate('story-question')
        markQuestionShown()
        // Only prefetch the next question if it stays in this chapter (not across a checkpoint).
        startPrefetchWithinChapter(atEdge)
      } else if (isAwaitingOutcomeAck(atEdge)) {
        // A refresh after submitting a checkpoint action but before continuing to the next
        // question: the outcome beat is already appended and the choice recorded, so resume to
        // the outcome page (not the checkpoint, which would re-prompt) and pre-fetch the first
        // question of the new chapter against that committed choice + outcome.
        navigate('story-outcome')
        startPrefetch(atEdge)
      } else if (atEdge.segments.length > 0) {
        // A checkpoint/opening beat awaiting the learner's choice. Do NOT prefetch yet — the choice
        // (and its outcome) change the narrative, so the next question is themed in
        // submitCheckpointChoice once they are committed; prefetching now would be stale.
        navigate('story-checkpoint')
      } else {
        navigate('story-interests')
      }
    },
    [commitSession, navigate, startPrefetch, startPrefetchWithinChapter, resetReview, markQuestionShown],
  )

  const takeNextQuestion = useCallback(
    async (current: StorySession): Promise<ThemedQuestion | null> => {
      const pending = prefetchRef.current
      prefetchRef.current = null
      if (pending) {
        const prefetched = await pending
        if (prefetched) return prefetched
      }
      return selectAndRetheme(current)
    },
    [selectAndRetheme],
  )

  const maybeCompact = useCallback(
    async (current: StorySession): Promise<StorySession> => {
      if (current.segments.length <= COMPACT_THRESHOLD) return current
      const ai = await ensureAi()
      if (!ai) return current
      const narrative = buildCompactionNarrative(current)
      try {
        const summary = await ai.summarize({ narrative })
        const safeSummary = isOutputSafe(summary) && summary.trim() ? summary.trim() : current.narrativeSummary
        return compactNarrative(current, { summary: safeSummary, keepLastSegments: KEEP_VERBATIM_SEGMENTS })
      } catch {
        return current
      }
    },
    [ensureAi],
  )

  // Load the active session (via the pointer) and the library on sign-in so the entry card can
  // show Start vs Resume + a saved-stories count. Read only; it never writes. setState happens
  // only in the resolved `.then` (the recommended async-effect pattern), never synchronously.
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<{ session: StorySession | null; library: StorySession[] }> => {
      if (!user) return { session: null, library: [] }
      try {
        const [activeId, sessions] = await Promise.all([
          backend.story.getActiveStorySessionId(user.id),
          backend.story.listStorySessions(user.id),
        ])
        const active = activeId ? await backend.story.getStorySession(user.id, activeId) : null
        return { session: active, library: sortStorySessionsByRecent(sessions) }
      } catch {
        return { session: null, library: [] }
      }
    }
    void load().then(({ session: loaded, library: loadedLibrary }) => {
      if (cancelled) return
      commitSession(loaded)
      setLibrary(loadedLibrary)
    })
    return () => {
      cancelled = true
    }
  }, [user, backend, commitSession])

  // Enter Story Mode: resume the active session, else open the library if other stories exist,
  // else start fresh at interests.
  const openStory = useCallback(async () => {
    if (!user || busyRef.current) return
    busyRef.current = true
    setStoryBusy(true)
    setStoryError('')
    try {
      const [activeId, sessions] = await Promise.all([
        backend.story.getActiveStorySessionId(user.id),
        backend.story.listStorySessions(user.id),
      ])
      const sorted = sortStorySessionsByRecent(sessions)
      setLibrary(sorted)
      const loaded = activeId ? await backend.story.getStorySession(user.id, activeId) : null
      if (loaded && loaded.status === 'active') {
        routeToActive(loaded)
      } else if (sorted.length > 0) {
        commitSession(loaded ?? null)
        navigate('story-library')
      } else {
        commitSession(null)
        navigate('story-interests')
      }
    } catch (error) {
      setStoryError(messageFrom(error, 'Story Mode could not be opened.'))
      navigate('story-interests')
    } finally {
      busyRef.current = false
      setStoryBusy(false)
    }
  }, [user, backend, navigate, commitSession, routeToActive])

  // Open the saved-stories library (a fresh read so newly-saved sessions appear).
  const openLibrary = useCallback(async () => {
    if (!user) return
    setStoryError('')
    await refreshLibrary(user.id)
    navigate('story-library')
  }, [user, refreshLibrary, navigate])

  // Start a brand-new story with new interests WITHOUT losing the current one: persist the
  // current active session into the library first, then route to interest selection. The new
  // session itself is created by `beginAdventure` once interests are chosen.
  const startNewStory = useCallback(async () => {
    if (!user) return
    setStoryError('')
    const current = sessionRef.current
    if (current) {
      try {
        await persist(current)
      } catch {
        // Non-fatal: a new story can still begin even if saving the old one failed.
      }
    }
    navigate('story-interests')
  }, [user, persist, navigate])

  // Resume/switch to any saved story: persist the current one, point the active pointer at the
  // chosen session, (re)activate it if it had ended, and route into it.
  const switchToStory = useCallback(
    async (sessionId: string) => {
      if (!user || busyRef.current) return
      busyRef.current = true
      setStoryBusy(true)
      setStoryError('')
      try {
        const current = sessionRef.current
        if (current && current.id !== sessionId) {
          try {
            await persist(current)
          } catch {
            // Non-fatal: still allow the switch.
          }
        }
        await backend.story.setActiveStorySessionId(user.id, sessionId)
        let loaded = await backend.story.getStorySession(user.id, sessionId)
        if (loaded && loaded.status !== 'active') {
          loaded = { ...loaded, status: 'active', updatedAt: nowIso() }
          await persist(loaded)
        }
        await refreshLibrary(user.id)
        if (loaded) {
          routeToActive(loaded)
        } else {
          commitSession(null)
          setStoryError('That story could not be opened.')
          navigate('story-library')
        }
      } catch (error) {
        setStoryError(messageFrom(error, 'That story could not be opened.'))
      } finally {
        busyRef.current = false
        setStoryBusy(false)
      }
    },
    [user, backend, persist, refreshLibrary, routeToActive, commitSession, navigate],
  )

  // Delete a saved story. If the deleted one was active (or the pointer no longer resolves),
  // re-point to the most-recent remaining story, or clear it when none remain.
  const deleteStory = useCallback(
    async (sessionId: string) => {
      if (!user || busyRef.current) return
      busyRef.current = true
      setStoryBusy(true)
      setStoryError('')
      try {
        await backend.story.deleteStorySession(user.id, sessionId)
        const remaining = await refreshLibrary(user.id)
        const activeId = await backend.story.getActiveStorySessionId(user.id)
        const activeStillValid = activeId !== null && remaining.some((entry) => entry.id === activeId)
        if (!activeStillValid) {
          const next = remaining[0] ?? null
          await backend.story.setActiveStorySessionId(user.id, next ? next.id : null)
          commitSession(next)
        } else if (sessionRef.current?.id === sessionId) {
          commitSession(remaining.find((entry) => entry.id === activeId) ?? null)
        }
      } catch (error) {
        setStoryError(messageFrom(error, 'That story could not be deleted.'))
      } finally {
        busyRef.current = false
        setStoryBusy(false)
      }
    },
    [user, backend, refreshLibrary, commitSession],
  )

  // Start a brand-new adventure from the chosen interests: ask the LLM for the world + opening,
  // seed the session, show the opening beat, and pre-fetch the first question.
  const beginAdventure = useCallback(
    async (chosenTheme: StoryTheme) => {
      if (!user || busyRef.current) return
      busyRef.current = true
      setStoryBusy(true)
      setStoryError('')
      resetReview()
      try {
        // Resolve the MAIN character BEFORE generating: 'displayName' uses the signed-in user's
        // name, 'custom' uses the typed name, 'random'/unset leaves it to the model. A usable name
        // is fed forward so the prompts honor it; an unusable one degrades to random (name unset).
        const resolved = resolveProtagonist(chosenTheme, user.displayName)
        let themeForStart: StoryTheme = { ...chosenTheme }
        if (resolved.mainCharacterName !== undefined) {
          themeForStart.mainCharacterName = resolved.mainCharacterName
        } else {
          // Drop any stale/unusable name so the model invents one (and nothing rejected leaks).
          delete themeForStart.mainCharacterName
        }

        const ai = await ensureAi()

        // Choose the OPENING scene via the dispatcher (rules 1-6 keyed off the interest-selection
        // mode), BEFORE generating the premise. For the setting-tie-in modes — rule 4 ('none': no
        // interests at all, which ALWAYS ties in) and rule 6 ('customOnly') when nothing matched —
        // fold the chosen scene's SETTING into the theme (themeWithSceneSetting) so the LLM premise
        // and every later beat build FROM that setting while preserving any custom text. This
        // generalizes (and replaces) the old no-interest special case that seeded `freeformInterest`
        // from a forced off-interest scene's label. The chosen scene is then forced as the opening
        // image; for all other modes it is simply the opening image with no tie-in.
        const opening = await selectSceneForBeat(themeForStart, { matcher: matcherFor(ai) })
        const forcedOpeningScene = opening.sceneId ?? undefined
        if (opening.settingTieIn && forcedOpeningScene) {
          themeForStart = themeWithSceneSetting(themeForStart, forcedOpeningScene)
        }
        let premise = themeForStart.premise
        let protagonist = themeForStart.protagonist
        // null until/unless startStory succeeds. Because startStory now THROWS on failure (instead of
        // silently returning a canned opening + "the Explorer"), the catch below is LIVE: it leaves
        // openingGenerated null so resolveBeatText commits the theme-aware opening fallback.
        let openingGenerated: string | null = null
        if (ai) {
          try {
            const started = await ai.startStory(themeForStart)
            premise = started.premise
            protagonist = started.protagonist
            openingGenerated = started.opening
          } catch {
            // start failed -> theme-aware opening + interest-aware protagonist fallbacks below
          }
        }
        // When a main-character name was chosen (displayName/custom), it is AUTHORITATIVE and
        // overrides the model's protagonist; for random/unset we keep the LLM's (safe) protagonist,
        // or — when start failed — an INTEREST-AWARE fallback (e.g. sports -> "the Captain") instead
        // of a hardcoded "the Explorer".
        const safeProtagonist =
          isOutputSafe(protagonist) && protagonist.trim() ? protagonist.trim() : fallbackProtagonist(themeForStart)
        const fullTheme: StoryTheme = {
          ...themeForStart,
          premise: isOutputSafe(premise) && premise.trim() ? premise.trim() : DEFAULT_PREMISE,
          protagonist: resolved.protagonistOverride ?? safeProtagonist,
        }
        // A brand-new session gets a fresh id and becomes the active one; any previous session
        // stays saved in the library (saveStorySession is keyed by id), so nothing is lost.
        const id = createStorySessionId()
        let next = createInitialSession(fullTheme, user.id, nowIso(), id)
        // Resolve the opening beat against the now-final theme; on start-failure this yields the
        // reachable, theme-aware opening fallback, and a theme-appropriate scene so the first chapter
        // is never visually broken even when the AI (incl. the scene matcher) is down.
        const { text: openingText } = resolveBeatText(next, openingGenerated, 'opening')
        // The opening image is the scene the dispatcher already chose above (for a setting tie-in, the
        // one whose setting now seeds the premise) — it is never derived from the opening prose.
        next = appendSegment(next, { text: openingText, sceneId: forcedOpeningScene })
        // Snapshot the opening as Chapter 1's reviewable text (survives later segment compaction).
        next = recordChapterBeat(next, { text: openingText, sceneId: forcedOpeningScene })
        // Write the HIDDEN story bible (plan) from the premise + opening so the endless adventure has
        // long-term direction from beat one (arc, twists, character growth, emotional beats). Purely
        // additive + best-effort: a failure/timeout/no-provider just leaves the plan empty, so the
        // story still plays exactly as before. It is generated from `openingText` (the beat the reader
        // actually sees) so the plan and the opening agree. The plan is NEVER shown to the reader.
        if (ai?.writeStoryBible) {
          try {
            const bible = await ai.writeStoryBible({ theme: fullTheme, currentBible: '', recentNarrative: openingText })
            if (bible.trim()) next = setStoryBible(next, bible)
          } catch {
            // Non-fatal: the adventure begins without a plan and behaves exactly as before.
          }
        }
        await persist(next)
        await backend.story.setActiveStorySessionId(user.id, id)
        commitSession(next)
        await refreshLibrary(user.id)
        // Show the premise overview FIRST (the intro page) so the reader knows what the adventure is
        // about before reading the opening chapter; "Begin" then continues to the chapter-1 checkpoint
        // for their FIRST choice. Do NOT prefetch the first question here — it must be themed against
        // that choice + its outcome, which only exist after submitCheckpointChoice.
        navigate('story-intro')
      } catch (error) {
        setStoryError(messageFrom(error, 'Story Mode could not start. Please try again.'))
      } finally {
        busyRef.current = false
        setStoryBusy(false)
      }
    },
    [user, backend, ensureAi, persist, refreshLibrary, navigate, commitSession, resetReview],
  )

  // A correctly-solved question (routed here from the reused step view, NOT to completeStep).
  // Increments counters, then either fires a checkpoint or advances to the next themed question.
  const submitQuestionResult = useCallback(async () => {
    const current = sessionRef.current
    if (!user || !current || !current.currentQuestion || busyRef.current) return
    // PURE REVIEW: a result from a reviewed (past) question must never count or advance. Only
    // the live edge can solve. (The screen already renders past questions read-only; this is
    // defense-in-depth.)
    if (!isAtLiveEdge(current)) return
    busyRef.current = true
    setStoryBusy(true)
    setStoryError('')
    try {
      // Record the solved question's anti-repeat key via the SHARED `questionKey` so an architecture
      // question records exactly `arch:<id>` (matching `selectNextArchitecture`'s `servedKeys`) while
      // a legacy question keeps the `${lessonId}:${stepId}` form. `recordSolved` stores it opaquely.
      const key = questionKey(current.currentQuestion)
      let next = recordSolved(current, key)

      if (isCheckpointDue(next)) {
        next = resetCheckpoint(clearCurrentQuestion(next))
        const ai = await ensureAi()
        let written: string | null = null
        if (ai) {
          try {
            written = await ai.writeSegment({
              theme: next.theme,
              recentNarrative: recentNarrative(next),
              questionsSolved: next.questionsSolvedTotal,
              // Thread the hidden plan in (when present) so the bridge beat advances the planned arc
              // and ends on a real, course-changing choice; omitted keeps today's behavior.
              ...(next.storyBible ? { storyBible: next.storyBible } : {}),
            })
          } catch {
            // writeSegment now throws on failure; fall back to a distinct, theme-aware bridge beat.
            written = null
          }
        }
        const { text: beat, isFallback } = resolveBeatText(next, written, 'bridge')
        const beatScene = await sceneForBeat(ai, next.theme, isFallback, previousSceneId(next))
        next = appendSegment(next, { text: beat, sceneId: beatScene })
        // Snapshot the bridge as this new chapter's reviewable text (survives segment compaction).
        next = recordChapterBeat(next, { text: beat, sceneId: beatScene })
        next = await maybeCompact(next)
        await persist(next)
        commitSession(next)
        navigate('story-checkpoint')
        return
      }

      const themedQuestion = await takeNextQuestion(next)
      if (!themedQuestion) {
        await persist(next)
        commitSession(next)
        setStoryError('Finish more lessons to unlock more practice questions.')
        navigate('story-question')
        return
      }
      next = setCurrentQuestion(next, themedQuestion)
      await persist(next)
      commitSession(next)
      navigate('story-question')
      markQuestionShown()
      startPrefetchWithinChapter(next)
    } catch (error) {
      setStoryError(messageFrom(error, 'Could not continue the story. Please try again.'))
    } finally {
      busyRef.current = false
      setStoryBusy(false)
    }
  }, [user, ensureAi, persist, navigate, commitSession, takeNextQuestion, startPrefetchWithinChapter, maybeCompact, markQuestionShown])

  // The learner typed what they do next at a checkpoint: sanitize/moderate, then generate the
  // OUTCOME of that action (the continuation describing its consequences). Rejected input
  // re-prompts without burning a generation. We DON'T jump straight back to questions here —
  // instead we append the outcome beat and stop on the outcome page so the learner can read the
  // result of their choice; `continueFromOutcome` resumes questions only once they acknowledge it.
  // Crucially, the next-question prefetch is (re)started HERE, after the choice + outcome are
  // committed, so the first question of the new chapter is themed against them (not stale,
  // pre-choice state) while still being ready by the time "Continue the adventure" is tapped.
  const submitCheckpointChoice = useCallback(
    async (text: string) => {
      const current = sessionRef.current
      if (!user || !current || busyRef.current) return
      const moderated = moderateUserInput(text)
      if (!moderated.ok) {
        setStoryError(choiceRejectionMessage(moderated.reason))
        return
      }
      busyRef.current = true
      setStoryBusy(true)
      setStoryError('')
      try {
        // Record the learner's action on the latest beat AND surface it immediately — BEFORE the
        // slow generation — so the checkpoint's loading view can echo the move they just committed
        // instead of going blank while the outcome is written. This is an in-memory commit only;
        // the full state (with the appended outcome) is the one persisted further below.
        let next = setLatestSegmentChoice(current, moderated.sanitized)
        commitSession(next)
        const ai = await ensureAi()
        let written: string | null = null
        // The revised hidden plan, written below. The plan is updated at EVERY checkpoint so it
        // BRANCHES to the path the reader actually took and keeps advancing the long-term arc.
        let revisedBible = ''
        if (ai) {
          // Generate the OUTCOME beat and REVISE the plan CONCURRENTLY: both read the SAME
          // pre-outcome narrative + the just-committed choice, so running them together adds no extra
          // wait (the learner waits once, not twice). Both are best-effort — the outcome falls back to
          // a distinct, theme-aware beat (never byte-identical to the opening/bridge, so a choice can
          // never "reprint the same paragraph"), and a failed plan revision simply keeps the existing
          // plan so the next beats still have direction.
          const narrative = recentNarrative(next)
          const outcomePromise = ai
            .continueStory({
              theme: next.theme,
              recentNarrative: narrative,
              userChoice: moderated.sanitized,
              ...(next.storyBible ? { storyBible: next.storyBible } : {}),
            })
            .catch(() => null)
          const biblePromise = ai.writeStoryBible
            ? ai
                .writeStoryBible({
                  theme: next.theme,
                  currentBible: next.storyBible ?? '',
                  recentNarrative: narrative,
                  userChoice: moderated.sanitized,
                  questionsSolved: next.questionsSolvedTotal,
                })
                .catch(() => '')
            : Promise.resolve('')
          const [outcomeResult, bibleResult] = await Promise.all([outcomePromise, biblePromise])
          written = outcomeResult
          revisedBible = bibleResult
        }
        const { text: continuation, isFallback } = resolveBeatText(next, written, 'outcome')
        const outcomeScene = await sceneForBeat(ai, next.theme, isFallback, previousSceneId(next))
        next = appendSegment(next, { text: continuation, sceneId: outcomeScene })
        // Fold the learner's choice + this outcome into the chapter beat so the recap shows the full
        // setup -> choice -> "what happened next" (it survives the segment compaction just below).
        next = recordChapterOutcome(next, {
          userChoice: moderated.sanitized,
          outcomeText: continuation,
          outcomeSceneId: outcomeScene,
        })
        // Commit the revised plan (when the update succeeded) so every later beat follows the branched
        // arc; on failure the existing plan is kept untouched.
        if (revisedBible.trim()) next = setStoryBible(next, revisedBible)
        next = await maybeCompact(next)
        await persist(next)
        commitSession(next)
        // Prefetch the first question of the NEW chapter NOW, against the just-committed choice +
        // outcome, so it continues the chosen path (fixing the stale first-question bug). This
        // replaces any earlier prefetch and runs while the learner reads the outcome.
        startPrefetch(next)
        navigate('story-outcome')
      } catch (error) {
        setStoryError(messageFrom(error, 'Could not continue the story. Please try again.'))
      } finally {
        busyRef.current = false
        setStoryBusy(false)
      }
    },
    [user, ensureAi, persist, navigate, commitSession, maybeCompact, startPrefetch],
  )

  // The learner read the outcome of their action and tapped "Continue the adventure": stage the
  // next themed question (consuming the pre-fetch when ready) and return to solving. If the
  // catalog is exhausted we stay on the outcome page with a gentle nudge rather than dropping
  // them onto an empty question screen. PURE REVIEW is preserved — no counters/mastery are
  // touched here; the outcome was already persisted, so a refresh mid-tap simply re-shows it.
  const continueFromOutcome = useCallback(async () => {
    const current = sessionRef.current
    if (!user || !current || busyRef.current) return
    busyRef.current = true
    setStoryBusy(true)
    setStoryError('')
    try {
      const themedQuestion = await takeNextQuestion(current)
      if (!themedQuestion) {
        await persist(current)
        commitSession(current)
        setStoryError('Finish more lessons to unlock more practice questions.')
        navigate('story-outcome')
        return
      }
      const next = setCurrentQuestion(current, themedQuestion)
      await persist(next)
      commitSession(next)
      navigate('story-question')
      markQuestionShown()
      startPrefetchWithinChapter(next)
    } catch (error) {
      setStoryError(messageFrom(error, 'Could not continue the story. Please try again.'))
    } finally {
      busyRef.current = false
      setStoryBusy(false)
    }
  }, [user, persist, navigate, commitSession, takeNextQuestion, startPrefetchWithinChapter, markQuestionShown])

  const endStory = useCallback(async () => {
    const current = sessionRef.current
    if (!user || !current) return
    try {
      const next = endSession(current)
      await persist(next)
      commitSession(next)
    } catch (error) {
      setStoryError(messageFrom(error, 'Could not end the adventure.'))
    }
  }, [user, persist, commitSession])

  // Back/forward review navigation over the INTERLEAVED [chapter text, that chapter's questions]
  // sequence: move the view pointer (historyIndex) and/or the transient chapter-text flag only — no
  // persist, no counters. The displayed question / chapter text is derived below from this position.
  const applyReviewPos = useCallback(
    (next: StoryReviewPos) => {
      const current = sessionRef.current
      if (!current) return
      const changed = next.index !== current.historyIndex || next.chapterText !== showingChapterTextRef.current
      if (!changed) return
      if (next.index !== current.historyIndex) commitSession(withHistoryIndex(current, next.index))
      setReviewChapterText(next.chapterText)
    },
    [commitSession, setReviewChapterText],
  )

  const goBack = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const pos: StoryReviewPos = { index: current.historyIndex, chapterText: showingChapterTextRef.current }
    applyReviewPos(reviewStepBack(current, pos))
  }, [applyReviewPos])

  const goForward = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const pos: StoryReviewPos = { index: current.historyIndex, chapterText: showingChapterTextRef.current }
    applyReviewPos(reviewStepForward(current, pos))
  }, [applyReviewPos])

  // Chapter-level review: jump a whole chapter at a time, landing on that chapter's TEXT when it was
  // captured (else its first question), so paging by chapter mirrors the interleaved Back/Forward.
  const goBackChapter = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const target = displayedChapter(current) - 1
    if (target < 1) return
    applyReviewPos(reviewChapterStart(current, target))
  }, [applyReviewPos])

  const goForwardChapter = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const target = displayedChapter(current) + 1
    if (target > latestChapter(current)) return
    applyReviewPos(reviewChapterStart(current, target))
  }, [applyReviewPos])

  const dismissError = useCallback(() => setStoryError(''), [])

  // The question on display: the reviewed history entry, or the live question at the edge.
  const rehydrated = useMemo(() => {
    if (!session) return null
    const question = displayedQuestion(session)
    return question ? rehydrateQuestion(question) : null
  }, [session])

  // The current interleaved review position (question pointer + transient chapter-text flag), and
  // the chapter beat to render while Back has surfaced a chapter's story text (else null).
  const reviewPos: StoryReviewPos = { index: session?.historyIndex ?? 0, chapterText: showingChapterText }
  const displayedChapterNumber = session ? displayedChapter(session) : 1
  const chapterTextBeat: ChapterBeat | null =
    session && showingChapterText ? chapterBeatFor(session, displayedChapterNumber) : null
  const reviewing = session ? !isLiveReviewPos(session, reviewPos) : false

  // Story-recap "look back" (chapter-by-chapter) state for the checkpoint/outcome overlay.
  const newestRecap = session ? newestRecapChapter(session) : 0
  const recapBeat: ChapterBeat | null = session && reviewActive ? chapterBeatFor(session, recapChapter) : null

  return {
    session,
    library,
    savedCount: library.length,
    currentStep: rehydrated?.step ?? null,
    currentThemed: rehydrated?.themed ?? false,
    reviewing,
    showingChapterText: chapterTextBeat !== null,
    chapterText: chapterTextBeat,
    reviewActive,
    canReview: newestRecap >= 1,
    openReview,
    closeReview,
    recapBeat,
    recapChapter,
    recapChapterCount: newestRecap,
    canRecapBack: reviewActive && recapChapter > 1,
    canRecapForward: reviewActive && recapChapter < newestRecap,
    recapBack,
    recapForward,
    canGoBack: session ? canReviewStepBack(session, reviewPos) : false,
    canGoForward: session ? canReviewStepForward(session, reviewPos) : false,
    // Chapter surfacing + chapter-level navigation (a pure view over the question history).
    chapter: displayedChapterNumber,
    chapterCount: session ? latestChapter(session) : 1,
    canGoBackChapter: session ? canReviewBackChapter(session) : false,
    canGoForwardChapter: session ? canReviewForwardChapter(session) : false,
    storyBusy,
    storyError,
    providerConfigured,
    hasActiveSession: session?.status === 'active',
    questionNumberInChapter: (session?.questionsSinceCheckpoint ?? 0) + 1,
    openStory,
    openLibrary,
    startNewStory,
    switchToStory,
    deleteStory,
    beginAdventure,
    recordPracticeAttempt,
    submitQuestionResult,
    submitCheckpointChoice,
    continueFromOutcome,
    goBack,
    goForward,
    goBackChapter,
    goForwardChapter,
    endStory,
    dismissError,
  }
}
