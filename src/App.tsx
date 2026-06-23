import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { createAttemptEvent, localBackend } from './backend'
import {
  applyBalanceOperation,
  applyStepResult,
  checkBalanceStep,
  checkInputStep,
  checkOperationChoiceStep,
  checkSequenceStep,
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
  type ProgressByLesson,
} from './engine'
import {
  algebraCourse,
  lessons,
  skills,
  type BalanceItem,
  type BalanceOperation,
  type BalanceSide,
  type BalanceState,
  type Lesson,
  type LessonId,
  type LessonScore,
  type BalanceStep,
  type ConceptStep,
  type LessonProgress,
  type LessonStep,
  type McqStep,
  type OperationChoiceStep,
  type SequenceStep,
  type SkillMastery,
  type UserProfile,
} from './domain'

function App() {
  const initialSession = getInitialSession()
  const [user, setUser] = useState<UserProfile | null>(initialSession.user)
  const [view, setView] = useState<'auth' | 'course' | 'lesson' | 'complete' | 'profile'>(
    initialSession.user ? 'course' : 'auth',
  )
  const [activeLessonId, setActiveLessonId] = useState<LessonId>(initialSession.activeLessonId)
  const [progress, setProgress] = useState<LessonProgress | null>(initialSession.progress)

  const mastery = user ? localBackend.mastery.getUserMastery(user.id) : []
  const progressByLesson = user ? getProgressByLesson(user.id) : {}
  const activeLesson = lessons[activeLessonId]
  const currentStep = progress ? activeLesson.steps[progress.currentStepIndex] : null
  const recommendation = getRecommendedNextLesson(activeLesson, mastery)

  const saveProgress = (nextProgress: LessonProgress) => {
    localBackend.progress.saveLessonProgress(nextProgress)
    setProgress(nextProgress)
  }

  const completeStep = (
    step: LessonStep,
    correct: boolean,
    feedback: string,
    msToAnswer: number,
    options: CompleteOptions = {},
  ) => {
    if (!user || !progress) return

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

    if (shouldRecordAttempt) {
      localBackend.attempts.recordAttempt(
        createAttemptEvent(
          user.id,
          activeLesson.id,
          step.id,
          correct,
          previousAttempts + 1,
          msToAnswer,
        ),
      )
    }

    if (shouldRecordAttempt) {
      activeLesson.skillIds.forEach((skillId) =>
        localBackend.mastery.updateSkillMastery(user.id, skillId, correct),
      )
    }

    saveProgress(nextProgress)

    if (nextProgress.status === 'completed') {
      setView('complete')
    }
  }

  const handleSignedIn = (signedInUser: UserProfile) => {
    const saved = getInitialLessonSession(signedInUser)
    setUser(signedInUser)
    setActiveLessonId(saved.activeLessonId)
    setProgress(saved.progress)
    setView('course')
  }

  const handleSignOut = () => {
    localBackend.auth.signOut()
    setUser(null)
    setView('auth')
  }

  const launchLesson = (lessonId: LessonId) => {
    if (!user) return

    const lesson = lessons[lessonId]
    const latestProgressByLesson = getProgressByLesson(user.id)
    if (!isLessonUnlocked(lesson, latestProgressByLesson)) return

    const nextProgress = getProgressForUser(user, lessonId)
    setActiveLessonId(lessonId)
    setProgress(nextProgress)
    setView(nextProgress.status === 'completed' ? 'complete' : 'lesson')
  }

  const retakeLesson = (lessonId: LessonId) => {
    if (!user) return

    const lesson = lessons[lessonId]
    const latestProgressByLesson = getProgressByLesson(user.id)
    if (!isLessonUnlocked(lesson, latestProgressByLesson)) return

    const nextProgress = restartLessonProgress(getProgressForUser(user, lessonId), lesson)
    localBackend.progress.saveLessonProgress(nextProgress)
    setActiveLessonId(lessonId)
    setProgress(nextProgress)
    setView('lesson')
  }

  return (
    <main className="app-shell">
      {user && (
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => setView('course')}>
            Balance
          </button>
          <nav aria-label="Primary">
            <button type="button" onClick={() => setView('course')}>
              Path
            </button>
            <button type="button" onClick={() => setView('profile')}>
              Profile
            </button>
            <button type="button" onClick={handleSignOut}>
              Log out
            </button>
          </nav>
        </header>
      )}

      {view === 'auth' && <AuthScreen onSignedIn={handleSignedIn} />}
      {view === 'course' && user && progress && (
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
        <ProfileScreen user={user} mastery={mastery} attempts={localBackend.attempts.getAttempts(user.id)} />
      )}
    </main>
  )
}

