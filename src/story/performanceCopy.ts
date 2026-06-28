// PURE presentation copy for a chapter's performance, shown on the checkpoint/outcome screens to
// make the math -> story link EXPLICIT for the learner. Encouraging stakes: weaker bands frame a
// setback the hero overcomes, never blame the learner. React-free so it is unit-testable under
// node:test (the repo has no DOM/React test harness).

import type { ChapterPerformance, PerformanceBand } from '../domain'

export type PerformanceCopy = {
  band: PerformanceBand
  tally: string // e.g. "First try: 4 of 5"
  headline: string // e.g. "Strong chapter!"
  note: string // one-line causal tie from the math to the story
}

const COPY: Record<PerformanceBand, { headline: string; note: string }> = {
  flawless: {
    headline: 'Flawless chapter!',
    note: 'You solved every problem on the first try — and the hero reaps the rewards.',
  },
  strong: {
    headline: 'Strong chapter!',
    note: 'Sharp solving kept the hero moving forward.',
  },
  mixed: {
    headline: 'You pushed through.',
    note: 'A few tricky problems made the road ahead a little bumpier for the hero.',
  },
  struggled: {
    headline: 'Tough chapter.',
    note: 'Those were hard — the hero hits a snag, but there is always a way through.',
  },
}

export const performanceCopy = (performance: ChapterPerformance): PerformanceCopy => ({
  band: performance.band,
  tally: `First try: ${performance.firstTryCorrect} of ${performance.answered}`,
  headline: COPY[performance.band].headline,
  note: COPY[performance.band].note,
})
