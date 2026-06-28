// Demonstration harness for the Phase 3 learning-science engine.
//
// Run it with:  npm run demo:ls
// (that compiles the engine to dist-tests/ via the test build, then runs this script).
//
// Every section below calls the SAME pure functions the app uses in production — the scheduler,
// the mastery estimate, the question selector, and the insights — with an injected clock, so it
// proves each technique is actually applied and shows the numbers behind it without any UI or
// waiting on real-day spacing intervals.

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let engine
try {
  engine = require('../dist-tests/src/engine.js')
} catch (error) {
  console.error('\nCould not load the compiled engine.')
  console.error('Run `node tests/build-tests.mjs` first, or just use `npm run demo:ls`.\n')
  console.error(error.message)
  process.exit(1)
}

const {
  ARCHITECTURE_CATALOG,
  applyPracticeOutcome,
  architectureKey,
  computeRetention,
  createInitialPracticeState,
  isSkillMastered,
  masteryLevel,
  mulberry32,
  PRACTICE_MASTERY_STREAK,
  PRACTICE_MASTERY_THRESHOLD,
  selectNextArchitecture,
  skillForArchitecture,
  skillForStepId,
  summarizePractice,
} = engine

const DAY_MS = 24 * 60 * 60 * 1000
const T0 = Date.parse('2026-03-01T00:00:00.000Z')
const at = (dayOffset) => new Date(T0 + dayOffset * DAY_MS).toISOString()
const round = (value, dp = 2) => Math.round(value * 10 ** dp) / 10 ** dp
const dueInDays = (state, nowIso) => round((Date.parse(state.dueAt) - Date.parse(nowIso)) / DAY_MS)
const section = (title) => console.log(`\n\n${'='.repeat(78)}\n  ${title}\n${'='.repeat(78)}`)

const completed = (lessonId) => ({
  userId: 'demo',
  lessonId,
  status: 'completed',
  currentStepIndex: 0,
  stepResults: {},
  startedAt: at(0),
  completedAt: at(0),
  updatedAt: at(0),
})
const progressFor = (lessonIds) => Object.fromEntries(lessonIds.map((id) => [id, completed(id)]))
const byId = (id) => ARCHITECTURE_CATALOG.find((architecture) => architecture.id === id)

const ALL_LESSONS = [
  'balancing-equations',
  'one-step-equations',
  'two-step-equations',
  'like-terms-variables-both-sides',
  'coordinate-plane',
  'graphing-lines',
]

// ----------------------------------------------------------------------------------------------

section('0. THE QUESTION BANK — skills + their unlock rules')
console.table(
  ARCHITECTURE_CATALOG.map((a) => ({
    architecture: a.id,
    skill: a.skillId,
    requiredLesson: a.requiredLessonId,
    masteryPrereqs: (a.masteryPrereqs ?? []).join(', ') || '— (entry tier)',
  })),
)

// ----------------------------------------------------------------------------------------------

section('1. SPACED REPETITION — correct recalls grow the interval; a miss resurfaces it fast')
let s = createInitialPracticeState('demo', 'one-step-equations', at(0))
const spacingRows = []
for (let i = 1; i <= 5; i += 1) {
  s = applyPracticeOutcome(s, { firstTryCorrect: true, at: at(i) })
  spacingRows.push({
    event: `correct #${i}`,
    proficiency: s.proficiency,
    streak: s.streak,
    intervalDays: s.intervalDays,
    ease: s.ease,
    nextDueInDays: dueInDays(s, at(i)),
    mastered: isSkillMastered(s),
  })
}
const missAt = at(6)
s = applyPracticeOutcome(s, { firstTryCorrect: false, at: missAt })
spacingRows.push({
  event: 'MISS',
  proficiency: s.proficiency,
  streak: s.streak,
  intervalDays: s.intervalDays,
  ease: s.ease,
  nextDueInDays: dueInDays(s, missAt),
  mastered: isSkillMastered(s),
})
console.table(spacingRows)
const dueInMinutes = Math.round((Date.parse(s.dueAt) - Date.parse(missAt)) / 60000)
console.log(
  `Interval climbs 1 -> 3 -> ~8 days on correct recalls, then the miss resets it to 0 and makes the\n` +
    `skill due again in ~${dueInMinutes} minutes (so a wrong answer resurfaces within the session).`,
)

// ----------------------------------------------------------------------------------------------

section(`2. MASTERY LEARNING — the signal: proficiency >= ${PRACTICE_MASTERY_THRESHOLD} AND a streak >= ${PRACTICE_MASTERY_STREAK}`)
let m = createInitialPracticeState('demo', 'one-step-equations', at(0))
for (let i = 1; i <= PRACTICE_MASTERY_STREAK + 1; i += 1) {
  m = applyPracticeOutcome(m, { firstTryCorrect: true, at: at(i) })
  console.log(
    `after correct #${i}: proficiency=${m.proficiency}  streak=${m.streak}  ` +
      `level=${masteryLevel(m).padEnd(9)}  mastered=${isSkillMastered(m)}`,
  )
}
console.log('A single first-try miss would drop streak to 0 and immediately revoke mastery.')

// ----------------------------------------------------------------------------------------------

