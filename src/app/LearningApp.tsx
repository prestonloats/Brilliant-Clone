import { useCallback, useEffect, useState } from 'react'
import { createAttemptEvent, type Backend } from '../backend'
import {
  applyStepResult,
  getRecommendedNextLesson,
  isLessonUnlocked,
  restartLessonProgress,
  type ProgressByLesson,
} from '../engine'
import {
  algebraCourse,
  lessons,
  type AttemptEvent,
  type LessonId,
  type LessonProgress,
  type LessonStep,
  type SkillMastery,
  type SkillPracticeState,
  type UserProfile,
} from '../domain'
import { isEmailVerificationRequired } from '../firebaseBackendCore'
import { getInitialLessonSession, getProgressByLesson, getProgressForUser } from './dataLoaders'
import { LoadingScreen } from './LoadingScreen'
import { AuthScreen } from '../auth/AuthScreen'
import { VerifyEmailScreen } from '../auth/VerifyEmailScreen'
import { CourseMap } from '../course/CourseMap'
import { LessonPlayer } from '../lesson/LessonPlayer'
import type { CompleteOptions } from '../lesson/types'
import { CompleteScreen } from '../screens/CompleteScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { useStorySession } from '../story/useStorySession'
import { isStoryUnlocked } from './storyUnlock'
import { InterestSelectionScreen } from '../story/InterestSelectionScreen'
import { StoryQuestionScreen } from '../story/StoryQuestionScreen'
import { StoryCheckpointScreen } from '../story/StoryCheckpointScreen'
import { StoryOutcomeScreen } from '../story/StoryOutcomeScreen'
import { StoryLibraryScreen } from '../story/StoryLibraryScreen'
import { StoryIntroScreen } from '../story/StoryIntroScreen'
import { StoryReviewScreen, type StoryReviewControls } from '../story/StoryReviewView'

