// Shared content-model types for the Algebra Foundations course.
//
// Per-lesson data files (src/content/lessons/<id>.ts) and the new manipulative
// puzzle authoring all build on these types. Keeping them here (instead of in
// domain.ts) lets content files import types without depending on runtime/back-end
// code, so parallel lesson edits stay isolated.

export type SkillId =
  | 'equality'
  | 'inverse-operations'
  | 'one-step-equations'
  | 'two-step-equations'
  | 'like-terms'
  | 'variables-on-both-sides'
  | 'coordinate-plane'
  | 'graphing-lines'

export type LessonId =
  | 'balancing-equations'
  | 'one-step-equations'
  | 'two-step-equations'
  | 'like-terms-variables-both-sides'
  | 'coordinate-plane'
  | 'graphing-lines'

type Feedback = {
  correct: string
  incorrect: string
  reveal?: string
}

export type ConceptStep = {
  id: string
  type: 'concept'
  title: string
  body: string
  visual?: 'balanced-scale' | 'unknown-box'
}

export type McqStep = {
  id: string
  type: 'mcq'
  prompt: string
  visual?: 'predict-add-left'
  options: {
    id: string
    label: string
    feedback: string
  }[]
  correctId: string
  feedback?: Feedback
}

export type InputStep = {
  id: string
  type: 'input'
  prompt: string
  // Optional equation shown below the prompt, kept in plain authoring notation
  // (e.g. "x / 4 = 2") and converted to LaTeX at render time, like operation-choice/sequence.
  equation?: string
  accept: string[]
  feedback: Feedback & {
    hintsByAnswer?: Record<string, string>
  }
}

export type OperationChoiceStep = {
  id: string
  type: 'operation-choice'
  prompt: string
  equation?: string
  choices: {
    id: string
    label: string
    detail?: string
    feedback: string
  }[]
  correctId: string
  feedback: Feedback
}

export type SequenceStep = {
  id: string
  type: 'sequence'
  prompt: string
  equation?: string
  tiles: {
    id: string
    label: string
  }[]
  correctOrder: string[]
  feedback: Feedback & {
    incomplete: string
    hintsByTile?: Record<string, string>
  }
}

export type BalanceItem = {
  id: string
  label: string
  value: number
  kind: 'weight' | 'unknown'
  locked?: boolean
}

export type BalanceSide = 'left' | 'right'

export type BalanceState = {
  left: BalanceItem[]
  right: BalanceItem[]
  bank?: BalanceItem[]
  unknownValue?: number
}

type BalanceGoal =
  | {
      type: 'level'
      // A single required placement, kept as a shorthand for the simple one-block case.
      requireItemOnSide?: { itemId: string; side: BalanceSide }
      // Multiple required placements: every listed block must sit on its named pan for the
      // step to count as solved. This forces the learner to build the whole balanced scale
      // from the tray instead of leaving the pans trivially empty (0 = 0).
      requireItemsOnSide?: { itemId: string; side: BalanceSide }[]
      // Side-agnostic placement: every listed block id must sit on EITHER pan (i.e. not be
      // left in the tray). Like requireItemsOnSide this rejects the trivially empty 0 = 0
      // scale, but without pinning any block to a particular side, so mirror-image
      // arrangements that are equally level both count as solved.
      requirePlacedItems?: string[]
    }
  | { type: 'isolate'; unknownId: string; value: number }

export type BalanceOperation = {
  id: string
  label: string
  amount: number
  sides: 'both' | BalanceSide
}

export type BalanceStep = {
  id: string
  type: 'balance'
  prompt: string
  layout?: 'physical-drag'
  state: BalanceState
  goal: BalanceGoal
  operations?: BalanceOperation[]
  feedback: {
    correct: string
    explanation?: string
    hints: {
      when: 'not-level' | 'missing-item' | 'one-side-only' | 'not-isolated' | 'default'
      text: string
    }[]
    reveal: string
  }
}

// The object/theme moved around in a manipulative puzzle (e.g., an apple).
type ManipulativeObject = {
  // Singular noun used for accessible labels, e.g. "apple".
  label: string
  // Optional emoji/glyph drawn on each item; falls back to the label's initial.
  emoji?: string
}

// What makes a manipulative puzzle correct. Authors pick one operation/goal:
// - equal-groups: split/distribute every item from a pre-counted tray into `groups`
//   groups of `perGroup` (a division model where the total is given and known).
// - collect: combine/select exactly `count` items into a single group.
// - build-product: from a large pool, set BOTH the number of groups and the per-group
//   count; the total (groups x perGroup) is computed live and is the value being
//   DISCOVERED (e.g. the x in x / 5 = 3). Solved when both `groups` and `perGroup` match
//   the authored targets, so the displayed total equals x. `maxGroups`/`maxPerGroup`
//   bound the steppers (the renderer falls back to generous defaults when omitted), and
//   `total` is the size of the abundant pool the learner draws from.
type ManipulativeGoal =
  | { type: 'equal-groups'; groups: number; perGroup: number }
  | { type: 'collect'; count: number }
  | { type: 'build-product'; groups: number; perGroup: number; maxGroups?: number; maxPerGroup?: number }

export type ManipulativeHintWhen =
  | 'empty'
  | 'too-few'
  | 'too-many'
  | 'uneven'
  // build-product only: the number of groups does not match the target yet.
  | 'groups'
  // build-product only: the groups match, but the per-group count is still off.
  | 'per-group'
  | 'default'