section('3. INTERLEAVING — consecutive questions never repeat a skill when another is available')
const ilPool = [byId('one-step-linear'), byId('coordinate-walk')] // two DIFFERENT skills
const ilProgress = progressFor(['balancing-equations', 'one-step-equations', 'coordinate-plane'])
const ilRng = mulberry32(99)
let ilServed = []
const ilSeq = []
for (let i = 0; i < 8; i += 1) {
  const arch = selectNextArchitecture({
    pool: ilPool,
    progressByLesson: ilProgress,
    servedKeys: ilServed,
    now: at(0),
    rng: ilRng,
  })
  ilSeq.push(skillForArchitecture(arch.id))
  ilServed = [...ilServed, architectureKey(arch.id)]
}
console.log('skills served in order:\n  ' + ilSeq.join('  ->  '))
const repeats = ilSeq.filter((skill, i) => i > 0 && skill === ilSeq[i - 1]).length
console.log(
  `back-to-back same-skill repeats: ${repeats}  (the hard interleaving rule keeps this at 0 while\n` +
    `>= 2 distinct skills are available; it relaxes only when the pool is down to a single skill).`,
)

// ----------------------------------------------------------------------------------------------

section('4. MASTERY GATING — harder skills stay locked until prerequisites are mastered')
const allProgress = progressFor(ALL_LESSONS)
const reachableSkills = (practice, seed) => {
  const rng = mulberry32(seed)
  const seen = new Set()
  for (let i = 0; i < 400; i += 1) {
    const a = selectNextArchitecture({ progressByLesson: allProgress, servedKeys: [], practice, now: at(0), rng })
    if (a) seen.add(skillForArchitecture(a.id))
  }
  return [...seen].sort()
}
console.log('All 6 lessons completed, but NO practice yet — reachable skills in Story Mode:')
console.log('  ' + reachableSkills([], 7).join(', '))
const masteredOneStep = [
  { ...createInitialPracticeState('demo', 'one-step-equations', at(0)), proficiency: 1, streak: PRACTICE_MASTERY_STREAK },
]
console.log('\nAfter mastering one-step-equations — reachable skills:')
console.log('  ' + reachableSkills(masteredOneStep, 7).join(', '))
console.log('\n  -> two-step-equations only becomes practiseable once one-step is genuinely mastered.')

// ----------------------------------------------------------------------------------------------

section('5. DUE-FIRST — a skill whose interval has not elapsed yields to one that is due')
const dueProgress = progressFor(['one-step-equations', 'coordinate-plane'])
const duePractice = [
  // one-step mastered and NOT due for 5 more days; coordinate-plane never practiced (due now).
  { ...createInitialPracticeState('demo', 'one-step-equations', at(0)), proficiency: 1, streak: PRACTICE_MASTERY_STREAK, intervalDays: 5, dueAt: at(5) },
]
const dueRng = mulberry32(3)
const dueSeen = new Set()
for (let i = 0; i < 300; i += 1) {
  const a = selectNextArchitecture({ progressByLesson: dueProgress, servedKeys: [], practice: duePractice, now: at(0), rng: dueRng })
  if (a) dueSeen.add(skillForArchitecture(a.id))
}
console.log('one-step-equations is not due (due in 5 days); coordinate-plane is due now.')
console.log('reachable skills:  ' + [...dueSeen].sort().join(', ') + '   -> only the DUE skill is served.')

// ----------------------------------------------------------------------------------------------

section('6. RETRIEVAL CAPTURE + RETENTION — the "did it stick?" metric')
const attempt = (archId, correct, day, ms) => ({
  id: `${archId}-${day}`,
  userId: 'demo',
  lessonId: 'one-step-equations',
  stepId: architectureKey(archId),
  correct,
  attemptCount: 1,
  msToAnswer: ms,
  at: at(day),
  source: 'story',
})
// one-step: missed on first sight, then correct (and faster) on later spaced reviews.
const storyAttempts = [
  attempt('one-step-linear', false, 0, 5200),
  attempt('one-step-linear', true, 1, 2600),
  attempt('one-step-linear', true, 4, 1800),
  attempt('coordinate-walk', true, 0, 3000),
  attempt('coordinate-walk', true, 2, 2100),
]
const retention = computeRetention(storyAttempts, skillForStepId)
console.log(
  `Overall first-try accuracy:  first sight ${Math.round(retention.overallInitialAccuracy * 100)}%  ->  ` +
    `spaced reviews ${Math.round(retention.overallLaterAccuracy * 100)}%  (lift +${Math.round(retention.retentionLift * 100)} pts)`,
)
console.table(
  retention.bySkill.map((r) => ({
    skill: r.skillId,
    firstSightAcc: r.firstTryAccuracyInitial,
    laterSpacedAcc: r.firstTryAccuracyLater,
    lift: r.retentionLift,
    msFirst: r.avgMsInitial,
    msLater: r.avgMsLater,
  })),
)

// ----------------------------------------------------------------------------------------------

section('7. MASTERY SUMMARY — exactly what the checkpoint panel renders')
const panelPractice = [
  { ...createInitialPracticeState('demo', 'one-step-equations', at(0)), proficiency: 0.95, streak: PRACTICE_MASTERY_STREAK, totalAttempts: 9, firstTryCorrect: 8 },
  { ...createInitialPracticeState('demo', 'two-step-equations', at(0)), proficiency: 0.6, streak: 1, totalAttempts: 5, firstTryCorrect: 3 },
  { ...createInitialPracticeState('demo', 'coordinate-plane', at(0)), proficiency: 0.2, streak: 0, totalAttempts: 4, firstTryCorrect: 1 },
]
const summary = summarizePractice(panelPractice, at(0))
console.log(
  `mastered: ${summary.masteredCount}   practiced: ${summary.practicedCount}   ` +
    `learning: ${summary.learningCount}   due: ${summary.dueCount}`,
)
console.table(summary.bySkill)

console.log('\nDone. Every number above came from the same pure engine the app ships.\n')
