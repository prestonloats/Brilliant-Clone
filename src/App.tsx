import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { MathText } from './MathText'
import { createAttemptEvent, createBackend, type Backend } from './backend'
import {
  applyBalanceOperation,
  applyStepResult,
  buildLessonGraph,
  checkBalanceStep,
  checkDragTermsStep,
  checkInputStep,
  checkManipulativeStep,
  checkMcqStep,
  checkOperationChoiceStep,
  checkPlotStep,
  checkSequenceStep,
  checkSliderStep,
  createInitialProgress,
  getBestLessonScore,
  getCourseProgressSummary,
  getLatestLessonScore,
  getRecommendedPathLessonId,
  getRecommendedNextLesson,
  hasCompletedLesson,
  isLessonUnlocked,
  isLevel,
  MASTERY_READY_THRESHOLD,
  restartLessonProgress,
  sideTotal,
  type BalanceCheckMeta,
  type LessonGraphConnector,
  type LessonGraphNode,
  type ProgressByLesson,
} from './engine'
import {
  algebraCourse,
  lessons,
  skills,
  type AttemptEvent,
  type BalanceItem,
  type BalanceOperation,
  type BalanceSide,
  type BalanceState,
  type Lesson,
  type LessonId,
  type LessonScore,
  type BalanceStep,
  type ConceptStep,
  type DragTermsStep,
  type LessonProgress,
  type LessonStep,
  type ManipulativeStep,
  type McqStep,
  type OperationChoiceStep,
  type PlotPoint,
  type PlotStep,
  type SequenceStep,
  type SliderStep,
  type SkillMastery,
  type UserProfile,
} from './domain'
import { getBackendProvider, getMissingFirebaseEnvKeys } from './firebaseConfig'
import { isEmailVerificationRequired } from './firebaseBackendCore'
import { validateAuthForm, type AuthMode } from './authValidation'

type BackendStartup =
  | { status: 'loading' }
  | { status: 'ready'; backend: Backend }
  | { status: 'error'; title: string; message: string; details: string[] }

async function initializeBackend(): Promise<BackendStartup> {
  try {
    const provider = getBackendProvider()

    if (provider === 'firebase') {
      const missingKeys = getMissingFirebaseEnvKeys()
      if (missingKeys.length > 0) {
        return {
          status: 'error',
          title: 'Firebase configuration is incomplete.',
          message:
            'VITE_BACKEND_PROVIDER=firebase is set, but required Firebase web config values are missing. The app did not fall back to local demo mode.',
          details: missingKeys,
        }
      }

      // Firebase SDK code is loaded only when Firebase mode is selected, so the default
      // local browser-only path never imports or initializes Firebase at startup.
      const [{ getFirebaseServices }, { FirebaseBackend }] = await Promise.all([
        import('./firebaseServices'),
        import('./firebaseBackend'),
      ])

      const services = getFirebaseServices()
      if (!services) {
        return {
          status: 'error',
          title: 'Firebase adapter could not start.',
          message:
            'VITE_BACKEND_PROVIDER=firebase is set, but Firebase services could not be initialized. The app did not fall back to local demo mode.',
          details: [],
        }
      }

      return {
        status: 'ready',
        backend: createBackend(provider, { firebaseBackend: new FirebaseBackend(services) }),
      }
    }

    return { status: 'ready', backend: createBackend(provider) }
  } catch (error) {
    return {
      status: 'error',
      title: 'Backend configuration error.',
      message: error instanceof Error ? error.message : 'The selected backend could not be started.',
      details: [],
    }
  }
}