// A data-driven creative puzzle. Two interaction shapes share this one step type:
// - equal-groups/collect: drag/tap identical objects from a tray into group zones.
// - build-product: adjust group and per-group steppers while a live total updates.
export type ManipulativeStep = {
  id: string
  type: 'manipulative'
  prompt: string
  // Total number of objects available. For equal-groups/collect this is the pre-counted
  // tray; for build-product it is the size of the large pool the learner draws from.
  total: number
  object: ManipulativeObject
  goal: ManipulativeGoal
  feedback: {
    correct: string
    incorrect: string
    reveal: string
    // Optional escalating, situation-specific hints. `default` is the fallback.
    hints?: { when: ManipulativeHintWhen; text: string }[]
  }
}

// A lattice point the learner can place on the interactive coordinate grid.
export type PlotPoint = { x: number; y: number }

// The four quadrants, numbered the conventional counterclockwise way starting upper-right.
type QuadrantId = 1 | 2 | 3 | 4

// What makes a plotted answer correct. Authors pick one of:
// - points: place a point at each exact target coordinate (order-independent).
// - quadrants: place one point inside each listed quadrant (sign pattern only, any
//   off-axis coordinate counts). A single-element list is "place a point in this quadrant".
type PlotTarget =
  | { kind: 'points'; points: PlotPoint[] }
  | { kind: 'quadrants'; quadrants: QuadrantId[] }

export type PlotHintWhen =
  | 'empty' // nothing placed yet
  | 'incomplete' // fewer points than the task needs (but the ones placed are on track)
  | 'too-many' // more points than the task needs
  | 'swapped' // an exact-point answer looks like x and y were reversed
  | 'on-axis' // a point sits on an axis, so it is in no quadrant
  | 'wrong-quadrant' // a point landed in the wrong quadrant / sign pattern
  | 'close' // right quadrant but not the exact target coordinate
  | 'default'

// A data-driven interactive coordinate-grid task (PRD R15): tap/click or use the keyboard
// to place points on a labeled grid that runs `range.min`..`range.max` on both axes.
export type PlotStep = {
  id: string
  type: 'plot'
  prompt: string
  // Inclusive integer bounds shared by both axes (e.g. { min: -5, max: 5 }).
  range: { min: number; max: number }
  target: PlotTarget
  feedback: {
    correct: string
    incorrect: string
    reveal: string
    hints?: { when: PlotHintWhen; text: string }[]
  }
}

// One draggable range control (a slope `m` or intercept `b` slider). Inclusive bounds
// with an optional `step` granularity (defaults to 1).
type SliderControl = {
  min: number
  max: number
  step?: number
}

export type SliderHintWhen =
  | 'slope-direction' // the slope sign is wrong, so the line tilts the opposite way
  | 'slope-off' // the intercept matches but the slope is still off
  | 'intercept-off' // the slope matches but the intercept is still off
  | 'both-off' // both controls are off and not yet close
  | 'close' // both controls are within one step of the target
  | 'default'

// A data-driven interactive slider task (PRD R16): drag the slope `m` and intercept `b`
// range controls to redraw a live line y = mx + b until it matches `target`.
export type SliderStep = {
  id: string
  type: 'slider'
  prompt: string
  // The m (slope) range control.
  slope: SliderControl
  // The b (y-intercept) range control.
  intercept: SliderControl
  // The slope/intercept pair the learner must match.
  target: { slope: number; intercept: number }
  // Optional absolute tolerance for matching each value (defaults to an exact match).
  tolerance?: number
  // Inclusive integer bounds shared by both axes for the live coordinate grid.
  range: { min: number; max: number }
  feedback: {
    correct: string
    incorrect: string
    reveal: string
    hints?: { when: SliderHintWhen; text: string }[]
  }
}

// One labeled algebra term tile the learner sorts (e.g. `3x`, `-2x`, `5`, `4y`). `bin` is the
// id of the group it belongs in, so membership (the correct answer) lives in the data.
type TermTile = {
  id: string
  label: string
  bin: string
}

// A target group the learner sorts tiles into (e.g. "x-terms", "y-terms", "constants").
type TermBin = {
  id: string
  label: string
  // Optional helper text shown under the bin label, e.g. "Same variable part: x".
  detail?: string
}

export type DragTermsHintWhen =
  | 'empty' // nothing sorted out of the tray yet
  | 'incomplete' // every sorted tile is correct so far, but some tiles remain unsorted
  | 'misplaced' // at least one tile sits in the wrong bin
  | 'default'

// A data-driven labeled term-tile sorting task (PRD R14): drag/tap each labeled term tile into
// the bin whose variable part it matches (combining like terms made hands-on).
export type DragTermsStep = {
  id: string
  type: 'dragTerms'
  prompt: string
  // Optional expression/equation shown above the tiles for context (e.g. "4x + 3 - x + 2y").
  equation?: string
  tiles: TermTile[]
  bins: TermBin[]
  feedback: {
    correct: string
    incorrect: string
    reveal: string
    hints?: { when: DragTermsHintWhen; text: string }[]
  }
}

export type LessonStep =
  | ConceptStep
  | McqStep
  | InputStep
  | OperationChoiceStep
  | SequenceStep
  | BalanceStep
  | ManipulativeStep
  | PlotStep
  | SliderStep
  | DragTermsStep

export type Lesson = {
  id: LessonId
  title: string
  subtitle: string
  skillIds: SkillId[]
  prerequisites: LessonId[]
  steps: LessonStep[]
}

export type Skill = {
  id: SkillId
  title: string
  description: string
}

export type CourseLessonNode = {
  id: LessonId
  title: string
  description: string
}

export type Course = {
  title: string
  description: string
  lessonOrder: LessonId[]
  lessons: CourseLessonNode[]
}
