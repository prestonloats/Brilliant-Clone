import { useEffect, useState } from 'react'
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

export function LearningApp({ backend }: { backend: Backend }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [view, setView] = useState<'auth' | 'verify-email' | 'course' | 'lesson' | 'complete' | 'profile'>('auth')
  const [activeLessonId, setActiveLessonId] = useState<LessonId>('balancing-equations')
  const [progress, setProgress] = useState<LessonProgress | null>(null)
  const [mastery, setMastery] = useState<SkillMastery[]>([])
  const [progressByLesson, setProgressByLesson] = useState<ProgressByLesson>({})
  const [attempts, setAttempts] = useState<AttemptEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [runtimeError, setRuntimeError] = useState('')
  const activeLesson = lessons[activeLessonId]
  const currentStep = progress ? activeLesson.steps[progress.currentStepIndex] : null
  const recommendation = getRecommendedNextLesson(activeLesson, mastery, algebraCourse, lessons, progressByLesson)

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

        setUser(currentUser)
        setActiveLessonId(session.activeLessonId)
        setProgress(session.progress)
        setProgressByLesson(session.progressByLesson)
        setMastery(session.mastery)
        setAttempts(session.attempts)
        setView('course')
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
  }, [backend])

  const refreshLearnerData = async (signedInUser: UserProfile, progressOverride?: LessonProgress) => {
    const [nextMastery, nextProgressByLesson, nextAttempts] = await Promise.all([
      backend.mastery.getUserMastery(signedInUser.id),
      getProgressByLesson(backend, signedInUser.id),
      backend.attempts.getAttempts(signedInUser.id),
    ])

    setMastery(nextMastery)
    setAttempts(nextAttempts)
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
    setUser(signedInUser)
    setActiveLessonId(saved.activeLessonId)
    setProgress(saved.progress)
    setProgressByLesson(saved.progressByLesson)
    setMastery(saved.mastery)
    setAttempts(saved.attempts)
    setView('course')
  }

  const handleSignedIn = async (signedInUser: UserProfile) => {
    setRuntimeError('')

    if (isEmailVerificationRequired(backend.provider, signedInUser.emailVerified)) {
      setUser(signedInUser)
      setProgress(null)
      setProgressByLesson({})
      setMastery([])
      setAttempts([])
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

  const handleSignOut = async () => {
    setRuntimeError('')
    try {
      await backend.auth.signOut()
      setUser(null)
      setProgress(null)
      setProgressByLesson({})
      setMastery([])
      setAttempts([])
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
        <ProfileScreen user={user} mastery={mastery} attempts={attempts} backendProvider={backend.provider} />
      )}
    </main>
  )
}