function getInitialSession() {
  const currentUser = localBackend.auth.getCurrentUser()
  const lessonSession = currentUser ? getInitialLessonSession(currentUser) : null
  return {
    user: currentUser,
    activeLessonId: lessonSession?.activeLessonId ?? 'balancing-equations',
    progress: lessonSession?.progress ?? null,
  }
}

function getInitialLessonSession(user: UserProfile) {
  const progressByLesson = getProgressByLesson(user.id)
  const activeLessonId = getRecommendedPathLessonId(algebraCourse, lessons, progressByLesson, 'balancing-equations')
  return {
    activeLessonId,
    progress: getProgressForUser(user, activeLessonId),
  }
}

function getProgressForUser(user: UserProfile, lessonId: LessonId) {
  const saved = localBackend.progress.getLessonProgress(user.id, lessonId)
  if (saved) return saved

  const progress = createInitialProgress(user.id, lessonId)
  localBackend.progress.saveLessonProgress(progress)
  return progress
}

function getProgressByLesson(userId: string): ProgressByLesson {
  return algebraCourse.lessonOrder.reduce<ProgressByLesson>((items, lessonId) => {
    const progress = localBackend.progress.getLessonProgress(userId, lessonId)
    if (progress) {
      items[lessonId] = progress
    }
    return items
  }, {})
}

type AuthScreenProps = {
  onSignedIn: (user: UserProfile) => void
}