function App() {
  const [startup, setStartup] = useState<BackendStartup>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    initializeBackend().then((result) => {
      if (!cancelled) {
        setStartup(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (startup.status === 'loading') {
    return <LoadingScreen message="Starting backend..." />
  }

  if (startup.status === 'error') {
    return <BackendConfigurationError startup={startup} />
  }

  return <LearningApp backend={startup.backend} />
}

function LearningApp({ backend }: { backend: Backend }) {
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

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <section className="auth-screen card">
        <p className="eyebrow">Balance</p>
        <h1>{message}</h1>
        <p className="lead">Preparing the selected backend for the lesson path.</p>
      </section>
    </main>
  )
}

function BackendConfigurationError({ startup }: { startup: Extract<BackendStartup, { status: 'error' }> }) {
  return (
    <main className="app-shell">
      <section className="auth-screen card">
        <p className="eyebrow">Backend setup required</p>
        <h1>{startup.title}</h1>
        <p className="lead">{startup.message}</p>
        {startup.details.length > 0 && (
          <ul className="fine-print">
            {startup.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        <p className="fine-print">
          Use `VITE_BACKEND_PROVIDER=local` for the browser-only demo, or finish `.env.local` and Firebase project setup
          before enabling Firebase mode.
        </p>
      </section>
    </main>
  )
}

type VerifyEmailScreenProps = {
  email: string
  onResend: () => Promise<void>
  onContinue: () => Promise<void>
  onSignOut: () => void | Promise<void>
}

function VerifyEmailScreen({ email, onResend, onContinue, onSignOut }: VerifyEmailScreenProps) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const resend = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onResend()
      setNotice(`We re-sent a verification link to ${email}. Check your inbox and spam folder.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The verification email could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const continueAfterVerification = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onContinue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not confirm your verification yet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-screen card">
      <p className="eyebrow">Verify your email</p>
      <h1>Confirm {email} to start saving progress.</h1>
      <p className="lead">
        Firebase mode requires a verified email before your learning progress, mastery, and attempts can be saved. We
        sent a verification link to your inbox. Open it, then continue here.
      </p>

      {notice && (
        <p className="feedback good" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="feedback bad" role="status">
          {error}
        </p>
      )}

      <button className="primary-action" type="button" disabled={busy} onClick={continueAfterVerification}>
        I verified my email
      </button>
      <button className="secondary-action" type="button" disabled={busy} onClick={resend}>
        Resend verification email
      </button>
      <button className="secondary-action" type="button" disabled={busy} onClick={() => void onSignOut()}>
        Use a different account
      </button>

      <p className="fine-print">
        Local demo mode never requires email verification. This step only applies to Firebase accounts so that course
        writes are tied to a confirmed email address.
      </p>
    </section>
  )
}

async function getInitialLessonSession(backend: Backend, user: UserProfile) {
  const [progressByLesson, mastery, attempts] = await Promise.all([
    getProgressByLesson(backend, user.id),
    backend.mastery.getUserMastery(user.id),
    backend.attempts.getAttempts(user.id),
  ])
  const activeLessonId = getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, 'balancing-equations')
  // Only surface progress that was actually saved. A brand-new learner sees "Start" with
  // no 0% bar until they begin a lesson, so we never create or persist an inProgress
  // record here; that happens in launchLesson when they actually start.
  const progress = progressByLesson[activeLessonId] ?? null

  return {
    activeLessonId,
    progress,
    progressByLesson,
    mastery,
    attempts,
  }
}

async function getProgressForUser(backend: Backend, user: UserProfile, lessonId: LessonId) {
  const saved = await backend.progress.getLessonProgress(user.id, lessonId)
  if (saved) return saved

  const progress = createInitialProgress(user.id, lessonId)
  await backend.progress.saveLessonProgress(progress)
  return progress
}

async function getProgressByLesson(backend: Backend, userId: string): Promise<ProgressByLesson> {
  const lessonProgress = await Promise.all(
    algebraCourse.lessonOrder.map(async (lessonId) => ({
      lessonId,
      progress: await backend.progress.getLessonProgress(userId, lessonId),
    })),
  )

  return lessonProgress.reduce<ProgressByLesson>((items, { lessonId, progress }) => {
    if (progress) {
      items[lessonId] = progress
    }
    return items
  }, {})
}

type AuthScreenProps = {
  backend: Backend
  onSignedIn: (user: UserProfile) => void | Promise<void>
}

function AuthScreen({ backend, onSignedIn }: AuthScreenProps) {
  // Firebase is the real credential provider (email + password). Local demo mode stays
  // passwordless on purpose so no plaintext password is ever stored in the browser.
  const requiresPassword = backend.provider === 'firebase'
  const [mode, setMode] = useState<AuthMode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'
  const panelId = 'auth-form-panel'
  const activeTabId = isSignup ? 'signup-tab' : 'login-tab'

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const validationError = validateAuthForm(
      { displayName, email, password, confirmPassword },
      { mode, requiresPassword },
    )
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setBusy(true)
    try {
      const signedIn = isSignup
        ? await backend.auth.signUp({
            displayName,
            email,
            ...(requiresPassword ? { password } : {}),
          })
        : await backend.auth.signIn(email, requiresPassword ? password : undefined)
      await onSignedIn(signedIn)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-screen card">
      <p className="eyebrow">Algebra Foundations</p>
      <h1>{isSignup ? 'Create your account to start learning.' : 'Welcome back. Log in to keep learning.'}</h1>
      <p className="lead">
        A Brilliant-style algebra path where every answer gives immediate, specific feedback.
      </p>

      <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
        <button
          aria-controls={panelId}
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'active' : ''}
          id="login-tab"
          role="tab"
          type="button"
          onClick={() => switchMode('login')}
        >
          Log in
          {mode === 'login' && <span className="tab-state">Current</span>}
        </button>
        <button
          aria-controls={panelId}
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? 'active' : ''}
          id="signup-tab"
          role="tab"
          type="button"
          onClick={() => switchMode('signup')}
        >
          Create account
          {mode === 'signup' && <span className="tab-state">Current</span>}
        </button>
      </div>

      <form
        aria-labelledby={activeTabId}
        className="form-stack"
        id={panelId}
        role="tabpanel"
        noValidate
        onSubmit={submit}
      >
        {isSignup && (
          <label>
            Display name
            <input
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            autoComplete="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {requiresPassword && (
          <label>
            Password
            <input
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        {requiresPassword && isSignup && (
          <label>
            Confirm password
            <input
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="feedback bad" role="alert">
            {error}
          </p>
        )}

        <button className="primary-action" type="submit" disabled={busy}>
          {busy ? 'Working...' : isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>

      <p className="auth-switch">
        {isSignup ? 'Already have an account?' : 'New here?'}{' '}
        <button
          className="link-button"
          type="button"
          onClick={() => switchMode(isSignup ? 'login' : 'signup')}
        >
          {isSignup ? 'Log in instead' : 'Create an account'}
        </button>
      </p>

      {requiresPassword ? (
        <p className="fine-print">
          Firebase mode uses Firebase Authentication email/password credentials and stores your
          progress in Firestore under your account. New accounts must verify their email before
          learning progress can be saved.
        </p>
      ) : (
        <p className="fine-print">
          Local demo mode keeps your account on this device only and never collects a password.{' '}
          {isSignup
            ? 'Creating an account needs just a display name and email.'
            : 'Log in resumes an account you created in this browser using its email.'}{' '}
          Set <code>VITE_BACKEND_PROVIDER=firebase</code> with a configured Firebase project to
          enable password-protected accounts that sync across devices. Sign out before sharing this
          browser.
        </p>
      )}
    </section>
  )
}

type CourseMapProps = {
  user: UserProfile
  activeLesson: Lesson
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
}

function CourseMap({
  user,
  activeLesson,
  progress,
  progressByLesson,
  mastery,
  onLaunchLesson,
  onRetakeLesson,
}: CourseMapProps) {
  const reviewLessonId = getReviewSuggestedLessonId(progressByLesson, mastery)
  const pathSummary = getCourseProgressSummary(algebraCourse, lessons, progressByLesson, activeLesson.id)
  const featuredLessonId = pathSummary.recommendedLessonId
  const reviewLesson = reviewLessonId && reviewLessonId !== featuredLessonId ? lessons[reviewLessonId] : null
  const featuredLesson = lessons[featuredLessonId]
  const featuredProgress = progressByLesson[featuredLessonId]
  const featuredProgressPercent = getLessonProgressPercent(featuredLesson, featuredProgress)
  const featuredScore = getScoreSummaryText(pathSummary.recommendedLatestScore, pathSummary.recommendedBestScore)
  const lastCompletedLesson = pathSummary.lastCompletedLessonId ? lessons[pathSummary.lastCompletedLessonId] : null
  const lastCompletedScore = getScoreSummaryText(
    pathSummary.lastCompletedLatestScore,
    pathSummary.lastCompletedBestScore,
  )
  const progressLabel = `${pathSummary.completedLessons} of ${pathSummary.totalLessons} lessons complete`
  const actionLabel =
    pathSummary.recommendedAction === 'view-summary'
      ? 'View summary'
      : pathSummary.recommendedAction === 'continue'
        ? 'Continue'
        : 'Start'

  return (
    <section className="screen-stack">
      <div className="hero-card card">
        <p className="eyebrow">Welcome back, {user.displayName}</p>
        <h1>{algebraCourse.title}</h1>
        <p className="lead">{algebraCourse.description}</p>
        <div className="path-overview" aria-label="Course progress overview">
          <div className="overview-stat">
            <span>Path progress</span>
            <strong>{progressLabel}</strong>
            <small>{pathSummary.percentComplete}% complete</small>
          </div>
          <div className="overview-stat">
            <span>Last completed</span>
            <strong>{lastCompletedLesson?.title ?? 'Nothing completed yet'}</strong>
            <small>{lastCompletedScore || (lastCompletedLesson ? 'Completed' : 'Start the first lesson to begin your path.')}</small>
          </div>
        </div>
        <div className="continue-panel">
          <div>
            <span>Recommended next</span>
            <strong>{featuredLesson.title}</strong>
            <span>{getLessonProgressLabel(featuredLesson, featuredProgress, mastery)}</span>
            {featuredScore && <small className="score-line">{featuredScore}</small>}
          </div>
          <div className="continue-actions">
            <button className="primary-action" type="button" onClick={() => onLaunchLesson(featuredLesson.id)}>
              {actionLabel}
            </button>
            {featuredProgress?.status === 'completed' && (
              <button className="secondary-inline" type="button" onClick={() => onRetakeLesson(featuredLesson.id)}>
                Retake
              </button>
            )}
          </div>
        </div>
        {reviewLesson && (
          <p className="review-note">
            Review suggested for {reviewLesson.title}, but {featuredLesson.title} is unlocked when you are ready.
          </p>
        )}
        <ProgressBar value={pathSummary.percentComplete} label={progressLabel} />
        {featuredProgress && featuredProgress.status !== 'completed' && (
          <ProgressBar value={featuredProgressPercent} label={`${featuredLesson.title}: ${featuredProgressPercent}% complete`} />
        )}
      </div>

      <CoursePathGraph
        progress={progress}
        progressByLesson={progressByLesson}
        mastery={mastery}
        featuredLessonId={featuredLessonId}
        onLaunchLesson={onLaunchLesson}
        onRetakeLesson={onRetakeLesson}
      />
    </section>
  )
}

type CoursePathGraphProps = {
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  featuredLessonId: LessonId
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
}

function CoursePathGraph({
  progress,
  progressByLesson,
  mastery,
  featuredLessonId,
  onLaunchLesson,
  onRetakeLesson,
}: CoursePathGraphProps) {
  const graph = buildLessonGraph(algebraCourse, lessons)

  return (
    <section className="path-graph-section" aria-labelledby="path-graph-heading">
      <div className="path-graph-head">
        <h2 id="path-graph-heading">Your learning path</h2>
        <p className="path-graph-sub">
          Each lesson unlocks once its prerequisites are complete. After Two-Step Equations the path
          splits into two parallel branches that merge again at Graphing Lines.
        </p>
      </div>
      <ol className="path-graph">
        {graph.stages.map((stage) => (
          <li
            className={`path-stage connector-stage-${stage.connector} ${stage.nodeIds.length > 1 ? 'is-branch' : ''}`}
            key={stage.rank}
          >
            {stage.connector !== 'start' && <StageConnector connector={stage.connector} />}
            <div className="stage-nodes">
              {stage.nodeIds.map((lessonId) => (
                <CoursePathNode
                  key={lessonId}
                  node={graph.nodes[lessonId]}
                  progress={progress}
                  progressByLesson={progressByLesson}
                  mastery={mastery}
                  featuredLessonId={featuredLessonId}
                  onLaunchLesson={onLaunchLesson}
                  onRetakeLesson={onRetakeLesson}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StageConnector({ connector }: { connector: LessonGraphConnector }) {
  if (connector === 'split') {
    return (
      <div className="stage-connector connector-split" aria-hidden="true">
        <svg viewBox="0 0 200 46" preserveAspectRatio="none" className="connector-art">
          <path d="M100 0 L100 14 M100 14 L50 46 M100 14 L150 46" pathLength={1} />
        </svg>
        <span className="connector-label">Path splits</span>
      </div>
    )
  }

  if (connector === 'merge') {
    return (
      <div className="stage-connector connector-merge" aria-hidden="true">
        <svg viewBox="0 0 200 46" preserveAspectRatio="none" className="connector-art">
          <path d="M50 0 L100 32 M150 0 L100 32 M100 32 L100 46" pathLength={1} />
        </svg>
        <span className="connector-label">Branches merge</span>
      </div>
    )
  }

  return (
    <div className={`stage-connector connector-${connector}`} aria-hidden="true">
      <span className="connector-line" />
    </div>
  )
}

type CoursePathNodeProps = {
  node: LessonGraphNode
  progress: LessonProgress | null
  progressByLesson: ProgressByLesson
  mastery: SkillMastery[]
  featuredLessonId: LessonId
  onLaunchLesson: (lessonId: LessonId) => void
  onRetakeLesson: (lessonId: LessonId) => void
}

function CoursePathNode({
  node,
  progress,
  progressByLesson,
  mastery,
  featuredLessonId,
  onLaunchLesson,
  onRetakeLesson,
}: CoursePathNodeProps) {
  const lesson = lessons[node.id]
  const courseNode = algebraCourse.lessons.find((item) => item.id === node.id)
  const lessonProgress = progress && node.id === progress.lessonId ? progress : progressByLesson[node.id]
  const unlocked = isLessonUnlocked(lesson, progressByLesson)
  const completed = lessonProgress?.status === 'completed'
  const comingSoon = lesson.steps.length === 0
  const recommended = node.id === featuredLessonId && !completed && unlocked
  const status = getPathStatus({ comingSoon, recommended, unlocked, lesson, lessonProgress, mastery })
  const scoreText = getLessonScoreText(lesson, lessonProgress)
  const position = algebraCourse.lessonOrder.indexOf(node.id) + 1

  const prerequisiteTitles = node.prerequisites.map((lessonId) => lessons[lessonId].title)
  const unlockTitles = node.unlocks.map((lessonId) => lessons[lessonId].title)
  const dependencyLine =
    prerequisiteTitles.length === 0
      ? 'Start here, no prerequisites'
      : `${unlocked ? 'Builds on' : 'Requires'} ${formatList(prerequisiteTitles)}`
  const dependencyTag = prerequisiteTitles.length === 0 ? 'Start' : unlocked ? 'Open' : 'Locked'

  return (
    <article
      className={`path-node graph-node ${status.className} ${recommended ? 'is-recommended' : ''}`}
      aria-current={recommended ? 'step' : undefined}
    >
      <div className="graph-node-head">
        <span className="node-number" aria-hidden="true">
          {position}
        </span>
        <div className="graph-node-titles">
          <h3>{courseNode?.title ?? lesson.title}</h3>
          <span className="status-pill">{status.label}</span>
        </div>
      </div>
      <p className="graph-node-desc">{courseNode?.description ?? lesson.subtitle}</p>
      <p className="node-deps">
        <span className="dep-tag">{dependencyTag}</span>
        <span>{dependencyLine}</span>
      </p>
      {unlockTitles.length > 1 && (
        <p className="node-deps node-deps-branch">
          <span className="dep-tag">Branches</span>
          <span>Unlocks {formatList(unlockTitles)} as two parallel paths</span>
        </p>
      )}
      {scoreText && <p className="score-line">{scoreText}</p>}
      <div className="graph-node-actions">
        {unlocked ? (
          <>
            <button type="button" onClick={() => onLaunchLesson(node.id)}>
              {completed ? 'View summary' : lessonProgress ? 'Continue' : 'Start'}
            </button>
            {completed && (
              <button type="button" onClick={() => onRetakeLesson(node.id)}>
                Retake
              </button>
            )}
          </>
        ) : (
          <span className="locked-hint">Finish {formatList(prerequisiteTitles)} to unlock</span>
        )}
      </div>
    </article>
  )
}

function formatList(items: string[]) {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function getLessonProgressPercent(lesson: Lesson, progress?: LessonProgress) {
  if (!progress || lesson.steps.length === 0) return 0
  if (progress.status === 'completed') return 100
  return Math.round((progress.currentStepIndex / lesson.steps.length) * 100)
}

function getLessonProgressLabel(lesson: Lesson, progress: LessonProgress | undefined, mastery: SkillMastery[]) {
  if (!progress) return 'Ready to start'
  if (progress.status === 'inProgress' && hasCompletedLesson(progress)) return `Retaking step ${progress.currentStepIndex + 1} of ${lesson.steps.length}`
  if (progress.status === 'completed') {
    const completionState = getCompletionState(lesson, progress, mastery)
    if (completionState === 'mastered') return 'Mastered'
    if (completionState === 'review-suggested') return 'Review suggested'
    return 'Completed'
  }
  return `Step ${progress.currentStepIndex + 1} of ${lesson.steps.length}`
}

function getPathStatus({
  comingSoon,
  recommended,
  unlocked,
  lesson,
  lessonProgress,
  mastery,
}: {
  comingSoon: boolean
  recommended: boolean
  unlocked: boolean
  lesson: Lesson
  lessonProgress?: LessonProgress
  mastery: SkillMastery[]
}) {
  const completionState = getCompletionState(lesson, lessonProgress, mastery)

  if (lessonProgress?.status === 'inProgress' && hasCompletedLesson(lessonProgress)) {
    return { label: 'Retaking', className: 'available' }
  }
  if (completionState === 'mastered') return { label: 'Mastered', className: 'completed' }
  if (completionState === 'review-suggested') return { label: 'Review suggested', className: 'review' }
  if (completionState === 'completed') return { label: 'Completed', className: 'completed' }
  if (comingSoon) return { label: 'Coming soon', className: 'coming-soon' }
  if (recommended) return { label: 'Recommended', className: 'available' }
  if (lessonProgress?.status === 'inProgress') return { label: 'In progress', className: 'available' }
  if (unlocked) return { label: 'Available', className: 'available' }
  return { label: 'Locked', className: 'locked' }
}

function getReviewSuggestedLessonId(progressByLesson: ProgressByLesson, mastery: SkillMastery[]) {
  return algebraCourse.lessonOrder.find((lessonId) => {
    const lesson = lessons[lessonId]
    return getCompletionState(lesson, progressByLesson[lessonId], mastery) === 'review-suggested'
  })
}

function getCompletionState(lesson: Lesson, progress: LessonProgress | undefined, mastery: SkillMastery[]) {
  if (progress?.status !== 'completed') return 'not-completed'

  if (getAverageLessonMastery(lesson, mastery) < MASTERY_READY_THRESHOLD) {
    return 'review-suggested'
  }

  return isCleanCompletion(lesson, progress) ? 'mastered' : 'completed'
}

function getAverageLessonMastery(lesson: Lesson, mastery: SkillMastery[]) {
  if (!lesson.steps.some((step) => step.type !== 'concept')) return 1
  if (lesson.skillIds.length === 0) return 0

  const total = lesson.skillIds.reduce(
    (sum, skillId) => sum + (mastery.find((item) => item.skillId === skillId)?.score ?? 0),
    0,
  )
  return total / lesson.skillIds.length
}

function isCleanCompletion(lesson: Lesson, progress: LessonProgress) {
  const assessedStepIds = lesson.steps.filter((step) => step.type !== 'concept').map((step) => step.id)
  if (assessedStepIds.length === 0) return true

  return assessedStepIds.every((stepId) => {
    const result = progress.stepResults[stepId]
    return result?.correct === true && result.attempts <= 1
  })
}

function getLessonScoreText(lesson: Lesson, progress?: LessonProgress) {
  const latestScore = getLatestLessonScore(lesson, progress)
  const bestScore = getBestLessonScore(lesson, progress)
  return getScoreSummaryText(latestScore, bestScore)
}

function getScoreSummaryText(latestScore?: LessonScore, bestScore?: LessonScore) {
  if (!latestScore) return ''

  const latest = `Latest score: ${latestScore.scorePercent}% first try`
  if (bestScore && bestScore.scorePercent !== latestScore.scorePercent) {
    return `${latest} | Best: ${bestScore.scorePercent}%`
  }

  return latest
}

function getLessonScoreDetail(lesson: Lesson, progress: LessonProgress) {
  const latestScore = getLatestLessonScore(lesson, progress)
  if (!latestScore) return 'No scored completion yet.'
  if (latestScore.assessedStepCount === 0) return 'No assessed steps in this lesson.'

  return `${latestScore.correctFirstTryCount}/${latestScore.assessedStepCount} assessed steps correct on the first try.`
}

type LessonPlayerProps = {
  lesson: Lesson
  step: LessonStep
  progress: LessonProgress
  onBack: () => void
  onStepComplete: (
    step: LessonStep,
    correct: boolean,
    feedback: string,
    msToAnswer: number,
    options?: CompleteOptions,
  ) => void
}

type CompleteOptions = {
  advance?: boolean
  recordAttempt?: boolean
}

function LessonPlayer({ lesson, step, progress, onBack, onStepComplete }: LessonPlayerProps) {
  const stepStartedAt = useRef(0)
  const progressPercent = Math.round(((progress.currentStepIndex + 1) / lesson.steps.length) * 100)
  const isPhysicalBalanceStep = step.type === 'balance' && step.layout === 'physical-drag'

  useEffect(() => {
    stepStartedAt.current = performance.now()
  }, [step.id])

  return (
    <section className={`lesson-shell ${isPhysicalBalanceStep ? 'physical-lesson-shell' : ''}`}>
      <button className="back-button" type="button" onClick={onBack}>
        Back to path
      </button>
      <ProgressBar value={progressPercent} label={`Step ${progress.currentStepIndex + 1} of ${lesson.steps.length}`} />
      <StepRenderer
        key={step.id}
        step={step}
        priorResult={progress.stepResults[step.id]}
        onComplete={(correct, feedback, options) =>
          onStepComplete(step, correct, feedback, Math.round(performance.now() - stepStartedAt.current), options)
        }
        onAdvance={(feedback) =>
          onStepComplete(step, true, feedback, Math.round(performance.now() - stepStartedAt.current), {
            advance: true,
            recordAttempt: false,
          })
        }
      />
    </section>
  )
}

type StepRendererProps = {
  step: LessonStep
  priorResult?: { correct: boolean; attempts: number; feedback: string }
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
  onAdvance: (feedback: string) => void
}

function StepRenderer({ step, priorResult, onComplete, onAdvance }: StepRendererProps) {
  if (step.type === 'concept') {
    return <ConceptCard step={step} onContinue={() => onComplete(true, 'Concept viewed.', { recordAttempt: false })} />
  }

  if (step.type === 'mcq') {
    return <MultipleChoiceStep step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'input') {
    return <NumericInputStep step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'operation-choice') {
    return <OperationChoiceStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'sequence') {
    return <SequenceStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'manipulative') {
    // The discover-the-total mode is a different interaction (steppers + live total instead of a
    // pre-counted drag tray), so it has its own view. Dispatching here keeps each view's hooks
    // unconditional (rules-of-hooks).
    return step.goal.type === 'build-product' ? (
      <ManipulativeBuildView
        step={step}
        goal={step.goal}
        priorResult={priorResult}
        onAdvance={onAdvance}
        onComplete={onComplete}
      />
    ) : (
      <ManipulativeStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
    )
  }

  if (step.type === 'plot') {
    return <PlotStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'slider') {
    return <SliderStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'dragTerms') {
    return <DragTermsStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  return <BalanceStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
}

function ConceptCard({ step, onContinue }: { step: ConceptStep; onContinue: () => void }) {
  return (
    <article className="lesson-card card">
      <p className="eyebrow">Concept</p>
      <h1>{step.title}</h1>
      <p className="lead">{step.body}</p>
      <MiniScale visual={step.visual} />
      <button className="primary-action" type="button" onClick={onContinue}>
        Continue
      </button>
    </article>
  )
}

function MultipleChoiceStep({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: McqStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [selectedFeedback, setSelectedFeedback] = useState(priorResult?.feedback ?? '')
  const [selectedId, setSelectedId] = useState('')
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const wasCorrect = selectedId === step.correctId || Boolean(priorResult?.correct)

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Predict</p>
      <h1>{step.prompt}</h1>
      {step.visual === 'predict-add-left' && <PredictionScaleVisual />}
      <div className="option-grid">
        {step.options.map((option) => {
          const selected = selectedId === option.id || (!selectedId && priorResult?.correct && option.id === step.correctId)
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'selected-option' : ''}
              type="button"
              key={option.id}
              disabled={wasCorrect}
              onClick={() => {
                const nextAttempt = attempts + 1
                // Correctness and the hint -> explanation -> reveal escalation come from the
                // engine's checkMcqStep (the single source of truth for every assessed step),
                // so the view only owns presentation and the mcq-specific retry wording.
                const result = checkMcqStep(step, option.id, nextAttempt)
                const layeredReveal = result.correct ? '' : result.reveal ?? ''

                setSelectedId(option.id)
                setAttempts(nextAttempt)
                setSelectedFeedback(result.feedback)
                setReveal(layeredReveal)
                setRetryGuidance(
                  !result.correct && nextAttempt >= 3 && step.feedback?.reveal
                    ? 'Use the reveal, then choose the prediction that matches the totals.'
                    : 'Compare the two totals, then choose another option.',
                )
                onComplete(result.correct, result.feedback, { advance: false })
              }}
            >
              {option.label}
              {selected && <span className="option-state">Selected</span>}
            </button>
          )
        })}
      </div>
      {selectedFeedback && <FeedbackPanel key={attempts} correct={wasCorrect} message={selectedFeedback} reveal={!wasCorrect ? reveal : undefined} />}
      {selectedFeedback && !wasCorrect && <RetryPrompt message={retryGuidance || 'Choose another option to try again.'} />}
      {wasCorrect && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(selectedFeedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

function PredictionScaleVisual() {
  return (
    <div className="prediction-visual" aria-label="Compare a level scale with a prediction card where one pan has 3 plus 2 and the other has 3">
      <PredictScaleCard title="Start" left="3" right="3" cue="Both pans match" />
      <div className="prediction-operation">One pan changes</div>
      <PredictScaleCard title="Predict" left="3 + 2" right="3" cue="Which pan is heavier?" />
    </div>
  )
}

function PredictScaleCard({
  title,
  left,
  right,
  cue,
  tilt = 'level',
}: {
  title: string
  left: string
  right: string
  cue: string
  tilt?: 'level' | 'left-heavy'
}) {
  return (
    <div className={`predict-scale-card ${tilt}`}>
      <span className="predict-title">{title}</span>
      <div className="predict-mini-scale" aria-hidden="true">
        <div className="predict-beam">
          <span>{left}</span>
          <span>{right}</span>
        </div>
        <i />
      </div>
      <strong>{cue}</strong>
    </div>
  )
}

function NumericInputStep({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: Extract<LessonStep, { type: 'input' }>
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const hasAnswer = answer.trim().length > 0

  const submit = () => {
    // An empty/whitespace-only submission must not burn an attempt or ding mastery, so we
    // bail before checking. The Check button is also disabled, this guards the Enter key.
    if (!hasAnswer) return

    const nextAttempt = attempts + 1
    const result = checkInputStep(step, answer, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Try it</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <div className="puzzle-equation">
          <MathText display>{step.equation}</MathText>
        </div>
      )}
      <label className="answer-field">
        Your answer
        <input
          inputMode="decimal"
          placeholder="Type a number"
          value={answer}
          disabled={correct}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
      </label>
      <button className="primary-action" type="button" disabled={correct || !hasAnswer} onClick={submit}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && <RetryPrompt message={retryGuidance || 'Edit your answer and press Check again.'} />}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

function OperationChoiceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: OperationChoiceStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const choose = (choiceId: string) => {
    const nextAttempt = attempts + 1
    const result = checkOperationChoiceStep(step, choiceId, nextAttempt)
    setSelectedId(choiceId)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Choose a move</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <div className="puzzle-equation">
          <MathText display>{step.equation}</MathText>
        </div>
      )}
      <div className="operation-grid puzzle-grid">
        {step.choices.map((choice) => {
          const selected = selectedId === choice.id || (!selectedId && priorResult?.correct && choice.id === step.correctId)
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'selected-option' : ''}
              disabled={correct}
              key={choice.id}
              type="button"
              onClick={() => choose(choice.id)}
            >
              <span>
                <strong>{choice.label}</strong>
                {choice.detail && <small>{choice.detail}</small>}
              </span>
              {selected && <span className="option-state">Selected</span>}
            </button>
          )
        })}
      </div>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && <RetryPrompt message={retryGuidance || 'Choose another operation tile to try again.'} />}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

function SequenceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: SequenceStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(priorResult?.correct ? step.correctOrder : [])
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const selectedTiles = selectedIds
    .map((id) => step.tiles.find((tile) => tile.id === id))
    .filter((tile): tile is SequenceStep['tiles'][number] => Boolean(tile))
  const availableTiles = step.tiles.filter((tile) => !selectedIds.includes(tile.id))

  const addTile = (tileId: string) => {
    setSelectedIds((current) => [...current, tileId])
    setFeedback('')
    setReveal('')
    setRetryGuidance('')
  }

  const removeTile = (tileId: string) => {
    setSelectedIds((current) => {
      const index = current.lastIndexOf(tileId)
      return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current
    })
    setFeedback('')
    setReveal('')
    setRetryGuidance('')
  }

  const resetSelection = () => {
    setSelectedIds([])
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkSequenceStep(step, selectedIds, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  return (
    <article className="lesson-card card">
      <p className="eyebrow">Order the steps</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <div className="puzzle-equation">
          <MathText display>{step.equation}</MathText>
        </div>
      )}

      <div className="sequence-board">
        <div className="sequence-slots" aria-label="Selected solution steps">
          {selectedTiles.length === 0 && <span className="empty-slot">Tap tiles below to build your solution.</span>}
          {selectedTiles.map((tile, index) => (
            <button disabled={correct} key={tile.id} type="button" onClick={() => removeTile(tile.id)}>
              <span className="sequence-number">{index + 1}</span>
              <span>{tile.label}</span>
            </button>
          ))}
        </div>

        <div className="sequence-bank" aria-label="Available solution tiles">
          {availableTiles.map((tile) => (
            <button disabled={correct} key={tile.id} type="button" onClick={() => addTile(tile.id)}>
              <strong>{tile.label}</strong>
              {tile.detail && <small>{tile.detail}</small>}
            </button>
          ))}
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check order
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt
          message={retryGuidance || 'Adjust the order, or clear it and rebuild the solution.'}
          actionLabel="Clear order"
          onAction={resetSelection}
        />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

type ManipulativeDrag = {
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

function describeManipulativeGoal(step: ManipulativeStep) {
  if (step.goal.type === 'equal-groups') {
    return `Goal: make ${step.goal.groups} equal groups of ${step.goal.perGroup}, using all ${step.total}.`
  }
  if (step.goal.type === 'build-product') {
    // Deliberately omits the target numbers and the total: the learner maps the equation onto
    // the two controls and discovers the total (x) from the live readout rather than being told it.
    return 'Goal: set the number of groups and how many go in each to match the equation, then read the total they build.'
  }
  return `Goal: place exactly ${step.goal.count} into the group.`
}

function getManipulativeZoneAtPoint(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest<HTMLElement>('[data-zone-index]')
  if (!zone) return null
  const index = Number(zone.dataset.zoneIndex)
  return Number.isInteger(index) ? index : null
}

function ManipulativeStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: ManipulativeStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  // The drag/zone machinery here only handles the equal-groups/collect distribution puzzles;
  // the discover-the-total (build-product) mode is dispatched to ManipulativeBuildView upstream.
  const goal = step.goal as Extract<ManipulativeStep['goal'], { type: 'equal-groups' | 'collect' }>
  const zoneCount = goal.type === 'equal-groups' ? goal.groups : 1
  const makeEmptyGroups = () => Array.from({ length: zoneCount }, () => 0)
  const makeSolvedGroups = () =>
    goal.type === 'equal-groups'
      ? Array.from({ length: goal.groups }, () => goal.perGroup)
      : [goal.count]

  const [groups, setGroups] = useState<number[]>(priorResult?.correct ? makeSolvedGroups() : makeEmptyGroups())
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const [dragging, setDragging] = useState<ManipulativeDrag | null>(null)
  const [hoverZone, setHoverZone] = useState<number | null>(null)
  const [lastDropZone, setLastDropZone] = useState<number | null>(null)

  const placed = groups.reduce((total, count) => total + count, 0)
  const remaining = Math.max(0, step.total - placed)
  const chipGlyph = step.object.emoji ?? step.object.label.slice(0, 1).toUpperCase()
  const objectName = step.object.label

  useEffect(() => {
    if (lastDropZone === null) return
    const timeoutId = window.setTimeout(() => setLastDropZone(null), 420)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropZone])

  const clearStatus = useCallback(() => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }, [])

  const addToZone = useCallback(
    (zoneIndex: number) => {
      setGroups((current) => {
        const placedNow = current.reduce((total, count) => total + count, 0)
        if (placedNow >= step.total) return current
        const next = current.slice()
        next[zoneIndex] = (next[zoneIndex] ?? 0) + 1
        return next
      })
      setLastDropZone(null)
      window.requestAnimationFrame(() => setLastDropZone(zoneIndex))
      clearStatus()
    },
    [step.total, clearStatus],
  )

  const removeFromZone = (zoneIndex: number) => {
    setGroups((current) => {
      if ((current[zoneIndex] ?? 0) <= 0) return current
      const next = current.slice()
      next[zoneIndex] = next[zoneIndex] - 1
      return next
    })
    clearStatus()
  }

  const reset = () => {
    setGroups(makeEmptyGroups())
    setDragging(null)
    setHoverZone(null)
    setLastDropZone(null)
    clearStatus()
  }

  useEffect(() => {
    if (!dragging) return

    const handleMove = (event: PointerEvent) => {
      setDragging((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
      setHoverZone(getManipulativeZoneAtPoint(event.clientX, event.clientY))
    }
    const handleUp = (event: PointerEvent) => {
      const zoneIndex = getManipulativeZoneAtPoint(event.clientX, event.clientY)
      if (zoneIndex !== null) addToZone(zoneIndex)
      setDragging(null)
      setHoverZone(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, addToZone])

  const startDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (correct || remaining <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    setDragging({
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkManipulativeStep(step, groups, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  return (
    <article className="lesson-card card manipulative-card">
      <p className="eyebrow">Build it</p>
      <h1 className="build-prompt">{step.prompt}</h1>
      <p className="manipulative-goal" role="note">
        {describeManipulativeGoal(step)}
      </p>

      <div className="manipulative-stage">
        <div className="manipulative-tray" aria-label={`Tray with ${remaining} ${objectName}`}>
          <div className="manipulative-tray-head">
            <span className="tray-title">Tray</span>
            <span className="tray-count">{remaining} left</span>
          </div>
          <div className="object-row" aria-hidden="true">
            {remaining === 0 && <span className="tray-empty">Tray empty</span>}
            {Array.from({ length: remaining }, (_, index) => (
              <span className="object-chip" key={index} onPointerDown={startDrag}>
                {chipGlyph}
              </span>
            ))}
          </div>
          <p className="tray-hint">
            Drag {step.object.emoji ? 'an item' : `a ${objectName}`} onto a group, or use the + buttons.
          </p>
        </div>

        <div className="manipulative-zones">
          {groups.map((count, zoneIndex) => (
            <div
              className={`manipulative-zone ${hoverZone === zoneIndex ? 'drop-target' : ''} ${lastDropZone === zoneIndex ? 'zone-bounce' : ''} ${correct ? 'is-correct' : ''}`}
              data-zone-index={zoneIndex}
              key={zoneIndex}
              aria-label={`Group ${zoneIndex + 1}: ${count} ${objectName}`}
            >
              <div className="zone-head">
                <span className="zone-label">{zoneCount > 1 ? `Group ${zoneIndex + 1}` : 'Group'}</span>
                <span className="zone-count" aria-hidden="true">
                  {count}
                </span>
              </div>
              <div className="object-row" aria-hidden="true">
                {Array.from({ length: count }, (_, index) => (
                  <span className="object-chip placed" key={index}>
                    {chipGlyph}
                  </span>
                ))}
              </div>
              <div className="zone-controls">
                <button
                  type="button"
                  aria-label={`Remove one ${objectName} from group ${zoneIndex + 1}`}
                  disabled={correct || count <= 0}
                  onClick={() => removeFromZone(zoneIndex)}
                >
                  &minus;
                </button>
                <button
                  type="button"
                  aria-label={`Add one ${objectName} to group ${zoneIndex + 1}`}
                  disabled={correct || remaining <= 0}
                  onClick={() => addToZone(zoneIndex)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {dragging && (
        <DragPreview
          className="drag-preview object-chip"
          x={dragging.x}
          y={dragging.y}
          offsetX={dragging.offsetX}
          offsetY={dragging.offsetY}
          width={dragging.width}
          height={dragging.height}
        >
          {chipGlyph}
        </DragPreview>
      )}

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt
          message={retryGuidance || 'Adjust the groups, or reset and try again.'}
          actionLabel="Reset"
          onAction={reset}
        />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

// The "discover the total" manipulative: instead of a pre-counted tray (which would reveal the
// answer), the learner adjusts a number-of-groups stepper and a per-group stepper drawn from a
// large pool. A live total = groups x perGroup updates as either control changes and is the value
// (x) being discovered. The pure checkManipulativeStep verifies both controls match the targets.
function ManipulativeBuildView({
  step,
  goal,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: ManipulativeStep
  goal: Extract<ManipulativeStep['goal'], { type: 'build-product' }>
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const maxGroups = goal.maxGroups ?? Math.max(goal.groups + 2, 6)
  const maxPerGroup = goal.maxPerGroup ?? Math.max(goal.perGroup + 2, 6)

  const [numGroups, setNumGroups] = useState(priorResult?.correct ? goal.groups : 1)
  const [perGroup, setPerGroup] = useState(priorResult?.correct ? goal.perGroup : 1)
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const liveTotal = numGroups * perGroup
  const remaining = Math.max(0, step.total - liveTotal)
  const chipGlyph = step.object.emoji ?? step.object.label.slice(0, 1).toUpperCase()
  const objectName = step.object.label
  const plural = (count: number) => `${objectName}${count === 1 ? '' : 's'}`
  const poolChips = Math.min(remaining, 12)

  const clearStatus = useCallback(() => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }, [])

  const adjustGroups = (delta: number) => {
    setNumGroups((current) => {
      const next = current + delta
      if (next < 1 || next > maxGroups) return current
      // Never let the live total outgrow the pool the learner is drawing from.
      if (delta > 0 && next * perGroup > step.total) return current
      return next
    })
    clearStatus()
  }

  const adjustPerGroup = (delta: number) => {
    setPerGroup((current) => {
      const next = current + delta
      if (next < 0 || next > maxPerGroup) return current
      if (delta > 0 && numGroups * next > step.total) return current
      return next
    })
    clearStatus()
  }

  const reset = () => {
    setNumGroups(1)
    setPerGroup(1)
    clearStatus()
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkManipulativeStep(
      step,
      Array.from({ length: numGroups }, () => perGroup),
      nextAttempt,
    )
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  const canAddGroup = !correct && numGroups < maxGroups && (numGroups + 1) * perGroup <= step.total
  const canRemoveGroup = !correct && numGroups > 1
  const canAddPer = !correct && perGroup < maxPerGroup && numGroups * (perGroup + 1) <= step.total
  const canRemovePer = !correct && perGroup > 0
  const totalSentence = `${numGroups} ${numGroups === 1 ? 'group' : 'groups'} of ${perGroup} ${plural(perGroup)} = ${liveTotal} ${plural(liveTotal)} in total`

  return (
    <article className="lesson-card card manipulative-card">
      <p className="eyebrow">Build it</p>
      <h1 className="build-prompt">{step.prompt}</h1>
      <p className="manipulative-goal" role="note">
        {describeManipulativeGoal(step)}
      </p>

      <div className="manipulative-stage build-stage">
        <div className="build-controls">
          <div className="build-stepper" role="group" aria-label="Number of groups">
            <span className="stepper-label">Groups</span>
            <div className="stepper-row">
              <button
                type="button"
                aria-label="Remove one group"
                disabled={!canRemoveGroup}
                onClick={() => adjustGroups(-1)}
              >
                &minus;
              </button>
              <span className="stepper-value">{numGroups}</span>
              <button
                type="button"
                aria-label="Add one group"
                disabled={!canAddGroup}
                onClick={() => adjustGroups(1)}
              >
                +
              </button>
            </div>
          </div>

          <span className="build-operator" aria-hidden="true">
            {'\u00D7'}
          </span>

          <div className="build-stepper" role="group" aria-label={`${objectName} in each group`}>
            <span className="stepper-label">Per group</span>
            <div className="stepper-row">
              <button
                type="button"
                aria-label={`Remove one ${objectName} from each group`}
                disabled={!canRemovePer}
                onClick={() => adjustPerGroup(-1)}
              >
                &minus;
              </button>
              <span className="stepper-value">{perGroup}</span>
              <button
                type="button"
                aria-label={`Add one ${objectName} to each group`}
                disabled={!canAddPer}
                onClick={() => adjustPerGroup(1)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className={`build-total ${correct ? 'is-correct' : ''}`}>
          <div className="build-total-display" aria-hidden="true">
            <span className="build-total-eq">
              {numGroups} {'\u00D7'} {perGroup} =
            </span>
            <span className="build-total-value">{liveTotal}</span>
          </div>
          <p className="build-total-caption" role="status" aria-live="polite">
            {totalSentence}
          </p>
        </div>

        <div className="manipulative-zones build-zones">
          {Array.from({ length: numGroups }, (_, zoneIndex) => (
            <div
              className={`manipulative-zone build-zone ${correct ? 'is-correct' : ''}`}
              key={zoneIndex}
              aria-label={`Group ${zoneIndex + 1}: ${perGroup} ${plural(perGroup)}`}
            >
              <div className="zone-head">
                <span className="zone-label">Group {zoneIndex + 1}</span>
                <span className="zone-count" aria-hidden="true">
                  {perGroup}
                </span>
              </div>
              <div className="object-row" aria-hidden="true">
                {perGroup === 0 && <span className="tray-empty">Empty</span>}
                {Array.from({ length: perGroup }, (_, index) => (
                  <span className="object-chip placed" key={index}>
                    {chipGlyph}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="build-pool" aria-label={`Pool with ${remaining} ${plural(remaining)} left`}>
          <span className="build-pool-text">
            Pulling from a pool of {step.total} {objectName}. {remaining} still in the pool.
          </span>
          <span className="build-pool-chips" aria-hidden="true">
            {Array.from({ length: poolChips }, (_, index) => (
              <span className="object-chip pool-chip" key={index}>
                {chipGlyph}
              </span>
            ))}
            {remaining > poolChips && <span className="build-pool-more">+{remaining - poolChips}</span>}
          </span>
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      {feedback && (
        <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />
      )}
      {feedback && !correct && (
        <RetryPrompt
          message={retryGuidance || 'Adjust the number of groups or how many go in each, then check again.'}
          actionLabel="Reset"
          onAction={reset}
        />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

const PLOT_VIEW_BOX = 360
const PLOT_PADDING = 34
const PLOT_AREA = PLOT_VIEW_BOX - PLOT_PADDING * 2
const PLOT_QUADRANT_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

const clampToRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function describePlotGoal(step: PlotStep): string {
  if (step.target.kind === 'points') {
    const count = step.target.points.length
    return count === 1 ? 'Goal: place 1 point.' : `Goal: place ${count} points.`
  }
  const quadrants = step.target.quadrants
  if (quadrants.length === 1) {
    return `Goal: place 1 point in Quadrant ${PLOT_QUADRANT_LABELS[quadrants[0]]}.`
  }
  return `Goal: place ${quadrants.length} points, one in each quadrant.`
}

// A representative off-axis point per quadrant so a previously-solved quadrant task can be
// re-shown as solved on return (mirrors the resume behaviour of the other interactive steps).
function plotRepresentativePoint(quadrant: 1 | 2 | 3 | 4, range: { min: number; max: number }): PlotPoint {
  const magnitude = Math.max(1, Math.min(2, Math.min(range.max, Math.abs(range.min))))
  return {
    x: quadrant === 1 || quadrant === 4 ? magnitude : -magnitude,
    y: quadrant === 1 || quadrant === 2 ? magnitude : -magnitude,
  }
}

function PlotStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: PlotStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { range, target } = step
  const requiredCount = target.kind === 'points' ? target.points.length : target.quadrants.length
  const makeSolvedPoints = (): PlotPoint[] =>
    target.kind === 'points'
      ? target.points.map((point) => ({ ...point }))
      : target.quadrants.map((quadrant) => plotRepresentativePoint(quadrant, range))

  const [points, setPoints] = useState<PlotPoint[]>(priorResult?.correct ? makeSolvedPoints() : [])
  const [cursor, setCursor] = useState<PlotPoint>({ x: 0, y: 0 })
  const [showCursor, setShowCursor] = useState(false)
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const svgRef = useRef<SVGSVGElement | null>(null)

  const span = range.max - range.min || 1
  const midpoint = (range.min + range.max) / 2
  const ticks = Array.from({ length: span + 1 }, (_, index) => range.min + index)
  const toSvgX = (x: number) => PLOT_PADDING + ((x - range.min) / span) * PLOT_AREA
  const toSvgY = (y: number) => PLOT_PADDING + ((range.max - y) / span) * PLOT_AREA

  const clearStatus = () => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }

  const placePoint = (raw: PlotPoint) => {
    if (correct) return
    const x = clampToRange(Math.round(raw.x), range.min, range.max)
    const y = clampToRange(Math.round(raw.y), range.min, range.max)
    setPoints((current) => {
      if (current.some((existing) => existing.x === x && existing.y === y)) return current
      if (requiredCount <= 1) return [{ x, y }]
      if (current.length >= requiredCount) return current
      return [...current, { x, y }]
    })
    clearStatus()
  }

  const togglePoint = (raw: PlotPoint) => {
    if (correct) return
    const x = clampToRange(Math.round(raw.x), range.min, range.max)
    const y = clampToRange(Math.round(raw.y), range.min, range.max)
    if (points.some((existing) => existing.x === x && existing.y === y)) {
      setPoints((current) => current.filter((existing) => !(existing.x === x && existing.y === y)))
      clearStatus()
      return
    }
    placePoint({ x, y })
  }

  const undo = () => {
    setPoints((current) => current.slice(0, -1))
    clearStatus()
  }

  const clearAll = () => {
    setPoints([])
    clearStatus()
  }

  const dataPointFromEvent = (event: React.PointerEvent<SVGSVGElement>): PlotPoint | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const svgX = ((event.clientX - rect.left) / rect.width) * PLOT_VIEW_BOX
    const svgY = ((event.clientY - rect.top) / rect.height) * PLOT_VIEW_BOX
    return {
      x: ((svgX - PLOT_PADDING) / PLOT_AREA) * span + range.min,
      y: range.max - ((svgY - PLOT_PADDING) / PLOT_AREA) * span,
    }
  }

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (correct) return
    const point = dataPointFromEvent(event)
    if (!point) return
    // Ignore taps that land well outside the plotting area (e.g. on the label gutter).
    if (
      point.x < range.min - 0.6 ||
      point.x > range.max + 0.6 ||
      point.y < range.min - 0.6 ||
      point.y > range.max + 0.6
    ) {
      return
    }
    const rounded = {
      x: clampToRange(Math.round(point.x), range.min, range.max),
      y: clampToRange(Math.round(point.y), range.min, range.max),
    }
    setCursor(rounded)
    togglePoint(rounded)
  }

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (correct) return
    const moves: Record<string, PlotPoint> = {
      ArrowUp: { x: 0, y: 1 },
      ArrowDown: { x: 0, y: -1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setShowCursor(true)
      setCursor((current) => ({
        x: clampToRange(current.x + move.x, range.min, range.max),
        y: clampToRange(current.y + move.y, range.min, range.max),
      }))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setShowCursor(true)
      togglePoint(cursor)
    }
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkPlotStep(step, points, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  const placedSummary =
    points.length === 0
      ? 'No points placed yet.'
      : `Placed ${points.length} of ${requiredCount}: ${points.map((point) => `(${point.x}, ${point.y})`).join(', ')}`

  return (
    <article className="lesson-card card plot-card">
      <p className="eyebrow">Plot it</p>
      <h1>{step.prompt}</h1>
      <p className="plot-goal" role="note">
        {describePlotGoal(step)}
      </p>

      <div className="plot-stage">
        <svg
          ref={svgRef}
          className="plot-grid"
          viewBox={`0 0 ${PLOT_VIEW_BOX} ${PLOT_VIEW_BOX}`}
          role="application"
          tabIndex={correct ? -1 : 0}
          aria-label={`Coordinate grid from ${range.min} to ${range.max} on both axes. Use the arrow keys to move the cursor and Enter to place a point. ${placedSummary}`}
          onPointerDown={handlePointer}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowCursor(true)}
          onBlur={() => setShowCursor(false)}
        >
          {ticks.map((tick) => (
            <g key={`grid-${tick}`}>
              <line
                className="plot-gridline"
                x1={toSvgX(tick)}
                y1={toSvgY(range.min)}
                x2={toSvgX(tick)}
                y2={toSvgY(range.max)}
              />
              <line
                className="plot-gridline"
                x1={toSvgX(range.min)}
                y1={toSvgY(tick)}
                x2={toSvgX(range.max)}
                y2={toSvgY(tick)}
              />
            </g>
          ))}
          <line className="plot-axis" x1={toSvgX(range.min)} y1={toSvgY(0)} x2={toSvgX(range.max)} y2={toSvgY(0)} />
          <line className="plot-axis" x1={toSvgX(0)} y1={toSvgY(range.min)} x2={toSvgX(0)} y2={toSvgY(range.max)} />
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text
                key={`xlabel-${tick}`}
                className="plot-tick-label"
                x={toSvgX(tick)}
                y={toSvgY(0) + 15}
                textAnchor="middle"
              >
                {tick}
              </text>
            ))}
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text
                key={`ylabel-${tick}`}
                className="plot-tick-label"
                x={toSvgX(0) - 9}
                y={toSvgY(tick) + 4}
                textAnchor="end"
              >
                {tick}
              </text>
            ))}
          <text className="plot-axis-name" x={toSvgX(range.max) - 2} y={toSvgY(0) - 9} textAnchor="end">
            x
          </text>
          <text className="plot-axis-name" x={toSvgX(0) + 11} y={toSvgY(range.max) + 6} textAnchor="start">
            y
          </text>
          {showCursor && !correct && (
            <circle className="plot-cursor" cx={toSvgX(cursor.x)} cy={toSvgY(cursor.y)} r={9} aria-hidden="true" />
          )}
          {points.map((point, index) => {
            const onRight = point.x >= midpoint
            const onTop = point.y >= midpoint
            return (
              <g className={`plot-point ${correct ? 'is-correct' : ''}`} key={`${point.x}-${point.y}-${index}`}>
                <circle cx={toSvgX(point.x)} cy={toSvgY(point.y)} r={7} />
                <text
                  className="plot-point-label"
                  x={toSvgX(point.x) + (onRight ? -11 : 11)}
                  y={toSvgY(point.y) + (onTop ? 19 : -10)}
                  textAnchor={onRight ? 'end' : 'start'}
                >
                  ({point.x}, {point.y})
                </text>
              </g>
            )
          })}
        </svg>

        <div className="plot-controls">
          <p className="plot-placed" aria-live="polite">
            {placedSummary}
          </p>
          {points.length > 0 && !correct && (
            <div className="plot-actions">
              <button type="button" onClick={undo}>
                Undo
              </button>
              <button type="button" onClick={clearAll}>
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct || points.length === 0} onClick={check}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt message={retryGuidance || 'Adjust your point, or clear it and try again.'} actionLabel="Clear" onAction={clearAll} />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

// Formats a slope/intercept pair as a slope-intercept equation, e.g. "y = 3x + 2",
// "y = -x", "y = 2x", or "y = 5" (a flat line). Used for the live readout and the
// screen-reader value text on each slider.
function formatLineEquation(slope: number, intercept: number): string {
  if (slope === 0) return `y = ${intercept}`
  const slopePart = slope === 1 ? 'x' : slope === -1 ? '-x' : `${slope}x`
  if (intercept === 0) return `y = ${slopePart}`
  return `y = ${slopePart} ${intercept > 0 ? '+' : '-'} ${Math.abs(intercept)}`
}

// Clips the infinite line y = mx + b to the visible square grid, returning the two points
// where it enters and leaves the box so the SVG segment never spills past the axes.
function sliderLineEndpoints(
  slope: number,
  intercept: number,
  range: { min: number; max: number },
): [PlotPoint, PlotPoint] {
  const { min, max } = range
  const within = (value: number) => value >= min - 1e-9 && value <= max + 1e-9
  const candidates: PlotPoint[] = []
  const pushUnique = (point: PlotPoint) => {
    const key = (value: number) => Math.round(value * 1000) / 1000
    if (candidates.some((existing) => key(existing.x) === key(point.x) && key(existing.y) === key(point.y))) return
    candidates.push(point)
  }

  const yAtMin = slope * min + intercept
  if (within(yAtMin)) pushUnique({ x: min, y: yAtMin })
  const yAtMax = slope * max + intercept
  if (within(yAtMax)) pushUnique({ x: max, y: yAtMax })
  if (slope !== 0) {
    const xAtMax = (max - intercept) / slope
    if (within(xAtMax)) pushUnique({ x: xAtMax, y: max })
    const xAtMin = (min - intercept) / slope
    if (within(xAtMin)) pushUnique({ x: xAtMin, y: min })
  }

  if (candidates.length >= 2) return [candidates[0], candidates[1]]
  // Fallback (line barely grazes the box): draw across the full width.
  return [
    { x: min, y: slope * min + intercept },
    { x: max, y: slope * max + intercept },
  ]
}

// Neutral non-target starting values so a fresh task is never pre-solved: a flat line on
// the x-axis (m = 0, b = 0) when both sit inside the controls, otherwise the low corner.
function sliderInitialValue(step: SliderStep): { slope: number; intercept: number } {
  const slope = clampToRange(0, step.slope.min, step.slope.max)
  const intercept = clampToRange(0, step.intercept.min, step.intercept.max)
  if (slope === step.target.slope && intercept === step.target.intercept) {
    return { slope: step.slope.min, intercept: step.intercept.min }
  }
  return { slope, intercept }
}

function SliderStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: SliderStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const { range } = step
  const initial = sliderInitialValue(step)
  const [slope, setSlope] = useState(priorResult?.correct ? step.target.slope : initial.slope)
  const [intercept, setIntercept] = useState(priorResult?.correct ? step.target.intercept : initial.intercept)
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')

  const span = range.max - range.min || 1
  const ticks = Array.from({ length: span + 1 }, (_, index) => range.min + index)
  const toSvgX = (x: number) => PLOT_PADDING + ((x - range.min) / span) * PLOT_AREA
  const toSvgY = (y: number) => PLOT_PADDING + ((range.max - y) / span) * PLOT_AREA

  const slopeStep = step.slope.step ?? 1
  const interceptStep = step.intercept.step ?? 1
  const equation = formatLineEquation(slope, intercept)
  const [lineStart, lineEnd] = sliderLineEndpoints(slope, intercept, range)

  // The rise-over-run guide (run 1 right, then rise m up from the y-intercept) only renders
  // when the whole step fits on the grid, so a steep slope hides it instead of overflowing.
  const interceptInRange = intercept >= range.min && intercept <= range.max
  const riseEnd = intercept + slope
  const guideVisible =
    slope !== 0 &&
    interceptInRange &&
    1 >= range.min &&
    1 <= range.max &&
    riseEnd >= range.min &&
    riseEnd <= range.max

  const clearStatus = () => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }

  const updateSlope = (next: number) => {
    if (correct) return
    setSlope(next)
    clearStatus()
  }

  const updateIntercept = (next: number) => {
    if (correct) return
    setIntercept(next)
    clearStatus()
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkSliderStep(step, { slope, intercept }, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  const reset = () => {
    setSlope(initial.slope)
    setIntercept(initial.intercept)
    clearStatus()
  }

  return (
    <article className="lesson-card card slider-card">
      <p className="eyebrow">Drag it</p>
      <h1 className="build-prompt">{step.prompt}</h1>
      <p className="slider-goal" role="note">
        Goal: drag the m and b sliders until the live line matches the description.
      </p>

      <div className="slider-stage">
        <svg
          className={`plot-grid slider-grid ${correct ? 'is-correct' : ''}`}
          viewBox={`0 0 ${PLOT_VIEW_BOX} ${PLOT_VIEW_BOX}`}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <g key={`grid-${tick}`}>
              <line className="plot-gridline" x1={toSvgX(tick)} y1={toSvgY(range.min)} x2={toSvgX(tick)} y2={toSvgY(range.max)} />
              <line className="plot-gridline" x1={toSvgX(range.min)} y1={toSvgY(tick)} x2={toSvgX(range.max)} y2={toSvgY(tick)} />
            </g>
          ))}
          <line className="plot-axis" x1={toSvgX(range.min)} y1={toSvgY(0)} x2={toSvgX(range.max)} y2={toSvgY(0)} />
          <line className="plot-axis" x1={toSvgX(0)} y1={toSvgY(range.min)} x2={toSvgX(0)} y2={toSvgY(range.max)} />
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text key={`xlabel-${tick}`} className="plot-tick-label" x={toSvgX(tick)} y={toSvgY(0) + 15} textAnchor="middle">
                {tick}
              </text>
            ))}
          {ticks
            .filter((tick) => tick !== 0)
            .map((tick) => (
              <text key={`ylabel-${tick}`} className="plot-tick-label" x={toSvgX(0) - 9} y={toSvgY(tick) + 4} textAnchor="end">
                {tick}
              </text>
            ))}
          <text className="plot-axis-name" x={toSvgX(range.max) - 2} y={toSvgY(0) - 9} textAnchor="end">
            x
          </text>
          <text className="plot-axis-name" x={toSvgX(0) + 11} y={toSvgY(range.max) + 6} textAnchor="start">
            y
          </text>
          {guideVisible && (
            <g className="slider-guide">
              <line x1={toSvgX(0)} y1={toSvgY(intercept)} x2={toSvgX(1)} y2={toSvgY(intercept)} />
              <line x1={toSvgX(1)} y1={toSvgY(intercept)} x2={toSvgX(1)} y2={toSvgY(riseEnd)} />
              <text className="slider-guide-label" x={toSvgX(0.5)} y={toSvgY(intercept) + 14} textAnchor="middle">
                run 1
              </text>
              <text className="slider-guide-label" x={toSvgX(1) + 6} y={toSvgY((intercept + riseEnd) / 2) + 4} textAnchor="start">
                rise {slope}
              </text>
            </g>
          )}
          <line className="slider-line" x1={toSvgX(lineStart.x)} y1={toSvgY(lineStart.y)} x2={toSvgX(lineEnd.x)} y2={toSvgY(lineEnd.y)} />
          {interceptInRange && (
            <g className="slider-intercept-point">
              <circle cx={toSvgX(0)} cy={toSvgY(intercept)} r={6} />
              <text className="plot-point-label" x={toSvgX(0) + 11} y={toSvgY(intercept) - 10} textAnchor="start">
                b = {intercept}
              </text>
            </g>
          )}
        </svg>

        <div className="slider-controls">
          <p className="slider-equation" aria-live="polite">
            <MathText>{equation}</MathText>
          </p>
          <label className="slider-control">
            <span className="slider-control-head">
              <span>Slope m</span>
              <span className="slider-value">{slope}</span>
            </span>
            <input
              type="range"
              min={step.slope.min}
              max={step.slope.max}
              step={slopeStep}
              value={slope}
              disabled={correct}
              aria-label="Slope m"
              aria-valuetext={`slope ${slope}, line ${equation}`}
              onChange={(event) => updateSlope(Number(event.target.value))}
            />
            <span className="slider-range-ends" aria-hidden="true">
              <span>{step.slope.min}</span>
              <span>{step.slope.max}</span>
            </span>
          </label>
          <label className="slider-control">
            <span className="slider-control-head">
              <span>Intercept b</span>
              <span className="slider-value">{intercept}</span>
            </span>
            <input
              type="range"
              min={step.intercept.min}
              max={step.intercept.max}
              step={interceptStep}
              value={intercept}
              disabled={correct}
              aria-label="Intercept b"
              aria-valuetext={`intercept ${intercept}, line ${equation}`}
              onChange={(event) => updateIntercept(Number(event.target.value))}
            />
            <span className="slider-range-ends" aria-hidden="true">
              <span>{step.intercept.min}</span>
              <span>{step.intercept.max}</span>
            </span>
          </label>
        </div>
      </div>

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt message={retryGuidance || 'Adjust the m and b sliders, then check again.'} actionLabel="Reset" onAction={reset} />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

// A reserved zone id for the tile tray, so the same drop detection that places a tile in a bin
// can also send it back to the tray (bins use their authored, non-underscored ids).
const TERM_TRAY_ZONE = '__tray__'

// Detects which sorting zone (a bin id or the tray) sits under a pointer during a drag,
// mirroring the manipulative puzzle's drop detection so touch and mouse share one code path.
function getTermZoneAtPoint(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest<HTMLElement>('[data-term-zone]')
  return zone?.dataset.termZone ?? null
}

type TermDrag = {
  tileId: string
  label: string
  startX: number
  startY: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  // Whether the pointer has travelled far enough to count as a drag (vs. a tap).
  moved: boolean
}

function DragTermsStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: DragTermsStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const makeSolvedPlacements = () =>
    step.tiles.reduce<Record<string, string>>((placements, tile) => {
      placements[tile.id] = tile.bin
      return placements
    }, {})

  const [placements, setPlacements] = useState<Record<string, string>>(
    priorResult?.correct ? makeSolvedPlacements() : {},
  )
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const [dragging, setDragging] = useState<TermDrag | null>(null)
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  const [lastDropZone, setLastDropZone] = useState<string | null>(null)
  // The browser fires a click after a pointer interaction; this lets the keyboard-only onClick
  // path ignore that synthetic click so a pointer tap is not handled twice.
  const pointerActiveRef = useRef(false)

  const trayTiles = step.tiles.filter((tile) => !placements[tile.id])
  const selectedTile = step.tiles.find((tile) => tile.id === selectedTileId)

  useEffect(() => {
    if (lastDropZone === null) return
    const timeoutId = window.setTimeout(() => setLastDropZone(null), 420)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropZone])

  const clearStatus = useCallback(() => {
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }, [])

  const assignTile = useCallback(
    (tileId: string, zone: string) => {
      setPlacements((current) => {
        const next = { ...current }
        if (zone === TERM_TRAY_ZONE) {
          delete next[tileId]
        } else {
          next[tileId] = zone
        }
        return next
      })
      if (zone !== TERM_TRAY_ZONE) {
        setLastDropZone(null)
        window.requestAnimationFrame(() => setLastDropZone(zone))
      }
      setSelectedTileId(null)
      clearStatus()
    },
    [clearStatus],
  )

  const handleTileTap = useCallback(
    (tileId: string) => {
      if (correct) return
      // A placed tile pops back to the tray when tapped; a tray tile toggles selection so the
      // learner can then choose a bin (the no-drag, fully keyboard-accessible path).
      if (placements[tileId]) {
        assignTile(tileId, TERM_TRAY_ZONE)
        return
      }
      setSelectedTileId((current) => (current === tileId ? null : tileId))
      clearStatus()
    },
    [correct, placements, assignTile, clearStatus],
  )

  useEffect(() => {
    if (!dragging) return

    const handleMove = (event: PointerEvent) => {
      setDragging((current) => {
        if (!current) return current
        const moved =
          current.moved ||
          Math.abs(event.clientX - current.startX) > 6 ||
          Math.abs(event.clientY - current.startY) > 6
        return { ...current, x: event.clientX, y: event.clientY, moved }
      })
      setHoverZone(getTermZoneAtPoint(event.clientX, event.clientY))
    }
    const handleUp = (event: PointerEvent) => {
      if (dragging.moved) {
        const zone = getTermZoneAtPoint(event.clientX, event.clientY)
        if (zone) assignTile(dragging.tileId, zone)
      } else {
        // No real movement: treat the press as a tap (select, or return a placed tile).
        handleTileTap(dragging.tileId)
      }
      setDragging(null)
      setHoverZone(null)
      window.setTimeout(() => {
        pointerActiveRef.current = false
      }, 0)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, assignTile, handleTileTap])

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, tile: DragTermsStep['tiles'][number]) => {
    if (correct) return
    pointerActiveRef.current = true
    const rect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    setDragging({
      tileId: tile.id,
      label: tile.label,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    })
  }

  const handleTileClick = (tileId: string) => {
    // Pointer taps are resolved in the global pointerup handler; only keyboard activations
    // (no preceding pointer interaction) should fall through to the tap handler here.
    if (pointerActiveRef.current) return
    handleTileTap(tileId)
  }

  const handleBinActivate = (binId: string) => {
    if (correct || !selectedTileId) return
    assignTile(selectedTileId, binId)
  }

  const reset = () => {
    setPlacements({})
    setSelectedTileId(null)
    setDragging(null)
    setHoverZone(null)
    setLastDropZone(null)
    clearStatus()
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkDragTermsStep(step, placements, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  const binsSummary = step.bins
    .map((bin) => {
      const labels = step.tiles.filter((tile) => placements[tile.id] === bin.id).map((tile) => tile.label)
      return `${bin.label}: ${labels.length ? labels.join(', ') : 'empty'}`
    })
    .join('. ')
  const traySummary =
    trayTiles.length === 0 ? 'All tiles sorted.' : `Unsorted: ${trayTiles.map((tile) => tile.label).join(', ')}.`
  const summary = `${binsSummary}. ${traySummary}`

  return (
    <article className="lesson-card card drag-terms-card">
      <p className="eyebrow">Sort it</p>
      <h1>{step.prompt}</h1>
      {step.equation && (
        <p className="drag-terms-equation">
          <MathText>{step.equation}</MathText>
        </p>
      )}
      <p className="drag-terms-goal" role="note">
        Goal: drop every term tile into the bin that matches its variable part.
      </p>

      <div className="drag-terms-stage">
        <div className="term-tray" data-term-zone={TERM_TRAY_ZONE} aria-label={`Term tile tray, ${trayTiles.length} unsorted`}>
          <div className="term-tray-head">
            <span className="tray-title">Term tiles</span>
            <span className="tray-count">{trayTiles.length} left</span>
          </div>
          <div className="term-tile-row">
            {trayTiles.length === 0 && <span className="tray-empty">All tiles sorted</span>}
            {trayTiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                className={`term-tile ${selectedTileId === tile.id ? 'is-selected' : ''}`}
                aria-pressed={selectedTileId === tile.id}
                aria-label={`Term ${tile.label}${selectedTileId === tile.id ? ', selected' : ''}`}
                disabled={correct}
                onPointerDown={(event) => startDrag(event, tile)}
                onClick={() => handleTileClick(tile.id)}
              >
                {tile.label}
              </button>
            ))}
          </div>
          <p className="tray-hint">
            Drag a tile into a bin, or tap a tile then a bin&rsquo;s &ldquo;Place here&rdquo;. Tap a sorted tile to send it back.
          </p>
        </div>

        <div className="term-bins">
          {step.bins.map((bin) => {
            const tilesInBin = step.tiles.filter((tile) => placements[tile.id] === bin.id)
            return (
              <div
                key={bin.id}
                className={`term-bin ${hoverZone === bin.id ? 'drop-target' : ''} ${lastDropZone === bin.id ? 'bin-bounce' : ''} ${correct ? 'is-correct' : ''}`}
                data-term-zone={bin.id}
                role="group"
                aria-label={`${bin.label}: ${tilesInBin.length ? tilesInBin.map((tile) => tile.label).join(', ') : 'empty'}`}
              >
                <div className="term-bin-head">
                  <span className="bin-label">{bin.label}</span>
                  {bin.detail && <span className="bin-detail">{bin.detail}</span>}
                  <span className="bin-count" aria-hidden="true">
                    {tilesInBin.length}
                  </span>
                </div>
                <div className="term-bin-tiles">
                  {tilesInBin.length === 0 && (
                    <span className="bin-empty" aria-hidden="true">
                      Drop here
                    </span>
                  )}
                  {tilesInBin.map((tile) => (
                    <button
                      key={tile.id}
                      type="button"
                      className="term-tile placed"
                      aria-label={`Term ${tile.label}, in ${bin.label}. Activate to return it to the tray.`}
                      disabled={correct}
                      onPointerDown={(event) => startDrag(event, tile)}
                      onClick={() => handleTileClick(tile.id)}
                    >
                      {tile.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="term-bin-place"
                  disabled={correct || !selectedTileId}
                  onClick={() => handleBinActivate(bin.id)}
                >
                  {selectedTile ? `Place ${selectedTile.label} here` : 'Place here'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <p className="drag-terms-summary" aria-live="polite">
        {summary}
      </p>

      {dragging?.moved && (
        <DragPreview
          className="drag-preview term-tile"
          x={dragging.x}
          y={dragging.y}
          offsetX={dragging.offsetX}
          offsetY={dragging.offsetY}
          width={dragging.width}
          height={dragging.height}
        >
          {dragging.label}
        </DragPreview>
      )}

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt
          message={retryGuidance || 'Move the tiles into the right bins, or reset and try again.'}
          actionLabel="Reset"
          onAction={reset}
        />
      )}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

// The floating "ghost" tile that follows the pointer while dragging. It is portaled to
// <body> on purpose: its ancestor .lesson-card keeps a transform after its card-enter
// entrance animation (animation-fill-mode: both leaves transform: translateY(0)), and a
// transformed ancestor becomes the containing block for position: fixed children. Left
// inside the card, this fixed element's left/top would be measured from the card's box
// instead of the viewport, so the ghost drifted away from the cursor (and worse as the
// page scrolled). Portaling to <body> restores viewport-relative fixed positioning, so
// left = clientX - grabOffsetX tracks the pointer exactly for both mouse and touch.
function DragPreview({
  className,
  x,
  y,
  offsetX,
  offsetY,
  width,
  height,
  children,
}: {
  className: string
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  children: React.ReactNode
}) {
  return createPortal(
    <div className={className} style={{ left: x - offsetX, top: y - offsetY, width, height }}>
      {children}
    </div>,
    document.body,
  )
}

function BalanceStepView({
  step,
  priorResult,
  onAdvance,
  onComplete,
}: {
  step: BalanceStep
  priorResult?: StepRendererProps['priorResult']
  onAdvance: (feedback: string) => void
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
}) {
  const [resume] = useState(() => {
    // If this step was already solved on a previous visit (correct, but the learner never
    // pressed Continue), rebuild a genuinely solved scale so it matches the "Correct"
    // banner instead of showing the original unsolved setup. If it cannot be
    // reconstructed, fall back to the start state with no banner so nothing is misleading.
    const solvedState = priorResult?.correct ? reconstructSolvedBalanceState(step) : null
    return solvedState
      ? { state: solvedState, correct: true, feedback: priorResult?.feedback ?? '' }
      : { state: cloneBalanceState(step.state), correct: false, feedback: '' }
  })
  const [state, setState] = useState<BalanceState>(resume.state)
  const [dragging, setDragging] = useState<DraggingTile | null>(null)
  const [hoverTarget, setHoverTarget] = useState<DropTarget | null>(null)
  const [lastDropSide, setLastDropSide] = useState<BalanceSide | null>(null)
  const [feedback, setFeedback] = useState(resume.feedback)
  const [correct, setCorrect] = useState(resume.correct)
  const [meta, setMeta] = useState<BalanceCheckMeta>({})
  const [attempts, setAttempts] = useState(priorResult?.attempts ?? 0)
  const [reveal, setReveal] = useState('')
  const [retryGuidance, setRetryGuidance] = useState('')
  const [lastChange, setLastChange] = useState('')

  const leftTotal = sideTotal(state.left)
  const rightTotal = sideTotal(state.right)
  const balanceCue = getBalanceCue(leftTotal, rightTotal)
  const tilt = Math.max(-11, Math.min(11, (rightTotal - leftTotal) * 3))
  const isPhysicalDrag = step.layout === 'physical-drag'
  // A tray-backed step lets the learner drag weights on/off the pans, so re-dragging
  // (between pans, or back to the tray) is the recovery path. Operation-based steps
  // transform the scale instead, so they still need an explicit reset.
  const hasTray = step.state.bank !== undefined
  const usesOperations = Boolean(step.operations && step.operations.length > 0)
  const bankItems = state.bank ?? []

  useEffect(() => {
    if (!lastDropSide) return

    const timeoutId = window.setTimeout(() => setLastDropSide(null), 420)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropSide])

  const activeDragItem = dragging?.item

  // Moves a weight to any drop target: a pan or back to the tray. The item is first
  // removed from wherever it currently sits, so a block dropped on the wrong side can
  // simply be dragged again to the correct side (or to the tray) with no reset needed.
  const moveItem = useCallback(
    (item: BalanceItem, target: DropTarget) => {
      const without = (items: BalanceItem[] | undefined) =>
        (items ?? []).filter((candidate) => candidate.id !== item.id)

      const nextState: BalanceState = {
        ...state,
        left: without(state.left),
        right: without(state.right),
        bank: without(state.bank),
      }

      if (target === 'bank') {
        nextState.bank = [...(nextState.bank ?? []), item]
      } else {
        nextState[target] = [...nextState[target], item]
      }

      setState(nextState)
      setMeta({})
      setLastDropSide(null)
      if (target !== 'bank') {
        window.requestAnimationFrame(() => setLastDropSide(target))
      }
      setLastChange(describeMove(item, target, state, nextState, isPhysicalDrag))
      setFeedback('')
      setCorrect(false)
      setReveal('')
      setRetryGuidance('')
    },
    [isPhysicalDrag, state],
  )

  useEffect(() => {
    if (!activeDragItem) return

    const activeItem = activeDragItem

    const handlePointerMove = (event: PointerEvent) => {
      setDragging((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
      setHoverTarget(getDropTargetAtPoint(event.clientX, event.clientY))
    }

    const handlePointerUp = (event: PointerEvent) => {
      const target = getDropTargetAtPoint(event.clientX, event.clientY)
      if (target) {
        moveItem(activeItem, target)
      }
      setDragging(null)
      setHoverTarget(null)
    }

    const handlePointerCancel = () => {
      setDragging(null)
      setHoverTarget(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [activeDragItem, moveItem])

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({
      item,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  const quickDrop = (item: BalanceItem, side: BalanceSide) => {
    moveItem(item, side)
  }

  const resetAttempt = () => {
    setState(cloneBalanceState(step.state))
    setDragging(null)
    setHoverTarget(null)
    setLastDropSide(null)
    setLastChange('Scale reset to the starting equation.')
    setFeedback('')
    setCorrect(false)
    setMeta({})
    setReveal('')
    setRetryGuidance('')
  }

  const applyOperation = (operation: BalanceOperation) => {
    const nextState = applyBalanceOperation(state, operation)
    setState(nextState)
    setMeta({ movedOneSideOnly: operation.sides !== 'both' })
    setLastChange(describeBalanceChange(state, nextState, `Applied ${operation.label}.`))
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }

  const check = () => {
    const nextAttempt = attempts + 1
    const result = checkBalanceStep(step, state, meta, nextAttempt)
    setAttempts(nextAttempt)
    setFeedback(result.feedback)
    setCorrect(result.correct)
    setReveal(result.reveal ?? '')
    setRetryGuidance(result.retryGuidance ?? '')
    onComplete(result.correct, result.feedback, { advance: false })
  }

  return (
    <article className={`lesson-card card ${isPhysicalDrag ? 'physical-balance-card' : ''}`}>
      <p className="eyebrow">Balance scale</p>
      <h1 className="build-prompt">{step.prompt}</h1>

      {isPhysicalDrag ? (
        <PhysicalScaleStage
          state={state}
          leftTotal={leftTotal}
          rightTotal={rightTotal}
          balanceCue={balanceCue}
          tilt={tilt}
          hoverTarget={hoverTarget}
          lastDropSide={lastDropSide}
          lastChange={lastChange}
          onTilePointerDown={startDrag}
          draggingId={dragging?.item.id}
          tilesDisabled={correct}
        />
      ) : (
        <div className="scale-stage" aria-label="Interactive balance scale">
          <div className="equation-row" aria-live="polite">
            <span className="equation-side">
              <small>Left</small>
              <strong><MathText>{formatSide(state.left)}</MathText></strong>
              <em>Total {leftTotal}</em>
            </span>
            <span className={`balance-symbol ${balanceCue.kind}`}>{balanceCue.symbol}</span>
            <span className="equation-side">
              <small>Right</small>
              <strong><MathText>{formatSide(state.right)}</MathText></strong>
              <em>Total {rightTotal}</em>
            </span>
          </div>
          <div className={`balance-cue ${balanceCue.kind}`} role="status">
            {balanceCue.label}
          </div>
          <div className="scale-svg-wrap">
            <svg
              className={isLevel(state) ? 'level-scale' : 'tilted-scale'}
              viewBox="0 0 420 260"
              role="img"
              aria-label={balanceCue.label}
            >
              <line x1="210" y1="95" x2="210" y2="210" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
              <polygon points="180,220 240,220 210,180" fill="currentColor" opacity="0.18" />
              <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '210px 95px' }}>
                <line x1="75" y1="95" x2="345" y2="95" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                <line x1="105" y1="95" x2="75" y2="155" stroke="currentColor" strokeWidth="3" />
                <line x1="105" y1="95" x2="135" y2="155" stroke="currentColor" strokeWidth="3" />
                <line x1="315" y1="95" x2="285" y2="155" stroke="currentColor" strokeWidth="3" />
                <line x1="315" y1="95" x2="345" y2="155" stroke="currentColor" strokeWidth="3" />
                <rect x="48" y="154" width="114" height="22" rx="10" fill="currentColor" opacity="0.16" />
                <rect x="258" y="154" width="114" height="22" rx="10" fill="currentColor" opacity="0.16" />
              </g>
            </svg>
          </div>

          <div className="pan-grid">
            <Pan
              title="Left pan"
              side="left"
              items={state.left}
              total={leftTotal}
              active={hoverTarget === 'left'}
              bounced={lastDropSide === 'left'}
              onTilePointerDown={hasTray ? startDrag : undefined}
              draggingId={dragging?.item.id}
              tilesDisabled={correct}
            />
            <Pan
              title="Right pan"
              side="right"
              items={state.right}
              total={rightTotal}
              active={hoverTarget === 'right'}
              bounced={lastDropSide === 'right'}
              onTilePointerDown={hasTray ? startDrag : undefined}
              draggingId={dragging?.item.id}
              tilesDisabled={correct}
            />
          </div>
          {lastChange && <p className="change-note" aria-live="polite">{lastChange}</p>}
        </div>
      )}

      {hasTray && (
        <div
          className={`item-bank ${isPhysicalDrag ? 'physical-bank' : ''} ${hoverTarget === 'bank' ? 'drop-target' : ''}`}
          data-drop-zone="bank"
        >
          <p id={`${step.id}-bank-instructions`}>
            {dragging
              ? 'Release over a glowing pan, or drop here to send the block back to the tray.'
              : isPhysicalDrag
                ? 'Drag a block onto the pan that makes the scale level. Dropped it on the wrong side? Just drag it again.'
                : 'Drag a tile to a pan or back to the tray, or tap where it should go.'}
          </p>
          {bankItems.length > 0 ? (
            bankItems.map((item) => (
              <div className="bank-item" key={item.id}>
                <button
                  className={`tile bank-tile movable-tile ${dragging?.item.id === item.id ? 'dragging-source' : ''}`}
                  type="button"
                  aria-describedby={`${step.id}-bank-instructions`}
                  aria-label={`Drag ${item.label} block to a pan`}
                  disabled={correct}
                  onPointerDown={(event) => startDrag(event, item)}
                >
                  {item.label}
                </button>
                {!isPhysicalDrag && (
                  <>
                    <button type="button" disabled={correct} onClick={() => quickDrop(item, 'left')}>
                      Place {item.label} on left pan
                    </button>
                    <button type="button" disabled={correct} onClick={() => quickDrop(item, 'right')}>
                      Place {item.label} on right pan
                    </button>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="tray-empty" aria-live="polite">
              Tray is empty. Drag a block back here to take it off a pan.
            </p>
          )}
        </div>
      )}

      {dragging && (
        <DragPreview
          className="drag-preview tile"
          x={dragging.x}
          y={dragging.y}
          offsetX={dragging.offsetX}
          offsetY={dragging.offsetY}
          width={dragging.width}
          height={dragging.height}
        >
          {dragging.item.label}
        </DragPreview>
      )}

      {step.operations && (
        <div className="operation-grid">
          {step.operations.map((operation) => (
            <button type="button" key={operation.id} disabled={correct} onClick={() => applyOperation(operation)}>
              {operation.label}
            </button>
          ))}
        </div>
      )}

      <button className="primary-action" type="button" disabled={correct} onClick={check}>
        Check scale
      </button>
      {feedback && <FeedbackPanel key={attempts} correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct &&
        (usesOperations ? (
          <RetryPrompt
            message={retryGuidance || 'Reset the scale if your move used up a tile, then try again.'}
            actionLabel="Reset scale"
            onAction={resetAttempt}
          />
        ) : (
          <RetryPrompt
            message={
              retryGuidance || 'Drag the block to the other pan, or back to the tray, then check the scale again.'
            }
          />
        ))}
      {correct && (
        <button className="primary-action continue-step" type="button" onClick={() => onAdvance(feedback)}>
          Continue
        </button>
      )}
    </article>
  )
}

type DropTarget = BalanceSide | 'bank'

type DraggingTile = {
  item: BalanceItem
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

function PhysicalScaleStage({
  state,
  leftTotal,
  rightTotal,
  balanceCue,
  tilt,
  hoverTarget,
  lastDropSide,
  lastChange,
  onTilePointerDown,
  draggingId,
  tilesDisabled,
}: {
  state: BalanceState
  leftTotal: number
  rightTotal: number
  balanceCue: ReturnType<typeof getBalanceCue>
  tilt: number
  hoverTarget: DropTarget | null
  lastDropSide: BalanceSide | null
  lastChange: string
  onTilePointerDown: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
  draggingId?: string
  tilesDisabled?: boolean
}) {
  return (
    <div className="scale-stage physical-scale-stage" aria-label="Interactive balance scale">
      <div className={`balance-cue physical-cue ${balanceCue.kind}`} role="status">
        {getPhysicalBalanceCue(balanceCue.kind)}
      </div>

      <div className="physical-scale" aria-label={balanceCue.label}>
        <div className="physical-fulcrum" aria-hidden="true" />
        <div className="physical-beam" style={{ transform: `rotate(${tilt}deg)` }}>
          <span className="physical-beam-line" aria-hidden="true" />
          <PhysicalPan
            title="Left pan"
            side="left"
            items={state.left}
            total={leftTotal}
            active={hoverTarget === 'left'}
            bounced={lastDropSide === 'left'}
            onTilePointerDown={onTilePointerDown}
            draggingId={draggingId}
            tilesDisabled={tilesDisabled}
          />
          <PhysicalPan
            title="Right pan"
            side="right"
            items={state.right}
            total={rightTotal}
            active={hoverTarget === 'right'}
            bounced={lastDropSide === 'right'}
            onTilePointerDown={onTilePointerDown}
            draggingId={draggingId}
            tilesDisabled={tilesDisabled}
          />
        </div>
      </div>

      {lastChange && <p className="change-note physical-change-note" aria-live="polite">{lastChange}</p>}
    </div>
  )
}

function PhysicalPan({
  title,
  side,
  items,
  total,
  active,
  bounced,
  onTilePointerDown,
  draggingId,
  tilesDisabled,
}: {
  title: string
  side: BalanceSide
  items: BalanceItem[]
  total: number
  active: boolean
  bounced: boolean
  onTilePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
  draggingId?: string
  tilesDisabled?: boolean
}) {
  return (
    <div
      className={`physical-pan ${side} ${active ? 'drop-target' : ''} ${bounced ? 'pan-bounce' : ''}`}
      data-drop-zone={side}
      aria-label={`${title}: ${formatSide(items)}, total ${total}`}
    >
      <span className="physical-pan-cables" aria-hidden="true" />
      <div className="physical-pan-surface">
        <span className="physical-pan-label">{title}</span>
        <div className="physical-tile-row">
          {items.map((item) => (
            <BalanceTile
              key={item.id}
              item={item}
              location={title}
              movable={Boolean(onTilePointerDown) && !item.locked && !tilesDisabled}
              dragging={draggingId === item.id}
              onTilePointerDown={onTilePointerDown}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Pan({
  title,
  side,
  items,
  total,
  active,
  bounced,
  onTilePointerDown,
  draggingId,
  tilesDisabled,
}: {
  title: string
  side: BalanceSide
  items: BalanceItem[]
  total: number
  active: boolean
  bounced: boolean
  onTilePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
  draggingId?: string
  tilesDisabled?: boolean
}) {
  return (
    <div className={`pan ${active ? 'drop-target' : ''} ${bounced ? 'pan-bounce' : ''}`} data-drop-zone={side}>
      <span className="pan-heading">
        <strong>{title}</strong>
        <small>Total {total}</small>
      </span>
      <div className="tile-row">
        {items.map((item) => (
          <BalanceTile
            key={item.id}
            item={item}
            location={title}
            movable={Boolean(onTilePointerDown) && !item.locked && !tilesDisabled}
            dragging={draggingId === item.id}
            onTilePointerDown={onTilePointerDown}
          />
        ))}
      </div>
    </div>
  )
}

// A single weight on a pan. Locked weights (the fixed equation) render as static text;
// unlocked weights render as a draggable button so the learner can pick them back up and
// move them between pans or to the tray.
function BalanceTile({
  item,
  location,
  movable,
  dragging,
  onTilePointerDown,
}: {
  item: BalanceItem
  location: string
  movable: boolean
  dragging: boolean
  onTilePointerDown?: (event: React.PointerEvent<HTMLButtonElement>, item: BalanceItem) => void
}) {
  if (movable && onTilePointerDown) {
    return (
      <button
        type="button"
        className={`tile ${item.kind} movable-tile ${dragging ? 'dragging-source' : ''}`}
        aria-label={`Move the ${item.label} block. Currently on ${location}. Drag it to another pan or back to the tray.`}
        onPointerDown={(event) => onTilePointerDown(event, item)}
      >
        {item.label}
      </button>
    )
  }

  return <span className={`tile ${item.kind}`}>{item.label}</span>
}

function FeedbackPanel({ correct, message, reveal }: { correct: boolean; message: string; reveal?: string }) {
  return (
    <div className={`feedback ${correct ? 'good' : 'bad'}`} role="status">
      <strong>{correct ? 'Correct: Nice.' : 'Incorrect: Try again.'}</strong>
      <span>{message}</span>
      {reveal && <small>{reveal}</small>}
    </div>
  )
}

function RetryPrompt({
  message,
  actionLabel,
  onAction,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="retry-prompt">
      <span>{message}</span>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const normalizedValue = Math.max(0, Math.min(100, value))

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalizedValue}
      aria-valuetext={`${label}, ${normalizedValue}%`}
      className="progress-block"
      role="progressbar"
    >
      <div className="progress-meta">
        <span>{label}</span>
        <span>{normalizedValue}%</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${Math.max(4, normalizedValue)}%` }} />
      </div>
    </div>
  )
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return reduced
}

// Animates from 0 up to `target`, snapping straight to the final value when the user
// prefers reduced motion so the score never visibly counts. The reduced-motion value is
// derived during render (not via setState) so it stays out of the effect body.
function useCountUp(target: number, durationMs = 950) {
  const reducedMotion = usePrefersReducedMotion()
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    if (reducedMotion) return

    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(Math.round(target * eased))
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setAnimatedValue(target)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, reducedMotion])

  return reducedMotion ? target : animatedValue
}

const SCORE_RING_RADIUS = 54
const SCORE_RING_CIRCUMFERENCE = 2 * Math.PI * SCORE_RING_RADIUS

const CELEBRATION_PIECES: { x: string; delay: string; color: string }[] = [
  { x: '-48px', delay: '0ms', color: '#2563eb' },
  { x: '-26px', delay: '110ms', color: '#22c55e' },
  { x: '-8px', delay: '40ms', color: '#f59e0b' },
  { x: '12px', delay: '150ms', color: '#ec4899' },
  { x: '30px', delay: '70ms', color: '#8b5cf6' },
  { x: '48px', delay: '190ms', color: '#22c55e' },
  { x: '-38px', delay: '220ms', color: '#f59e0b' },
  { x: '40px', delay: '20ms', color: '#2563eb' },
]

function CompleteScreen({
  lesson,
  progress,
  recommendation,
  onCourse,
  onRetake,
}: {
  lesson: Lesson
  progress: LessonProgress
  recommendation: { title: string; body: string }
  onCourse: () => void
  onRetake: () => void
}) {
  const copy = getCompletionCopy(lesson)
  const latestScore = getLatestLessonScore(lesson, progress)
  const bestScore = getBestLessonScore(lesson, progress)
  const displayScore = useCountUp(latestScore?.scorePercent ?? 0)
  const ringOffset = SCORE_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, displayScore)) / 100)

  return (
    <section className="complete-card card">
      <p className="eyebrow">Lesson complete</p>
      <h1>{copy.title}</h1>
      <p className="lead">{copy.body}</p>
      {latestScore && (
        <div className="score-card">
          <span>First-try score</span>
          <div className="score-figure">
            <div
              className="score-ring"
              role="img"
              aria-label={`First-try score ${latestScore.scorePercent} percent`}
            >
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="score-ring-track" cx="60" cy="60" r={SCORE_RING_RADIUS} />
                <circle
                  className="score-ring-value"
                  cx="60"
                  cy="60"
                  r={SCORE_RING_RADIUS}
                  transform="rotate(-90 60 60)"
                  style={{
                    strokeDasharray: SCORE_RING_CIRCUMFERENCE,
                    strokeDashoffset: ringOffset,
                  }}
                />
              </svg>
              <strong aria-hidden="true">{displayScore}%</strong>
            </div>
            <span className="score-celebrate" aria-hidden="true">
              {CELEBRATION_PIECES.map((piece, index) => (
                <i
                  key={index}
                  style={
                    {
                      '--cx': piece.x,
                      '--cd': piece.delay,
                      '--cc': piece.color,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          </div>
          <p>{getLessonScoreDetail(lesson, progress)}</p>
          {bestScore && bestScore.scorePercent !== latestScore.scorePercent && <small>Best score: {bestScore.scorePercent}%</small>}
        </div>
      )}
      <div className="next-card">
        <span>Recommended next</span>
        <strong>{recommendation.title}</strong>
        <p>{recommendation.body}</p>
      </div>
      <div className="complete-actions">
        <button className="primary-action" type="button" onClick={onCourse}>
          Back to course path
        </button>
        <button className="secondary-action" type="button" onClick={onRetake}>
          Retake lesson
        </button>
      </div>
    </section>
  )
}

function getCompletionCopy(lesson: Lesson) {
  if (lesson.id === 'graphing-lines') {
    return {
      title: 'You graphed lines from equations.',
      body: 'You used slope, intercepts, points, and tables to recognize linear equations.',
    }
  }

  if (lesson.id === 'coordinate-plane') {
    return {
      title: 'You read the coordinate plane.',
      body: 'You located points by moving horizontally for x and vertically for y.',
    }
  }

  if (lesson.id === 'like-terms-variables-both-sides') {
    return {
      title: 'You solved after gathering terms.',
      body: 'You classified x-terms, combined like terms, caught a wrong sign move, and gathered variables before isolating x.',
    }
  }

  if (lesson.id === 'two-step-equations') {
    return {
      title: 'You solved two-step equations.',
      body: 'You worked backward through two operations while keeping both sides equal.',
    }
  }

  if (lesson.id === 'one-step-equations') {
    return {
      title: 'You solved one-step equations.',
      body: 'You chose inverse operations and applied them to both sides to isolate x.',
    }
  }

  return {
    title: 'You solved by keeping balance.',
    body: 'You used equality and inverse operations to isolate x without breaking the equation.',
  }
}

function ProfileScreen({
  user,
  mastery,
  attempts,
  backendProvider,
}: {
  user: UserProfile
  mastery: { skillId: string; score: number; attempts: number; correct: number }[]
  attempts: { id: string }[]
  backendProvider: Backend['provider']
}) {
  const providerLabel = backendProvider === 'firebase' ? 'Firebase user ID' : 'Local demo profile ID'

  return (
    <section className="screen-stack">
      <div className="profile-card card">
        <p className="eyebrow">Profile</p>
        <h1>{user.displayName}</h1>
        <p>{user.email}</p>
        <p className="fine-print">
          {providerLabel}: {user.id}
        </p>
        <p className="fine-print">
          {backendProvider === 'firebase'
            ? 'Firebase mode syncs progress through Firestore for this authenticated account. Sign out before sharing this browser.'
            : 'Sign out before sharing this browser. This demo keeps progress on this device until browser storage is cleared.'}
        </p>
      </div>

      <div className="mastery-grid">
        {skills.map((skill) => {
          const item = mastery.find((entry) => entry.skillId === skill.id)
          const score = item ? Math.round(item.score * 100) : 0
          return (
            <article className="mastery-card card" key={skill.id}>
              <span className="status-pill">{score}%</span>
              <h2>{skill.title}</h2>
              <p>{skill.description}</p>
              <small>
                {item ? `${item.correct}/${item.attempts} correct attempts` : 'No attempts yet'}
              </small>
            </article>
          )
        })}
      </div>

      <p className="fine-print">Recorded {backendProvider} attempt events: {attempts.length}</p>
    </section>
  )
}

function MiniScale({ visual }: { visual?: ConceptStep['visual'] }) {
  const leftSide = visual === 'unknown-box' ? 'x + 2' : '3'
  const rightSide = visual === 'unknown-box' ? '5' : '3'
  return (
    <div className="mini-scale">
      <span><MathText>{leftSide}</MathText></span>
      <strong>=</strong>
      <span><MathText>{rightSide}</MathText></span>
    </div>
  )
}

function cloneBalanceState(state: BalanceState): BalanceState {
  return {
    ...state,
    left: state.left.map((item) => ({ ...item })),
    right: state.right.map((item) => ({ ...item })),
    bank: state.bank?.map((item) => ({ ...item })),
  }
}

// Rebuilds a balance state that genuinely satisfies the step's goal, used when resuming a
// step the learner already solved. Each candidate is verified with the real checker, so we
// only return a state that is actually correct (or null when none can be derived). It tries
// the start state, then each single operation, then placing each tray block on a pan, which
// covers the authored "level" and "isolate" steps without hard-coding lesson data.
function reconstructSolvedBalanceState(step: BalanceStep): BalanceState | null {
  const base = cloneBalanceState(step.state)
  if (checkBalanceStep(step, base, {}).correct) return base

  for (const operation of step.operations ?? []) {
    const candidate = applyBalanceOperation(base, operation)
    if (checkBalanceStep(step, candidate, {}).correct) return candidate
  }

  // Level goals with required placements: move every required block onto its target pan
  // (pulled from the tray or whichever pan it currently sits on), then verify the result is
  // genuinely solved. This rebuilds multi-block "build the scale" steps where no single
  // bank placement alone solves the goal.
  if (step.goal.type === 'level') {
    const required = [
      ...(step.goal.requireItemOnSide ? [step.goal.requireItemOnSide] : []),
      ...(step.goal.requireItemsOnSide ?? []),
    ]
    if (required.length > 0) {
      const allItems = [...base.left, ...base.right, ...(base.bank ?? [])]
      const isRequired = (item: BalanceItem) => required.some((placement) => placement.itemId === item.id)
      const candidate: BalanceState = {
        ...base,
        left: base.left.filter((item) => !isRequired(item)),
        right: base.right.filter((item) => !isRequired(item)),
        bank: (base.bank ?? []).filter((item) => !isRequired(item)),
      }
      required.forEach((placement) => {
        const item = allItems.find((candidateItem) => candidateItem.id === placement.itemId)
        if (item) candidate[placement.side] = [...candidate[placement.side], item]
      })
      if (checkBalanceStep(step, candidate, {}).correct) return candidate
    }
  }

  const bank = base.bank ?? []
  for (const item of bank) {
    for (const side of ['left', 'right'] as BalanceSide[]) {
      const candidate: BalanceState = {
        ...base,
        left: side === 'left' ? [...base.left, item] : [...base.left],
        right: side === 'right' ? [...base.right, item] : [...base.right],
        bank: bank.filter((candidateItem) => candidateItem.id !== item.id),
      }
      if (checkBalanceStep(step, candidate, {}).correct) return candidate
    }
  }

  return null
}

function formatSide(items: BalanceItem[]) {
  if (items.length === 0) return '0'

  return items
    .map((item, index) => {
      const isNegative = item.value < 0
      const label = isNegative ? item.label.replace(/^-/, '') : item.label
      if (index === 0) return isNegative ? `-${label}` : label
      return `${isNegative ? '-' : '+'} ${label}`
    })
    .join(' ')
}

function getBalanceCue(leftTotal: number, rightTotal: number) {
  if (leftTotal === rightTotal) {
    return {
      kind: 'level' as const,
      symbol: '=',
      label: `Level: both sides total ${leftTotal}.`,
    }
  }

  if (leftTotal > rightTotal) {
    return {
      kind: 'left-heavy' as const,
      symbol: '>',
      label: `Left heavier: ${leftTotal} is more than ${rightTotal}.`,
    }
  }

  return {
    kind: 'right-heavy' as const,
    symbol: '<',
    label: `Right heavier: ${rightTotal} is more than ${leftTotal}.`,
  }
}

function getPhysicalBalanceCue(kind: ReturnType<typeof getBalanceCue>['kind']) {
  if (kind === 'level') return 'Scale is level.'
  if (kind === 'left-heavy') return 'Left pan is heavier.'
  return 'Right pan is heavier.'
}

function describePhysicalBalanceChange(item: BalanceItem, side: BalanceSide, state: BalanceState) {
  return `${item.label} landed on the ${side} pan. ${getPhysicalBalanceCue(getBalanceCue(sideTotal(state.left), sideTotal(state.right)).kind)}`
}

function describeMove(
  item: BalanceItem,
  target: DropTarget,
  before: BalanceState,
  after: BalanceState,
  isPhysicalDrag: boolean,
) {
  if (target === 'bank') {
    const cue = getBalanceCue(sideTotal(after.left), sideTotal(after.right))
    return `${item.label} returned to the tray. ${isPhysicalDrag ? getPhysicalBalanceCue(cue.kind) : cue.label}`
  }

  return isPhysicalDrag
    ? describePhysicalBalanceChange(item, target, after)
    : describeBalanceChange(before, after, `Moved ${item.label} to the ${target} pan.`)
}

function describeBalanceChange(before: BalanceState, after: BalanceState, action: string) {
  const beforeLeft = sideTotal(before.left)
  const beforeRight = sideTotal(before.right)
  const afterLeft = sideTotal(after.left)
  const afterRight = sideTotal(after.right)

  return `${action} Totals changed from left ${beforeLeft}, right ${beforeRight} to left ${afterLeft}, right ${afterRight}. ${getBalanceCue(afterLeft, afterRight).label}`
}

function getDropTargetAtPoint(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y)
  const zone = element?.closest<HTMLElement>('[data-drop-zone]')?.dataset.dropZone
  return zone === 'left' || zone === 'right' || zone === 'bank' ? zone : null
}

export default App