export function LearningApp({ backend }: { backend: Backend }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [view, setView] = useState<
    | 'auth'
    | 'verify-email'
    | 'course'
    | 'lesson'
    | 'complete'
    | 'profile'
    | 'story-interests'
    | 'story-intro'
    | 'story-question'
    | 'story-checkpoint'
    | 'story-outcome'
    | 'story-library'
  >('auth')
  const [activeLessonId, setActiveLessonId] = useState<LessonId>(algebraCourse.lessonOrder[0])
  const [progress, setProgress] = useState<LessonProgress | null>(null)
  const [mastery, setMastery] = useState<SkillMastery[]>([])
  const [progressByLesson, setProgressByLesson] = useState<ProgressByLesson>({})
  const [attempts, setAttempts] = useState<AttemptEvent[]>([])
  // Phase 3 Story Mode learning-science practice state (spaced-repetition + mastery estimate).
  const [practice, setPractice] = useState<SkillPracticeState[]>([])
  const [loading, setLoading] = useState(true)
  const [runtimeError, setRuntimeError] = useState('')
  const activeLesson = lessons[activeLessonId]
  const currentStep = progress ? activeLesson.steps[progress.currentStepIndex] : null
  const recommendation = getRecommendedNextLesson(activeLesson, mastery, algebraCourse, lessons, progressByLesson)

  // Story Mode unlocks only after the first two lessons are completed (plan section 8). Phase 3
  // narrows its old pure-review wall: the controller below still never calls `completeStep` (so it
  // never writes LessonProgress or lesson mastery), but it now records a DEDICATED practice store
  // (spaced-repetition + mastery estimate) and `source:'story'` attempts. `onLearnerDataChanged`
  // refreshes the attempt/practice data that drives the next question's selection.
  const storyUnlocked = isStoryUnlocked(progressByLesson)
  const story = useStorySession({
    backend,
    user,
    progressByLesson,
    mastery,
    attempts,
    practice,
    navigate: (storyView) => setView(storyView),
    onLearnerDataChanged: () => {
      if (user) void refreshLearnerData(user)
    },
  })

  const applySession = useCallback(
    (sessionUser: UserProfile, session: Awaited<ReturnType<typeof getInitialLessonSession>>) => {
      setUser(sessionUser)
      setActiveLessonId(session.activeLessonId)
      setProgress(session.progress)
      setProgressByLesson(session.progressByLesson)
      setMastery(session.mastery)
      setAttempts(session.attempts)
      setPractice(session.practice)
      setView('course')
    },
    [],
  )

  const clearLearnerState = () => {
    setProgress(null)
    setProgressByLesson({})
    setMastery([])
    setAttempts([])
    setPractice([])
  }

  useEffect(() => {
    let cancelled = false

    const loadInitialSession = async () => {
      setRuntimeError('')
      try {
        const currentUser = await backend.auth.getCurrentUser()
        if (cancelled) return

        if (!currentUser) {
          setUser(null)
          setView('auth')
          return
        }

        if (isEmailVerificationRequired(backend.provider, currentUser.emailVerified)) {
          setUser(currentUser)
          setView('verify-email')
          return
        }

        const session = await getInitialLessonSession(backend, currentUser)
        if (cancelled) return

        applySession(currentUser, session)
      } catch (error) {
        if (!cancelled) {
          setRuntimeError(error instanceof Error ? error.message : 'The current session could not be loaded.')
          setView('auth')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialSession()

    return () => {
      cancelled = true
    }
  }, [backend, applySession])

  const refreshLearnerData = async (signedInUser: UserProfile, progressOverride?: LessonProgress) => {
    const [nextMastery, nextProgressByLesson, nextAttempts, nextPractice] = await Promise.all([
      backend.mastery.getUserMastery(signedInUser.id),
      getProgressByLesson(backend, signedInUser.id),
      backend.attempts.getAttempts(signedInUser.id),
      backend.practice.getUserPractice(signedInUser.id),
    ])

    setMastery(nextMastery)
    setAttempts(nextAttempts)
    setPractice(nextPractice)
    setProgressByLesson(
      progressOverride
        ? { ...nextProgressByLesson, [progressOverride.lessonId]: progressOverride }
        : nextProgressByLesson,
    )
  }

  const saveProgress = async (nextProgress: LessonProgress) => {
    await backend.progress.saveLessonProgress(nextProgress)
    setProgress(nextProgress)
  }

  const completeStep = async (
    step: LessonStep,
    correct: boolean,
    feedback: string,
    msToAnswer: number,
    options: CompleteOptions = {},
  ) => {
    if (!user || !progress) return
    setRuntimeError('')

    const shouldAdvance = options.advance ?? correct
    const shouldRecordAttempt = options.recordAttempt ?? true
    const previousAttempts = progress.stepResults[step.id]?.attempts ?? 0
    const result = { correct, feedback }
    const nextProgress = applyStepResult(
      progress,
      step,
      result,
      progress.currentStepIndex + (shouldAdvance ? 1 : 0),
      activeLesson,
      shouldRecordAttempt,
    )

    try {
      if (shouldRecordAttempt) {
        await backend.attempts.recordAttempt(
          createAttemptEvent(
            user.id,
            activeLesson.id,
            step.id,
            correct,
            previousAttempts + 1,
            msToAnswer,
          ),
        )
        await Promise.all(
          activeLesson.skillIds.map((skillId) =>
            backend.mastery.updateSkillMastery(user.id, skillId, correct),
          ),
        )
      }

      await saveProgress(nextProgress)
      await refreshLearnerData(user, nextProgress)

      if (nextProgress.status === 'completed') {
        setView('complete')
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Progress could not be saved.')
    }
  }

  const loadSignedInSession = async (signedInUser: UserProfile) => {
    const saved = await getInitialLessonSession(backend, signedInUser)
    applySession(signedInUser, saved)
  }

  const handleSignedIn = async (signedInUser: UserProfile) => {
    setRuntimeError('')

    if (isEmailVerificationRequired(backend.provider, signedInUser.emailVerified)) {
      setUser(signedInUser)
      clearLearnerState()
      setView('verify-email')
      return
    }

    try {
      await loadSignedInSession(signedInUser)
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'The signed-in profile could not be loaded.')
    }
  }

  const handleResendVerification = async () => {
    await backend.auth.resendEmailVerification()
  }

  const handleVerificationContinue = async () => {
    const refreshed = await backend.auth.reloadCurrentUser()
    if (!refreshed) {
      setUser(null)
      setView('auth')
      throw new Error('Your session ended. Sign in again to continue.')
    }

    setUser(refreshed)

    if (isEmailVerificationRequired(backend.provider, refreshed.emailVerified)) {
      throw new Error('Your email still looks unverified. Open the link we emailed you, then try again.')
    }

    await loadSignedInSession(refreshed)
  }

  // Persist the new display name through the Backend contract, then update the single `user`
  // state so the change is reflected app-wide immediately (profile heading, Story Mode "Use my
  // name", etc.). Errors propagate to the ProfileScreen for inline display.
  const handleSaveDisplayName = async (name: string) => {
    const updated = await backend.auth.updateDisplayName(name)
    setUser(updated)
  }

  const handleSignOut = async () => {
    setRuntimeError('')
    try {
      await backend.auth.signOut()
      setUser(null)
      clearLearnerState()
      setView('auth')
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Sign out failed.')
    }
  }

  const launchLesson = async (lessonId: LessonId) => {
    if (!user) return
    setRuntimeError('')

    try {
      const lesson = lessons[lessonId]
      const latestProgressByLesson = await getProgressByLesson(backend, user.id)
      if (!isLessonUnlocked(lesson, latestProgressByLesson)) return

      const nextProgress = await getProgressForUser(backend, user, lessonId)
      setActiveLessonId(lessonId)
      setProgress(nextProgress)
      setProgressByLesson({ ...latestProgressByLesson, [lessonId]: nextProgress })
      setView(nextProgress.status === 'completed' ? 'complete' : 'lesson')
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Lesson progress could not be opened.')
    }
  }

  const retakeLesson = async (lessonId: LessonId) => {
    if (!user) return
    setRuntimeError('')

    try {
      const lesson = lessons[lessonId]
      const latestProgressByLesson = await getProgressByLesson(backend, user.id)
      if (!isLessonUnlocked(lesson, latestProgressByLesson)) return

      const currentProgress = await getProgressForUser(backend, user, lessonId)
      const nextProgress = restartLessonProgress(currentProgress, lesson)
      await backend.progress.saveLessonProgress(nextProgress)
      setActiveLessonId(lessonId)
      setProgress(nextProgress)
      setProgressByLesson({ ...latestProgressByLesson, [lessonId]: nextProgress })
      setView('lesson')
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Lesson could not be restarted.')
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading your learning path..." />
  }

  // The read-only "look back at the story" overlay controls, shared by the checkpoint + outcome
  // screens (which otherwise have no review). It pages CHAPTER RECAPS (setup -> choice -> outcome),
  // opening at the chapter that prompted the current screen. Built from the controller each render.
  const reviewControls: StoryReviewControls = {
    active: story.reviewActive,
    canReview: story.canReview,
    open: () => story.openReview(),
    close: () => story.closeReview(),
    beat: story.recapBeat,
    chapter: story.recapChapter,
    chapterCount: story.recapChapterCount,
    canBack: story.canRecapBack,
    canForward: story.canRecapForward,
    back: () => story.recapBack(),
    forward: () => story.recapForward(),
  }

  return (
    <main className="app-shell">
      {runtimeError && (
        <p className="feedback bad" role="alert" aria-live="assertive">
          {runtimeError}
        </p>
      )}
      {user && view !== 'verify-email' && (
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => setView('course')}>
            Balance
          </button>
          <nav aria-label="Primary">
            <button
              type="button"
              className={view === 'course' ? 'nav-active' : ''}
              aria-current={view === 'course' ? 'page' : undefined}
              onClick={() => setView('course')}
            >
              Path
            </button>
            <button
              type="button"
              className={view.startsWith('story-') ? 'nav-active' : ''}
              aria-current={view.startsWith('story-') ? 'page' : undefined}
              onClick={() => void story.openStory()}
            >
              Story
            </button>
            <button
              type="button"
              className={view === 'profile' ? 'nav-active' : ''}
              aria-current={view === 'profile' ? 'page' : undefined}
              onClick={() => setView('profile')}
            >
              Profile
            </button>
            <button type="button" onClick={handleSignOut}>
              Log out
            </button>
          </nav>
        </header>
      )}

      {view === 'auth' && <AuthScreen backend={backend} onSignedIn={handleSignedIn} />}
      {view === 'verify-email' && user && (
        <VerifyEmailScreen
          email={user.email}
          onResend={handleResendVerification}
          onContinue={handleVerificationContinue}
          onSignOut={handleSignOut}
        />
      )}
      {view === 'course' && user && (
        <CourseMap
          user={user}
          activeLesson={activeLesson}
          progress={progress}
          progressByLesson={progressByLesson}
          mastery={mastery}
          onLaunchLesson={launchLesson}
          onRetakeLesson={retakeLesson}
          storyUnlocked={storyUnlocked}
          storyProviderConfigured={story.providerConfigured}
          storyHasActiveSession={story.hasActiveSession}
          storySavedCount={story.savedCount}
          storyBusy={story.storyBusy}
          onOpenStory={() => void story.openStory()}
          onOpenStoryLibrary={() => void story.openLibrary()}
        />
      )}
      {view === 'lesson' && user && progress && currentStep && (
        <LessonPlayer
          lesson={activeLesson}
          step={currentStep}
          progress={progress}
          onBack={() => setView('course')}
          onStepComplete={completeStep}
        />
      )}
      {view === 'complete' && user && progress && (
        <CompleteScreen
          lesson={activeLesson}
          progress={progress}
          recommendation={recommendation}
          onCourse={() => setView('course')}
          onRetake={() => retakeLesson(activeLesson.id)}
        />
      )}
      {view === 'profile' && user && (
        <ProfileScreen
          user={user}
          mastery={mastery}
          attempts={attempts}
          practice={practice}
          storySessions={story.library}
          backendProvider={backend.provider}
          onSaveDisplayName={handleSaveDisplayName}
        />
      )}
      {view === 'story-interests' && user && (
        <InterestSelectionScreen
          unlocked={storyUnlocked}
          providerConfigured={story.providerConfigured}
          busy={story.storyBusy}
          error={story.storyError}
          onBegin={(theme) => void story.beginAdventure(theme)}
          onBackToPath={() => setView('course')}
        />
      )}
      {view === 'story-intro' && user && story.session && (
        <StoryIntroScreen
          session={story.session}
          busy={story.storyBusy}
          onBegin={() => setView('story-checkpoint')}
          onOpenLibrary={() => void story.openLibrary()}
          onNewStory={() => void story.startNewStory()}
          onBackToPath={() => setView('course')}
        />
      )}
      {view === 'story-question' && user && story.session && story.currentStep && (
        <StoryQuestionScreen
          session={story.session}
          step={story.currentStep}
          themed={story.currentThemed}
          reviewing={story.reviewing}
          showingChapterText={story.showingChapterText}
          chapterText={story.chapterText}
          canGoBack={story.canGoBack}
          canGoForward={story.canGoForward}
          chapter={story.chapter}
          chapterCount={story.chapterCount}
          canChapterBack={story.canGoBackChapter}
          canChapterForward={story.canGoForwardChapter}
          questionNumber={story.questionNumberInChapter}
          busy={story.storyBusy}
          error={story.storyError}
          onResult={() => void story.submitQuestionResult()}
          onAttempt={(correct) => story.recordPracticeAttempt(correct)}
          onBack={() => story.goBack()}
          onForward={() => story.goForward()}
          onChapterBack={() => story.goBackChapter()}
          onChapterForward={() => story.goForwardChapter()}
          onOpenLibrary={() => void story.openLibrary()}
          onNewStory={() => void story.startNewStory()}
          onBackToPath={() => setView('course')}
        />
      )}
      {view === 'story-checkpoint' &&
        user &&
        story.session &&
        (story.reviewActive ? (
          <StoryReviewScreen
            review={reviewControls}
            busy={story.storyBusy}
            onBackToPath={() => setView('course')}
            onOpenLibrary={() => void story.openLibrary()}
            onNewStory={() => void story.startNewStory()}
          />
        ) : (
          <StoryCheckpointScreen
            session={story.session}
            busy={story.storyBusy}
            error={story.storyError}
            canReview={story.canReview}
            onLookBack={() => story.openReview()}
            onContinue={(choice) => void story.submitCheckpointChoice(choice)}
            onOpenLibrary={() => void story.openLibrary()}
            onNewStory={() => void story.startNewStory()}
            onBackToPath={() => setView('course')}
          />
        ))}
      {view === 'story-outcome' &&
        user &&
        story.session &&
        (story.reviewActive ? (
          <StoryReviewScreen
            review={reviewControls}
            busy={story.storyBusy}
            onBackToPath={() => setView('course')}
            onOpenLibrary={() => void story.openLibrary()}
            onNewStory={() => void story.startNewStory()}
          />
        ) : (
          <StoryOutcomeScreen
            session={story.session}
            busy={story.storyBusy}
            error={story.storyError}
            canReview={story.canReview}
            onLookBack={() => story.openReview()}
            onContinue={() => void story.continueFromOutcome()}
            onOpenLibrary={() => void story.openLibrary()}
            onNewStory={() => void story.startNewStory()}
            onBackToPath={() => setView('course')}
          />
        ))}
      {view === 'story-library' && user && (
        <StoryLibraryScreen
          sessions={story.library}
          activeSessionId={story.session?.id ?? null}
          busy={story.storyBusy}
          error={story.storyError}
          onResume={(sessionId) => void story.switchToStory(sessionId)}
          onNewStory={() => void story.startNewStory()}
          onDelete={(sessionId) => void story.deleteStory(sessionId)}
          onBackToPath={() => setView('course')}
        />
      )}
    </main>
  )
}