function AuthScreen({ onSignedIn }: AuthScreenProps) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [displayName, setDisplayName] = useState('Maya')
  const [email, setEmail] = useState('maya@example.com')
  const [password, setPassword] = useState('balance123')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    try {
      const signedIn =
        mode === 'signup'
          ? localBackend.auth.signUp({ displayName, email, password })
          : localBackend.auth.signIn(email, password)
      onSignedIn(signedIn)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const demo = () => {
    setError('')
    try {
      onSignedIn(
        localBackend.auth.signUp({
          displayName: `Maya ${Math.floor(Math.random() * 100)}`,
          email: `maya-${Date.now()}@example.com`,
          password: 'balance123',
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <section className="auth-screen card">
      <p className="eyebrow">Algebra Foundations</p>
      <h1>Learn equations by balancing them.</h1>
      <p className="lead">
        A Brilliant-style algebra lesson where every answer gives immediate, specific feedback.
      </p>

      <div className="auth-tabs" role="tablist" aria-label="Auth mode">
        <button
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? 'active' : ''}
          id="signup-tab"
          role="tab"
          type="button"
          onClick={() => setMode('signup')}
        >
          Sign up
          {mode === 'signup' && <span className="tab-state">Current</span>}
        </button>
        <button
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'active' : ''}
          id="login-tab"
          role="tab"
          type="button"
          onClick={() => setMode('login')}
        >
          Log in
          {mode === 'login' && <span className="tab-state">Current</span>}
        </button>
      </div>

      <div
        aria-labelledby={mode === 'signup' ? 'signup-tab' : 'login-tab'}
        className="form-stack"
        id={mode === 'signup' ? 'signup-panel' : 'login-panel'}
        role="tabpanel"
      >
        {mode === 'signup' && (
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
      </div>

      {error && <p className="feedback bad">{error}</p>}

      <button className="primary-action" type="button" onClick={submit}>
        {mode === 'signup' ? 'Create account' : 'Log in'}
      </button>
      <button className="secondary-action" type="button" onClick={demo}>
        Start with a local demo account
      </button>
      <p className="fine-print">
        This build stores accounts and progress locally in your browser. Firebase or Supabase can replace the adapter later.
      </p>
    </section>
  )
}

type CourseMapProps = {
  user: UserProfile
  activeLesson: Lesson
  progress: LessonProgress
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

      <div className="path-list" aria-label="Course path">
        {algebraCourse.lessons.map((lessonNode, index) => {
          const lesson = lessons[lessonNode.id]
          const lessonProgress = lesson.id === progress.lessonId ? progress : progressByLesson[lesson.id]
          const unlocked = isLessonUnlocked(lesson, progressByLesson)
          const completed = lessonProgress?.status === 'completed'
          const comingSoon = lesson.steps.length === 0
          const recommended = lesson.id === featuredLessonId && !completed && unlocked
          const status = getPathStatus({ comingSoon, recommended, unlocked, lesson, lessonProgress, mastery })
          const scoreText = getLessonScoreText(lesson, lessonProgress)

          return (
            <article className={`path-node ${status.className}`} key={lesson.id}>
              <span className="node-number">{index + 1}</span>
              <div>
                <h2>{lessonNode.title}</h2>
                <p>{lessonNode.description}</p>
                {scoreText && <p className="score-line">{scoreText}</p>}
              </div>
              <div className="path-actions">
                <span className="status-pill">{status.label}</span>
                {unlocked && (
                  <>
                    <button type="button" onClick={() => onLaunchLesson(lesson.id)}>
                      {completed ? 'View summary' : lessonProgress ? 'Continue' : 'Start'}
                    </button>
                    {completed && (
                      <button type="button" onClick={() => onRetakeLesson(lesson.id)}>
                        Retake
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
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
                const correct = option.id === step.correctId
                const feedback =
                  correct
                    ? step.feedback?.correct ?? option.feedback
                    : nextAttempt >= 2 && step.feedback?.incorrect
                      ? step.feedback.incorrect
                      : option.feedback

                setSelectedId(option.id)
                setAttempts(nextAttempt)
                setSelectedFeedback(feedback)
                setReveal(!correct && nextAttempt >= 3 ? step.feedback?.reveal ?? '' : '')
                setRetryGuidance(
                  !correct && nextAttempt >= 3 && step.feedback?.reveal
                    ? 'Use the reveal, then choose the prediction that matches the totals.'
                    : 'Compare the two totals, then choose another option.',
                )
                onComplete(correct, feedback, { advance: false })
              }}
            >
              {option.label}
              {selected && <span className="option-state">Selected</span>}
            </button>
          )
        })}
      </div>
      {selectedFeedback && <FeedbackPanel correct={wasCorrect} message={selectedFeedback} reveal={!wasCorrect ? reveal : undefined} />}
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

  const submit = () => {
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
      <button className="primary-action" type="button" disabled={correct} onClick={submit}>
        Check
      </button>
      {feedback && <FeedbackPanel correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
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
      {step.equation && <div className="puzzle-equation">{step.equation}</div>}
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
      {feedback && <FeedbackPanel correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
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
      {step.equation && <div className="puzzle-equation">{step.equation}</div>}

      <div className="sequence-board">
        <div className="sequence-slots" aria-label="Selected solution steps">
          {selectedTiles.length === 0 && <span className="empty-slot">Tap tiles below to build your solution.</span>}
          {selectedTiles.map((tile, index) => (
            <button disabled={correct} key={`${tile.id}-${index}`} type="button" onClick={() => removeTile(tile.id)}>
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
      {feedback && <FeedbackPanel correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
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
  const [state, setState] = useState<BalanceState>(() => cloneBalanceState(step.state))
  const [dragging, setDragging] = useState<DraggingTile | null>(null)
  const [hoverSide, setHoverSide] = useState<BalanceSide | null>(null)
  const [lastDropSide, setLastDropSide] = useState<BalanceSide | null>(null)
  const [feedback, setFeedback] = useState(priorResult?.feedback ?? '')
  const [correct, setCorrect] = useState(priorResult?.correct ?? false)
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

  useEffect(() => {
    if (!lastDropSide) return

    const timeoutId = window.setTimeout(() => setLastDropSide(null), 420)
    return () => window.clearTimeout(timeoutId)
  }, [lastDropSide])

  const activeDragItem = dragging?.item

  const dropItem = useCallback((item: BalanceItem, side: BalanceSide) => {
    const nextState = {
      ...state,
      [side]: [...state[side], item],
      bank: state.bank?.filter((candidate) => candidate.id !== item.id),
    }

    setState(nextState)
    setLastDropSide(null)
    window.requestAnimationFrame(() => setLastDropSide(side))
    setLastChange(
      isPhysicalDrag
        ? describePhysicalBalanceChange(item, side, nextState)
        : describeBalanceChange(state, nextState, `Added ${item.label} to the ${side} pan.`),
    )
    setFeedback('')
    setCorrect(false)
    setReveal('')
    setRetryGuidance('')
  }, [isPhysicalDrag, state])

  useEffect(() => {
    if (!activeDragItem) return

    const activeItem = activeDragItem

    const handlePointerMove = (event: PointerEvent) => {
      setDragging((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
      setHoverSide(getPanSideAtPoint(event.clientX, event.clientY))
    }

    const handlePointerUp = (event: PointerEvent) => {
      const side = getPanSideAtPoint(event.clientX, event.clientY)
      if (side) {
        dropItem(activeItem, side)
      }
      setDragging(null)
      setHoverSide(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [activeDragItem, dropItem])

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
    dropItem(item, side)
  }

  const resetAttempt = () => {
    setState(cloneBalanceState(step.state))
    setDragging(null)
    setHoverSide(null)
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
      <h1>{step.prompt}</h1>

      {isPhysicalDrag ? (
        <PhysicalScaleStage
          state={state}
          leftTotal={leftTotal}
          rightTotal={rightTotal}
          balanceCue={balanceCue}
          tilt={tilt}
          hoverSide={hoverSide}
          lastDropSide={lastDropSide}
          lastChange={lastChange}
        />
      ) : (
        <div className="scale-stage" aria-label="Interactive balance scale">
          <div className="equation-row" aria-live="polite">
            <span className="equation-side">
              <small>Left</small>
              <strong>{formatSide(state.left)}</strong>
              <em>Total {leftTotal}</em>
            </span>
            <span className={`balance-symbol ${balanceCue.kind}`}>{balanceCue.symbol}</span>
            <span className="equation-side">
              <small>Right</small>
              <strong>{formatSide(state.right)}</strong>
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
              active={hoverSide === 'left'}
              bounced={lastDropSide === 'left'}
            />
            <Pan
              title="Right pan"
              side="right"
              items={state.right}
              total={rightTotal}
              active={hoverSide === 'right'}
              bounced={lastDropSide === 'right'}
            />
          </div>
          {lastChange && <p className="change-note" aria-live="polite">{lastChange}</p>}
        </div>
      )}

      {state.bank && state.bank.length > 0 && (
        <div className={`item-bank ${isPhysicalDrag ? 'physical-bank' : ''}`}>
          <p id={`${step.id}-bank-instructions`}>
            {dragging
              ? 'Release over a glowing pan to drop it.'
              : isPhysicalDrag
                ? 'Drag the loose block onto the pan that makes the scale level.'
                : 'Drag a tile to a pan, or tap where it should go.'}
          </p>
          {state.bank.map((item) => (
            <div className="bank-item" key={item.id}>
              <button
                className={`tile bank-tile ${dragging?.item.id === item.id ? 'dragging-source' : ''}`}
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
          ))}
        </div>
      )}

      {dragging && (
        <div
          className="drag-preview tile"
          style={{
            left: dragging.x - dragging.offsetX,
            top: dragging.y - dragging.offsetY,
            width: dragging.width,
            height: dragging.height,
          }}
        >
          {dragging.item.label}
        </div>
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
      {feedback && <FeedbackPanel correct={correct} message={feedback} reveal={!correct ? reveal : undefined} />}
      {feedback && !correct && (
        <RetryPrompt
          message={retryGuidance || 'Reset the scale if your move used up a tile, then try again.'}
          actionLabel="Reset scale"
          onAction={resetAttempt}
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
  hoverSide,
  lastDropSide,
  lastChange,
}: {
  state: BalanceState
  leftTotal: number
  rightTotal: number
  balanceCue: ReturnType<typeof getBalanceCue>
  tilt: number
  hoverSide: BalanceSide | null
  lastDropSide: BalanceSide | null
  lastChange: string
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
            active={hoverSide === 'left'}
            bounced={lastDropSide === 'left'}
          />
          <PhysicalPan
            title="Right pan"
            side="right"
            items={state.right}
            total={rightTotal}
            active={hoverSide === 'right'}
            bounced={lastDropSide === 'right'}
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
}: {
  title: string
  side: BalanceSide
  items: BalanceItem[]
  total: number
  active: boolean
  bounced: boolean
}) {
  return (
    <div
      className={`physical-pan ${side} ${active ? 'drop-target' : ''} ${bounced ? 'pan-bounce' : ''}`}
      data-pan-side={side}
      aria-label={`${title}: ${formatSide(items)}, total ${total}`}
    >
      <span className="physical-pan-cables" aria-hidden="true" />
      <div className="physical-pan-surface">
        <span className="physical-pan-label">{title}</span>
        <div className="physical-tile-row">
          {items.map((item) => (
            <span className={`tile ${item.kind}`} key={item.id}>
              {item.label}
            </span>
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
}: {
  title: string
  side: BalanceSide
  items: BalanceItem[]
  total: number
  active: boolean
  bounced: boolean
}) {
  return (
    <div className={`pan ${active ? 'drop-target' : ''} ${bounced ? 'pan-bounce' : ''}`} data-pan-side={side}>
      <span className="pan-heading">
        <strong>{title}</strong>
        <small>Total {total}</small>
      </span>
      <div className="tile-row">
        {items.map((item) => (
          <span className={`tile ${item.kind}`} key={item.id}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
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

  return (
    <section className="complete-card card">
      <p className="eyebrow">Lesson complete</p>
      <h1>{copy.title}</h1>
      <p className="lead">{copy.body}</p>
      {latestScore && (
        <div className="score-card">
          <span>First-try score</span>
          <strong>{latestScore.scorePercent}%</strong>
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
}: {
  user: UserProfile
  mastery: { skillId: string; score: number; attempts: number; correct: number }[]
  attempts: { id: string }[]
}) {
  return (
    <section className="screen-stack">
      <div className="profile-card card">
        <p className="eyebrow">Profile</p>
        <h1>{user.displayName}</h1>
        <p>{user.email}</p>
        <p className="fine-print">Local account ID: {user.id}</p>
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

      <p className="fine-print">Recorded local attempt events: {attempts.length}</p>
    </section>
  )
}

function MiniScale({ visual }: { visual?: ConceptStep['visual'] }) {
  return (
    <div className="mini-scale" aria-label="Equation balance visual">
      <span>{visual === 'unknown-box' ? 'x + 2' : '3'}</span>
      <strong>=</strong>
      <span>{visual === 'unknown-box' ? '5' : '3'}</span>
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

function describeBalanceChange(before: BalanceState, after: BalanceState, action: string) {
  const beforeLeft = sideTotal(before.left)
  const beforeRight = sideTotal(before.right)
  const afterLeft = sideTotal(after.left)
  const afterRight = sideTotal(after.right)

  return `${action} Totals changed from left ${beforeLeft}, right ${beforeRight} to left ${afterLeft}, right ${afterRight}. ${getBalanceCue(afterLeft, afterRight).label}`
}

function getPanSideAtPoint(x: number, y: number): BalanceSide | null {
  const element = document.elementFromPoint(x, y)
  const pan = element?.closest<HTMLElement>('[data-pan-side]')
  const side = pan?.dataset.panSide
  return side === 'left' || side === 'right' ? side : null
}

export default App
