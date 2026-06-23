export type StepType = 'concept' | 'mcq' | 'input' | 'balance' | 'operation-choice' | 'sequence'

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

export type Feedback = {
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
    detail?: string
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

export type BalanceGoal =
  | { type: 'level'; requireItemOnSide?: { itemId: string; side: BalanceSide } }
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

export type LessonStep = ConceptStep | McqStep | InputStep | OperationChoiceStep | SequenceStep | BalanceStep

export type Lesson = {
  id: LessonId
  title: string
  subtitle: string
  skillIds: SkillId[]
  prerequisites: LessonId[]
  nextLessonId?: LessonId
  steps: LessonStep[]
}

export type Skill = {
  id: SkillId
  title: string
  description: string
  prerequisites: SkillId[]
}

export type CourseLessonNode = {
  id: LessonId
  title: string
  description: string
  status: 'available' | 'locked' | 'coming-soon'
}

export type Course = {
  id: 'algebra-foundations'
  title: string
  subject: 'algebra'
  description: string
  lessonOrder: LessonId[]
  lessons: CourseLessonNode[]
}

export type UserProfile = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  createdAt: string
}

export type StepResult = {
  correct: boolean
  attempts: number
  feedback: string
}

export type LessonScore = {
  scorePercent: number
  correctFirstTryCount: number
  assessedStepCount: number
  completedAt: string
}

export type LessonProgress = {
  userId: string
  lessonId: LessonId
  status: 'notStarted' | 'inProgress' | 'completed'
  currentStepIndex: number
  stepResults: Record<string, StepResult>
  latestScore?: LessonScore
  bestScore?: LessonScore
  completionHistory?: LessonScore[]
  startedAt: string
  completedAt?: string
  updatedAt: string
}

export type SkillMastery = {
  userId: string
  skillId: SkillId
  score: number
  attempts: number
  correct: number
  lastPracticedAt: string
}

export type AttemptEvent = {
  id: string
  userId: string
  lessonId: LessonId
  stepId: string
  correct: boolean
  attemptCount: number
  msToAnswer: number
  at: string
}

export const skills: Skill[] = [
  {
    id: 'equality',
    title: 'Equality',
    description: 'Understand that an equation says two sides have the same value.',
    prerequisites: [],
  },
  {
    id: 'inverse-operations',
    title: 'Inverse operations',
    description: 'Undo addition or subtraction by doing the opposite operation to both sides.',
    prerequisites: ['equality'],
  },
  {
    id: 'one-step-equations',
    title: 'One-step equations',
    description: 'Solve simple equations with one operation.',
    prerequisites: ['equality', 'inverse-operations'],
  },
  {
    id: 'two-step-equations',
    title: 'Two-step equations',
    description: 'Undo addition or subtraction before multiplication or division.',
    prerequisites: ['one-step-equations'],
  },
  {
    id: 'like-terms',
    title: 'Like terms',
    description: 'Combine terms that have the same variable part.',
    prerequisites: ['two-step-equations'],
  },
  {
    id: 'variables-on-both-sides',
    title: 'Variables on both sides',
    description: 'Move variable terms across the equals sign while preserving equality.',
    prerequisites: ['like-terms'],
  },
  {
    id: 'coordinate-plane',
    title: 'Coordinate plane',
    description: 'Read and place points using x- and y-coordinates.',
    prerequisites: ['variables-on-both-sides'],
  },
  {
    id: 'graphing-lines',
    title: 'Graphing lines',
    description: 'Connect slope-intercept equations to line graphs.',
    prerequisites: ['coordinate-plane'],
  },
]

export const balancingEquationsLesson: Lesson = {
  id: 'balancing-equations',
  title: 'Balancing Equations',
  subtitle: 'What the equals sign really means',
  skillIds: ['equality', 'inverse-operations'],
  prerequisites: [],
  nextLessonId: 'one-step-equations',
  steps: [
    {
      id: 'concept-balance',
      type: 'concept',
      title: 'An equation is a balance',
      body: 'The equals sign means both sides weigh the same. If one side changes, the scale tells you immediately.',
      visual: 'balanced-scale',
    },
    {
      id: 'predict-add-left',
      type: 'mcq',
      prompt: 'A level scale changes from 3 = 3 to 3 + 2 on the left and 3 on the right. Predict the tilt before you touch anything.',
      visual: 'predict-add-left',
      correctId: 'tips-left',
      options: [
        {
          id: 'tips-left',
          label: 'The 3 + 2 pan drops',
          feedback: 'Exactly. That pan totals 5, so it is heavier than the pan with 3.',
        },
        {
          id: 'stays-level',
          label: 'It stays level',
          feedback: 'Not quite. The totals changed from 3 and 3 to 5 and 3, so the pans cannot stay level.',
        },
        {
          id: 'tips-right',
          label: 'The pan with only 3 drops',
          feedback: 'Check the totals. The pan with only 3 is lighter than the pan with 3 + 2.',
        },
      ],
      feedback: {
        correct: 'Exactly. The left pan is heavier because 5 is greater than 3.',
        incorrect: 'Compare the totals on the two pans after the change.',
        reveal: 'The left pan totals 3 + 2 = 5, while the right pan totals 3, so the left pan drops.',
      },
    },
    {
      id: 'drag-to-level',
      type: 'balance',
      layout: 'physical-drag',
      prompt: 'Make the scale level again by dragging the 2 onto the right pan.',
      state: {
        left: [
          { id: 'left-3', label: '3', value: 3, kind: 'weight', locked: true },
          { id: 'left-extra-2', label: '2', value: 2, kind: 'weight', locked: true },
        ],
        right: [{ id: 'right-3', label: '3', value: 3, kind: 'weight', locked: true }],
        bank: [{ id: 'right-match-2', label: '2', value: 2, kind: 'weight' }],
      },
      goal: { type: 'level', requireItemOnSide: { itemId: 'right-match-2', side: 'right' } },
      feedback: {
        correct: 'Adding the same amount to both sides keeps the equation balanced.',
        explanation:
          'A level scale means both pans total the same amount. The left side is 3 + 2, so the right side also needs to total 5.',
        hints: [
          {
            when: 'missing-item',
            text: 'The left side has an extra 2. Put a matching 2 on the right side.',
          },
          {
            when: 'not-level',
            text: 'The scale is still tilted. Your goal is for both pans to weigh the same.',
          },
          {
            when: 'default',
            text: 'Try matching the change on the other side of the scale.',
          },
        ],
        reveal: 'Drag the 2 from the tray to the right pan so both sides weigh 5.',
      },
    },
    {
      id: 'concept-unknown',
      type: 'concept',
      title: 'The box can hide a number',
      body: 'A variable like x is an unknown box. If x + 2 balances with 5, the box must contain whatever makes the left side total 5.',
      visual: 'unknown-box',
    },
    {
      id: 'input-box-value',
      type: 'input',
      prompt: 'The scale shows x + 2 = 5. What is inside the box?',
      accept: ['3', 'x=3', 'x = 3', '6/2'],
      feedback: {
        correct: 'Yes. The box must be 3 because 3 + 2 = 5.',
        incorrect: 'Use the whole right side, then account for the 2 already sitting next to x.',
        reveal: 'x = 3 because 5 - 2 = 3.',
        hintsByAnswer: {
          '5': "That's the whole right side, but the left pan also has a 2 next to the box.",
          '2': 'That is the loose weight next to the box. The box has to be the remaining amount.',
        },
      },
    },
    {
      id: 'remove-two-both-sides',
      type: 'balance',
      prompt: 'Isolate the box by removing 2 from both sides.',
      state: {
        left: [
          { id: 'x-box', label: 'x', value: 3, kind: 'unknown', locked: true },
          { id: 'left-2', label: '2', value: 2, kind: 'weight', locked: true },
        ],
        right: [{ id: 'right-5', label: '5', value: 5, kind: 'weight', locked: true }],
        unknownValue: 3,
      },
      operations: [
        { id: 'remove-two-both', label: '-2 from both sides', amount: -2, sides: 'both' },
        { id: 'remove-two-left', label: '-2 from left only', amount: -2, sides: 'left' },
      ],
      goal: { type: 'isolate', unknownId: 'x-box', value: 3 },
      feedback: {
        correct: 'Now the box is alone: x = 3. You kept the scale balanced by doing the same thing to both sides.',
        explanation:
          'To undo x + 2 = 5, remove the +2 from the x side and remove the same 2 from the 5 side so equality stays true.',
        hints: [
          {
            when: 'one-side-only',
            text: 'You only took from one side, so the scale tipped. Whatever you do to one side, do to the other.',
          },
          {
            when: 'not-isolated',
            text: 'The goal is to leave the box by itself while keeping the scale level.',
          },
          {
            when: 'default',
            text: 'Choose the operation that removes 2 from both sides.',
          },
        ],
        reveal: 'Tap "-2 from both sides" to turn x + 2 = 5 into x = 3.',
      },
    },
    {
      id: 'choose-balanced-move',
      type: 'operation-choice',
      prompt: 'A student solving x + 4 = 9 crosses out the +4 only on the left and says x = 9. Which move fixes the balance?',
      equation: 'x + 4 = 9',
      correctId: 'subtract-four-both',
      choices: [
        {
          id: 'subtract-four-both',
          label: '-4 from both sides',
          detail: 'Undo +4 and keep equality true.',
          feedback: 'Yes. Subtracting 4 from both sides leaves x alone and keeps the scale level.',
        },
        {
          id: 'subtract-four-left',
          label: '-4 from left only',
          detail: 'Only changes the x side.',
          feedback: 'That would leave x alone, but the two sides would no longer match.',
        },
        {
          id: 'add-four-both',
          label: '+4 to both sides',
          detail: 'Repeats the operation.',
          feedback: 'Adding 4 repeats the +4 instead of undoing it.',
        },
      ],
      feedback: {
        correct: 'Great. The balanced move is -4 from both sides, which gives x = 5.',
        incorrect: 'Pick the inverse operation, and make sure it happens to both sides.',
        reveal: 'Choose "-4 from both sides" because x + 4 = 9 becomes x = 5.',
      },
    },
    {
      id: 'order-balance-repair',
      type: 'sequence',
      prompt: 'Build the shortest balance story for y + 1 = 6.',
      equation: 'y + 1 = 6',
      tiles: [
        {
          id: 'subtract-one-both',
          label: 'Subtract 1 from both sides',
          detail: 'Remove the extra 1 next to y.',
        },
        {
          id: 'y-equals-five',
          label: 'y = 5',
          detail: 'The remaining right side is 6 - 1.',
        },
        {
          id: 'subtract-one-left',
          label: 'Subtract 1 from the left only',
          detail: 'This isolates y but tips the scale.',
        },
        {
          id: 'y-equals-six',
          label: 'y = 6',
          detail: 'This ignores the +1 next to y.',
        },
      ],
      correctOrder: ['subtract-one-both', 'y-equals-five'],
      feedback: {
        correct: 'Correct. Removing 1 from both sides leaves y = 5.',
        incorrect: 'Keep the scale balanced first, then name the value left for y.',
        incomplete: 'Choose the balancing move and then the resulting value.',
        reveal: 'Tap "Subtract 1 from both sides", then "y = 5".',
        hintsByTile: {
          'subtract-one-left': 'That isolates y, but it changes only one side of the equation.',
          'y-equals-six': '6 is the whole right side before the +1 has been undone.',
          'y-equals-five': 'y = 5 is the result, but first show the balancing move that gets there.',
        },
      },
    },
    {
      id: 'complete-summary',
      type: 'concept',
      title: 'You solved by balancing',
      body: 'You solved equations by keeping both sides equal. Up next: one-step equations with multiplication and division.',
      visual: 'balanced-scale',
    },
  ],
}

export const lessons: Record<LessonId, Lesson> = {
  'balancing-equations': balancingEquationsLesson,
  'one-step-equations': {
    id: 'one-step-equations',
    title: 'One-Step Equations',
    subtitle: 'Undo one operation',
    skillIds: ['one-step-equations'],
    prerequisites: ['balancing-equations'],
    nextLessonId: 'two-step-equations',
    steps: [
      {
        id: 'concept-undoing',
        type: 'concept',
        title: 'Solving means undoing',
        body: 'When an operation changes x, solve by undoing that operation on both sides. The goal is to leave x alone while the equation stays true.',
        visual: 'unknown-box',
      },
      {
        id: 'choose-inverse-subtraction',
        type: 'operation-choice',
        prompt: 'Choose the operation tile that starts solving x - 3 = 4.',
        equation: 'x - 3 = 4',
        correctId: 'add-three-both',
        choices: [
          {
            id: 'add-three-both',
            label: '+3 to both sides',
            detail: 'Undo -3 and preserve balance.',
            feedback: 'Exactly. Adding 3 undoes the -3, and doing it to both sides keeps equality true.',
          },
          {
            id: 'subtract-three-both',
            label: '-3 from both sides',
            detail: 'Repeats the subtraction.',
            feedback: 'That repeats the subtraction. To undo -3, use the opposite operation: +3.',
          },
          {
            id: 'add-three-left',
            label: '+3 to the left side only',
            detail: 'Only changes the x side.',
            feedback: 'That would isolate x, but it would also break the balance. Whatever you do to one side, do to the other.',
          },
        ],
        feedback: {
          correct: 'Exactly. +3 to both sides turns x - 3 = 4 into x = 7.',
          incorrect: 'Find the inverse of -3, then apply it to both sides.',
          reveal: 'Choose "+3 to both sides" because it undoes -3 without changing the balance.',
        },
      },
      {
        id: 'balance-add-three-both',
        type: 'balance',
        prompt: 'Isolate x in x - 3 = 4 by adding 3 to both sides.',
        state: {
          left: [
            { id: 'x-minus-three-x', label: 'x', value: 7, kind: 'unknown', locked: true },
            { id: 'left-minus-3', label: '-3', value: -3, kind: 'weight', locked: true },
          ],
          right: [{ id: 'right-4', label: '4', value: 4, kind: 'weight', locked: true }],
          unknownValue: 7,
        },
        operations: [
          { id: 'add-three-both', label: '+3 to both sides', amount: 3, sides: 'both' },
          { id: 'add-three-left', label: '+3 to left only', amount: 3, sides: 'left' },
        ],
        goal: { type: 'isolate', unknownId: 'x-minus-three-x', value: 7 },
        feedback: {
          correct: 'Yes. x = 7 because adding 3 to both sides turns x - 3 = 4 into x = 7.',
          explanation:
            'The -3 is attached to x, so add 3 to undo it. The right side must also get +3 so the equation stays balanced.',
          hints: [
            {
              when: 'one-side-only',
              text: 'Adding 3 only on the x side isolates x, but the two sides are no longer equal.',
            },
            {
              when: 'not-isolated',
              text: 'Undo the -3 next to x, and make the same change to the right side.',
            },
            {
              when: 'default',
              text: 'Use the inverse of -3 on both sides.',
            },
          ],
          reveal: 'Tap "+3 to both sides" so the left becomes x and the right becomes 7.',
        },
      },
      {
        id: 'spot-one-side-only-mistake',
        type: 'operation-choice',
        prompt: 'Jules solves x - 5 = 9 by adding 5 only to the left side and gets x = 9. What is the mistake?',
        equation: 'x - 5 = 9 -> x = 9',
        correctId: 'changed-one-side',
        choices: [
          {
            id: 'changed-one-side',
            label: 'They changed only one side',
            detail: 'The left side got +5, but the right side stayed 9.',
            feedback: 'Yes. Adding 5 undoes the -5, but the same +5 must happen to the right side too.',
          },
          {
            id: 'wrong-inverse',
            label: 'They should subtract 5',
            detail: 'This repeats the -5.',
            feedback: 'Subtracting 5 would move farther from x. The inverse is +5, but it must be applied to both sides.',
          },
          {
            id: 'answer-too-large',
            label: 'The answer should be smaller than 9',
            detail: 'Checks the size of the answer instead of the move.',
            feedback: 'The value should actually be larger than 9 because x had 5 removed from it.',
          },
        ],
        feedback: {
          correct: 'Right. The balanced move is +5 to both sides, so x = 14.',
          incorrect: 'Look for whether the inverse operation was applied to both sides.',
          reveal: 'The mistake is adding 5 only on the left. Correct path: x - 5 = 9 -> x = 14.',
        },
      },
      {
        id: 'input-add-six',
        type: 'sequence',
        prompt: 'Tap the steps in order to solve x + 6 = 10.',
        equation: 'x + 6 = 10',
        tiles: [
          {
            id: 'subtract-six-both',
            label: 'Subtract 6 from both sides',
            detail: 'Undo the +6.',
          },
          {
            id: 'x-equals-four',
            label: 'x = 4',
            detail: 'The right side becomes 10 - 6.',
          },
          {
            id: 'add-six-both',
            label: 'Add 6 to both sides',
            detail: 'This repeats +6.',
          },
          {
            id: 'x-equals-ten',
            label: 'x = 10',
            detail: 'This uses the whole right side.',
          },
        ],
        correctOrder: ['subtract-six-both', 'x-equals-four'],
        feedback: {
          correct: 'Correct. First subtract 6 from both sides, then x = 4.',
          incorrect: 'Start by undoing the +6. The answer comes after that move.',
          incomplete: 'Choose the inverse move first, then the resulting value of x.',
          reveal: 'Tap "Subtract 6 from both sides", then "x = 4".',
          hintsByTile: {
            'add-six-both': 'Adding 6 repeats the operation. Use the inverse operation instead.',
            'x-equals-ten': '10 is the whole right side before undoing the +6.',
            'x-equals-four': 'x = 4 is the result, but first show the move that gets there.',
          },
        },
      },
      {
        id: 'concept-multiply-divide',
        type: 'concept',
        title: 'Multiplication and division undo each other',
        body: 'If x is multiplied by 3, divide both sides by 3. If x is divided by 4, multiply both sides by 4.',
        visual: 'balanced-scale',
      },
      {
        id: 'input-three-x',
        type: 'operation-choice',
        prompt: 'For 3x = 12, which operation tile isolates one x?',
        equation: '3x = 12',
        correctId: 'divide-three-both',
        choices: [
          {
            id: 'divide-three-both',
            label: '/3 on both sides',
            detail: 'Split both sides into 3 equal groups.',
            feedback: 'Right. Dividing both sides by 3 turns 3x = 12 into x = 4.',
          },
          {
            id: 'subtract-three-both',
            label: '-3 from both sides',
            detail: 'Treats 3x like x + 3.',
            feedback: '3x means 3 times x, not x plus 3. Use division to undo multiplication.',
          },
          {
            id: 'multiply-three-both',
            label: 'x3 on both sides',
            detail: 'Repeats the multiplication.',
            feedback: 'Multiplying by 3 repeats the operation. To undo 3 times x, divide by 3.',
          },
        ],
        feedback: {
          correct: 'Right. x = 4 because 12 divided by 3 is 4.',
          incorrect: '3x means multiplication, so use the inverse operation on both sides.',
          reveal: 'Choose "/3 on both sides" because 3x / 3 = x and 12 / 3 = 4.',
        },
      },
      {
        id: 'order-division-undo',
        type: 'sequence',
        prompt: 'Put the undoing moves in order for x / 4 = 2.',
        equation: 'x / 4 = 2',
        tiles: [
          {
            id: 'multiply-four-both',
            label: 'Multiply both sides by 4',
            detail: 'Undo division by 4.',
          },
          {
            id: 'x-equals-eight',
            label: 'x = 8',
            detail: 'The right side becomes 2 x 4.',
          },
          {
            id: 'divide-four-both',
            label: 'Divide both sides by 4',
            detail: 'This repeats the division.',
          },
          {
            id: 'x-equals-two',
            label: 'x = 2',
            detail: 'This is the result before undoing the division.',
          },
        ],
        correctOrder: ['multiply-four-both', 'x-equals-eight'],
        feedback: {
          correct: 'Correct. Multiplying both sides by 4 gives x = 8.',
          incorrect: 'Undo division by multiplying, then write the value of x.',
          incomplete: 'Choose the inverse move first, then the resulting value.',
          reveal: 'Tap "Multiply both sides by 4", then "x = 8".',
          hintsByTile: {
            'divide-four-both': 'Dividing by 4 again repeats the operation. Use multiplication to undo division.',
            'x-equals-two': '2 is what x becomes after division by 4, not the original x.',
            'x-equals-eight': 'x = 8 is the result, but first show the move that gets there.',
          },
        },
      },
      {
        id: 'input-x-divided-by-four',
        type: 'input',
        prompt: 'Solve x / 4 = 2. What is x?',
        accept: ['8', 'x=8', 'x = 8', '16/2'],
        feedback: {
          correct: 'Exactly. x = 8 because 8 / 4 = 2.',
          incorrect: 'x is being divided by 4, so multiply both sides by 4.',
          reveal: 'x = 8 because 2 x 4 = 8.',
          hintsByAnswer: {
            '2': 'That is the result after x was divided by 4. Work backward to find x.',
            '0.5': 'That divides by 4 again. Undo division by multiplying by 4.',
            '6': 'Adding 4 does not undo division by 4. Use multiplication.',
          },
        },
      },
      {
        id: 'complete-one-step-summary',
        type: 'concept',
        title: 'You can undo one operation',
        body: 'You solved one-step equations by choosing the inverse operation and applying it to both sides. Next, two-step equations ask you to decide which operation to undo first.',
        visual: 'unknown-box',
      },
    ],
  },
  'two-step-equations': {
    id: 'two-step-equations',
    title: 'Two-Step Equations',
    subtitle: 'Undo in the right order',
    skillIds: ['two-step-equations'],
    prerequisites: ['one-step-equations'],
    nextLessonId: 'like-terms-variables-both-sides',
    steps: [
      {
        id: 'concept-reverse-order',
        type: 'concept',
        title: 'Peel off the outside operation',
        body: 'In 4x - 5 = 19, x is first multiplied by 4, then 5 is subtracted. Solve by working backward: clear the -5, then split the 4x into four equal parts.',
        visual: 'unknown-box',
      },
      {
        id: 'choose-first-two-step-move',
        type: 'operation-choice',
        prompt: 'A lock opens when 4x - 5 = 19 is solved. Which move should happen first?',
        equation: '4x - 5 = 19',
        correctId: 'add-five-both',
        choices: [
          {
            id: 'add-five-both',
            label: '+5 to both sides',
            detail: 'Undo the outside -5.',
            feedback: 'Yes. Adding 5 to both sides turns the lock into 4x = 24.',
          },
          {
            id: 'divide-four-both',
            label: '/4 on both sides',
            detail: 'Tries to split 4x right away.',
            feedback: 'That split comes second. The -5 is outside the 4x bundle, so clear it before dividing.',
          },
          {
            id: 'add-five-left',
            label: '+5 to the left side only',
            detail: 'Only changes one side.',
            feedback: 'That removes the -5 from the x side, but the scale tips unless the right side also gets +5.',
          },
          {
            id: 'x-equals-nineteen',
            label: 'x = 19',
            detail: 'Uses the whole right side as x.',
            feedback: '19 is the value of the whole expression 4x - 5, not the value of x.',
          },
        ],
        feedback: {
          correct: 'Correct. Add 5 to both sides first, giving 4x = 24.',
          incorrect: 'Work backward from the operation farthest from x, and keep both sides balanced.',
          reveal: 'Choose "+5 to both sides" first. Then divide both sides by 4.',
        },
      },
      {
        id: 'balance-clear-four-x',
        type: 'balance',
        prompt: 'Use the scale to clear the -5 and leave the 4x bundle alone.',
        state: {
          left: [
            { id: 'four-x-bundle', label: '4x', value: 24, kind: 'unknown', locked: true },
            { id: 'left-minus-5', label: '-5', value: -5, kind: 'weight', locked: true },
          ],
          right: [{ id: 'right-19', label: '19', value: 19, kind: 'weight', locked: true }],
          unknownValue: 24,
        },
        operations: [
          { id: 'add-five-both', label: '+5 to both sides', amount: 5, sides: 'both' },
          { id: 'add-five-left', label: '+5 to left only', amount: 5, sides: 'left' },
        ],
        goal: { type: 'isolate', unknownId: 'four-x-bundle', value: 24 },
        feedback: {
          correct: 'The 4x bundle is alone now: 4x = 24. One more inverse move will split it into x = 6.',
          explanation:
            'The -5 attached to 4x is undone by +5. Add the same 5 to the right side so the equation stays balanced.',
          hints: [
            {
              when: 'one-side-only',
              text: 'You cleared the x side only. A balanced equation needs the same +5 on the right side.',
            },
            {
              when: 'not-isolated',
              text: 'Your goal is to leave only the 4x bundle on one side while the scale stays level.',
            },
            {
              when: 'default',
              text: 'Use the move that cancels -5 on both sides.',
            },
          ],
          reveal: 'Tap "+5 to both sides" so 4x - 5 = 19 becomes 4x = 24.',
        },
      },
      {
        id: 'order-two-step-solution',
        type: 'sequence',
        prompt: 'Build the full solution path for the lock equation.',
        equation: '4x - 5 = 19',
        tiles: [
          {
            id: 'add-five-both',
            label: 'Add 5 to both sides',
            detail: '4x - 5 = 19 becomes 4x = 24.',
          },
          {
            id: 'divide-four-both',
            label: 'Divide both sides by 4',
            detail: '4x = 24 becomes x = 6.',
          },
          {
            id: 'x-equals-six',
            label: 'x = 6',
            detail: 'The isolated value.',
          },
          {
            id: 'divide-four-first',
            label: 'Divide by 4 first',
            detail: 'This ignores the -5.',
          },
          {
            id: 'subtract-five-both',
            label: 'Subtract 5 from both sides',
            detail: 'This repeats the -5 instead of undoing it.',
          },
          {
            id: 'x-equals-nineteen',
            label: 'x = 19',
            detail: 'This uses the whole right side.',
          },
        ],
        correctOrder: ['add-five-both', 'divide-four-both', 'x-equals-six'],
        feedback: {
          correct: 'Nice. The reverse order is add 5, divide by 4, so x = 6.',
          incorrect: 'First undo the outside -5, then undo the multiplication, then write x.',
          incomplete: 'Use three tiles: clear the -5, split the 4x, then choose the value of x.',
          reveal: 'Tap "Add 5 to both sides", "Divide both sides by 4", then "x = 6".',
          hintsByTile: {
            'divide-four-first': 'Dividing first is tempting, but the -5 still changes the 4x bundle.',
            'subtract-five-both': 'Subtracting 5 repeats the -5. Add 5 to undo it.',
            'x-equals-nineteen': '19 is the whole right side before either operation has been undone.',
            'x-equals-six': 'x = 6 is the result, but it belongs after both inverse moves.',
          },
        },
      },
      {
        id: 'input-puzzle-gate',
        type: 'input',
        prompt: 'A puzzle gate shows 3x + 6 = 21. What is x?',
        accept: ['5', 'x=5', 'x = 5', '15/3'],
        feedback: {
          correct: 'Exactly. Subtract 6 to get 3x = 15, then divide by 3 to get x = 5.',
          incorrect: 'Clear the +6 first, then divide the remaining value by 3.',
          reveal: '3x + 6 = 21 -> 3x = 15 -> x = 5.',
          hintsByAnswer: {
            '21': '21 is the value of the whole expression 3x + 6, not x.',
            '15': '15 is the value of 3x after clearing +6. Divide by 3 to find one x.',
            '9': 'That looks like adding 6 before dividing. The +6 should be subtracted away.',
            '7': 'Dividing 21 by 3 skips the +6. Clear the +6 before you split into groups of 3.',
          },
        },
      },
      {
        id: 'choose-right-side-expression',
        type: 'operation-choice',
        prompt: 'Now the x expression is on the right: 18 = 5x + 3. Which move comes first?',
        equation: '18 = 5x + 3',
        correctId: 'subtract-three-both',
        choices: [
          {
            id: 'subtract-three-both',
            label: '-3 from both sides',
            detail: 'Undo the outside +3.',
            feedback: 'Yes. The x side is on the right, but the outside +3 still gets cleared first.',
          },
          {
            id: 'divide-five-both',
            label: '/5 on both sides',
            detail: 'Tries to split 5x right away.',
            feedback: 'That division comes second. First turn 18 = 5x + 3 into 15 = 5x.',
          },
          {
            id: 'subtract-three-right',
            label: '-3 from right only',
            detail: 'Only changes the x side.',
            feedback: 'That clears the +3, but only on one side. Equality needs the left side to lose 3 too.',
          },
          {
            id: 'x-equals-eighteen',
            label: 'x = 18',
            detail: 'Uses the non-x side as x.',
            feedback: '18 matches the whole right side 5x + 3. It is not the value of one x.',
          },
        ],
        feedback: {
          correct: 'Correct. Subtract 3 from both sides to get 15 = 5x, then divide by 5.',
          incorrect: 'Ignore which side x is on. Undo the outside operation first and keep both sides balanced.',
          reveal: 'Choose "-3 from both sides": 18 = 5x + 3 becomes 15 = 5x, then x = 3.',
        },
      },
      {
        id: 'order-mixed-two-step-solution',
        type: 'sequence',
        prompt: 'Build the path for 5 + 2x = 17.',
        equation: '5 + 2x = 17',
        tiles: [
          {
            id: 'subtract-five-both',
            label: 'Subtract 5 from both sides',
            detail: '5 + 2x = 17 becomes 2x = 12.',
          },
          {
            id: 'divide-two-both',
            label: 'Divide both sides by 2',
            detail: '2x = 12 becomes x = 6.',
          },
          {
            id: 'x-equals-six',
            label: 'x = 6',
            detail: 'The isolated value.',
          },
          {
            id: 'divide-two-first',
            label: 'Divide by 2 first',
            detail: 'This splits before clearing the +5.',
          },
          {
            id: 'x-equals-seventeen',
            label: 'x = 17',
            detail: 'This treats the right side as x.',
          },
        ],
        correctOrder: ['subtract-five-both', 'divide-two-both', 'x-equals-six'],
        feedback: {
          correct: 'Correct. Clear the +5, divide by 2, and x = 6.',
          incorrect: 'The +5 is outside the 2x, so clear it before dividing.',
          incomplete: 'Choose the move that clears +5, the move that splits 2x, and then the value of x.',
          reveal: 'Tap "Subtract 5 from both sides", "Divide both sides by 2", then "x = 6".',
          hintsByTile: {
            'divide-two-first': 'Dividing first changes the whole side while +5 is still attached.',
            'x-equals-seventeen': '17 is the whole right side, not one x.',
            'x-equals-six': 'x = 6 is the final tile, after the two inverse moves.',
          },
        },
      },
      {
        id: 'input-negative-constant',
        type: 'input',
        prompt: 'Solve 2x - 7 = 5. What is x?',
        accept: ['6', 'x=6', 'x = 6', '12/2'],
        feedback: {
          correct: 'Yes. Add 7 to get 2x = 12, then divide by 2 to get x = 6.',
          incorrect: 'Undo -7 with +7 first, then divide by 2.',
          reveal: '2x - 7 = 5 -> 2x = 12 -> x = 6.',
          hintsByAnswer: {
            '5': '5 is the value of the whole left expression, not the value of x.',
            '-1': 'Subtracting 7 again moves in the wrong direction. Undo -7 with +7.',
            '12': '12 is the value of 2x. Divide by 2 to find one x.',
            '4': 'Check the arithmetic after adding 7: 5 + 7 is 12, then 12 / 2 is 6.',
          },
        },
      },
      {
        id: 'spot-two-step-mistake',
        type: 'operation-choice',
        prompt: 'A student solves 3x + 6 = 21 as 3x = 27, then x = 9. What went wrong?',
        equation: '3x + 6 = 21 -> 3x = 27 -> x = 9',
        correctId: 'added-instead-of-subtracted',
        choices: [
          {
            id: 'added-instead-of-subtracted',
            label: 'They added 6 instead of subtracting 6',
            detail: 'The first inverse move went the wrong way.',
            feedback: 'Yes. To undo +6, subtract 6 from both sides so 3x = 15.',
          },
          {
            id: 'divided-too-early',
            label: 'They divided before clearing +6',
            detail: 'A wrong-order mistake.',
            feedback: 'They did clear the +6 position first, but used the wrong inverse operation.',
          },
          {
            id: 'arithmetic-slip',
            label: 'They divided 27 by 3 incorrectly',
            detail: 'Checks the final arithmetic.',
            feedback: '27 / 3 is 9, so the division was consistent. The mistake happened before that.',
          },
          {
            id: 'x-equals-right-side',
            label: 'They treated 21 as x',
            detail: 'Uses the whole right side.',
            feedback: 'That is a common mistake, but this work made x = 9. The first move is the broken one.',
          },
        ],
        feedback: {
          correct: 'Right. The inverse of +6 is -6, so the path is 3x = 15, then x = 5.',
          incorrect: 'Look at the first move: did it undo +6, keep balance, and keep the arithmetic straight?',
          reveal: 'The mistake is adding 6 instead of subtracting it. Correct path: 3x + 6 = 21 -> 3x = 15 -> x = 5.',
        },
      },
      {
        id: 'complete-two-step-summary',
        type: 'concept',
        title: 'You solved in reverse order',
        body: 'Two-step equations are one-step equations chained together: undo the outside operation, keep both sides balanced, then undo what is attached to x.',
        visual: 'balanced-scale',
      },
    ],
  },
  'like-terms-variables-both-sides': {
    id: 'like-terms-variables-both-sides',
    title: 'Like Terms & Variables on Both Sides',
    subtitle: 'Combine terms before solving',
    skillIds: ['like-terms', 'variables-on-both-sides'],
    prerequisites: ['two-step-equations'],
    nextLessonId: 'coordinate-plane',
    steps: [
      {
        id: 'concept-like-terms',
        type: 'concept',
        title: 'Terms can join their own team',
        body: 'Before graphing lines, learners need practice with equations that have several variable terms. Like terms have the same variable part: 4x and -x can combine because they are both x-terms, but 2y has to stay on the y team.',
        visual: 'unknown-box',
      },
      {
        id: 'choose-like-term-pair',
        type: 'operation-choice',
        prompt: 'In 4x + 3 - x + 2y, which pair can you combine first?',
        equation: '4x + 3 - x + 2y',
        correctId: 'x-pair',
        choices: [
          {
            id: 'x-pair',
            label: '4x and -x',
            detail: 'Same variable part: x.',
            feedback: 'Yes. Both terms are x-terms, so their coefficients combine to make 3x.',
          },
          {
            id: 'x-and-y',
            label: '4x and 2y',
            detail: 'Different variable parts.',
            feedback: 'Those both have variables, but x and y are different variable parts, so they cannot combine.',
          },
          {
            id: 'number-and-x',
            label: '3 and -x',
            detail: 'One constant and one x-term.',
            feedback: 'The 3 has no variable. Constants combine with constants, not with x-terms.',
          },
        ],
        feedback: {
          correct: 'Right. 4x - x becomes 3x, so the expression rewrites as 3x + 3 + 2y.',
          incorrect: 'Look for terms with exactly the same variable part.',
          reveal: 'Choose "4x and -x" because both are x-terms.',
        },
      },
      {
        id: 'order-combine-like-terms',
        type: 'sequence',
        prompt: 'Tap the useful steps to simplify 4x + 3 - x + 2y.',
        equation: '4x + 3 - x + 2y',
        tiles: [
          {
            id: 'combine-x-terms',
            label: 'Combine 4x and -x',
            detail: '4x - x = 3x.',
          },
          {
            id: 'rewrite-expression',
            label: 'Rewrite as 3x + 3 + 2y',
            detail: 'Keep unlike terms separate.',
          },
          {
            id: 'combine-x-y',
            label: 'Combine 3x and 2y',
            detail: 'This mixes variables.',
          },
          {
            id: 'make-nine-x',
            label: 'Rewrite as 9x',
            detail: 'This treats every term as an x-term.',
          },
        ],
        correctOrder: ['combine-x-terms', 'rewrite-expression'],
        feedback: {
          correct: 'Nice. You combined only the x-terms and left the constant and y-term alone.',
          incorrect: 'Only terms with the same variable part can merge.',
          incomplete: 'First combine the x-terms, then choose the simplified rewrite.',
          reveal: 'Tap "Combine 4x and -x", then "Rewrite as 3x + 3 + 2y".',
          hintsByTile: {
            'combine-x-y': 'x and y are different variables, so those terms stay separate.',
            'make-nine-x': 'Constants and y-terms cannot become x-terms.',
            'rewrite-expression': 'The rewrite is the result, but first show which like terms combine.',
          },
        },
      },
      {
        id: 'choose-equation-variable-terms',
        type: 'operation-choice',
        prompt: 'In 6x - 4 + 2x = 3x + 16, which tiles are variable terms?',
        equation: '6x - 4 + 2x = 3x + 16',
        correctId: 'all-x-terms',
        choices: [
          {
            id: 'all-x-terms',
            label: '6x, 2x, and 3x',
            detail: 'Every term with x, even across the equals sign.',
            feedback: 'Exactly. All three are x-terms, so the goal is to gather them onto one side before solving.',
          },
          {
            id: 'left-x-terms-only',
            label: '6x and 2x only',
            detail: 'Only the x-terms on the left side.',
            feedback: 'Those are x-terms, but 3x on the right is also a variable term. The equals sign separates sides, not term types.',
          },
          {
            id: 'constants-too',
            label: '-4 and 16',
            detail: 'The number-only terms.',
            feedback: 'Those are constants. Variable terms include the letter part, like x.',
          },
        ],
        feedback: {
          correct: 'Right. First spot every x-term, then decide which side should keep the x terms.',
          incorrect: 'Classify by the variable part, not by which side of the equals sign the term is on.',
          reveal: 'Choose "6x, 2x, and 3x" because each term includes x.',
        },
      },
      {
        id: 'choose-variable-both-sides-move',
        type: 'operation-choice',
        prompt: 'For 5x + 7 = 2x + 19, which first move gathers the x-terms on one side?',
        equation: '5x + 7 = 2x + 19',
        correctId: 'subtract-two-x-both',
        choices: [
          {
            id: 'subtract-two-x-both',
            label: '-2x from both sides',
            detail: 'Removes the smaller x-term from the right.',
            feedback: 'Exactly. Subtracting 2x from both sides gives 3x + 7 = 19.',
          },
          {
            id: 'subtract-seven-both',
            label: '-7 from both sides',
            detail: 'Moves constants first.',
            feedback: 'That is useful later, but it leaves x on both sides. Gather x-terms first.',
          },
          {
            id: 'divide-five-both',
            label: '/5 on both sides',
            detail: 'Tries to undo 5x immediately.',
            feedback: 'Dividing now would affect every term, including 7 and 19. First collect x-terms.',
          },
        ],
        feedback: {
          correct: 'Good move. Now the variable only appears on the left: 3x + 7 = 19.',
          incorrect: 'Choose the move that removes the x-term from one side without breaking equality.',
          reveal: 'Choose "-2x from both sides" to turn 5x + 7 = 2x + 19 into 3x + 7 = 19.',
        },
      },
      {
        id: 'order-variable-both-sides-solution',
        type: 'sequence',
        prompt: 'Build the solution path for 5x + 7 = 2x + 19.',
        equation: '5x + 7 = 2x + 19',
        tiles: [
          {
            id: 'subtract-two-x-both',
            label: 'Subtract 2x from both sides',
            detail: '5x + 7 = 2x + 19 becomes 3x + 7 = 19.',
          },
          {
            id: 'subtract-seven-both',
            label: 'Subtract 7 from both sides',
            detail: '3x + 7 = 19 becomes 3x = 12.',
          },
          {
            id: 'divide-three-both',
            label: 'Divide both sides by 3',
            detail: '3x = 12 becomes x = 4.',
          },
          {
            id: 'x-equals-four',
            label: 'x = 4',
            detail: 'The isolated value.',
          },
          {
            id: 'add-two-x-both',
            label: 'Add 2x to both sides',
            detail: 'This makes more x-terms instead of fewer.',
          },
          {
            id: 'x-equals-twelve',
            label: 'x = 12',
            detail: 'This forgets to divide by 3.',
          },
        ],
        correctOrder: ['subtract-two-x-both', 'subtract-seven-both', 'divide-three-both', 'x-equals-four'],
        feedback: {
          correct: 'Correct. Gather x-terms, clear constants, divide, and x = 4.',
          incorrect: 'First get x onto one side, then solve the one-variable equation that remains.',
          incomplete: 'Use four tiles: gather x-terms, clear +7, divide by 3, then choose x.',
          reveal: 'Tap "-2x from both sides", "-7 from both sides", "Divide both sides by 3", then "x = 4".',
          hintsByTile: {
            'add-two-x-both': 'Adding 2x creates more variable terms. Subtract the smaller x-term instead.',
            'x-equals-twelve': '12 is the value of 3x, not one x.',
            'x-equals-four': 'x = 4 is the result, but it comes after the balancing moves.',
          },
        },
      },
      {
        id: 'spot-variable-move-mistake',
        type: 'operation-choice',
        prompt: 'A student changes 5x + 7 = 2x + 19 into 7x + 7 = 19. What went wrong?',
        equation: '5x + 7 = 2x + 19 -> 7x + 7 = 19',
        correctId: 'added-instead-of-subtracted',
        choices: [
          {
            id: 'added-instead-of-subtracted',
            label: 'They added 2x instead of subtracting 2x',
            detail: 'The right-side x-term should be canceled.',
            feedback: 'Yes. To remove +2x from the right, subtract 2x from both sides. That makes 3x + 7 = 19.',
          },
          {
            id: 'cleared-constant-first',
            label: 'They should clear +7 first',
            detail: 'A different valid route, but not this mistake.',
            feedback: 'Clearing +7 can work, but the shown error is the sign of the x move: +2x was added instead of subtracted.',
          },
          {
            id: 'variables-cannot-move',
            label: 'Variable terms cannot cross the equals sign',
            detail: 'Treats x-terms differently from numbers.',
            feedback: 'Variable terms can move if you apply the inverse to both sides. The issue is choosing the wrong inverse move.',
          },
        ],
        feedback: {
          correct: 'Correct. Moving +2x off the right side means subtracting 2x from both sides, not adding it.',
          incorrect: 'Focus on the first variable move: did it cancel the +2x term on the right?',
          reveal: 'The mistake is adding 2x instead of subtracting it. Correct path: 5x + 7 = 2x + 19 -> 3x + 7 = 19.',
        },
      },
      {
        id: 'input-variable-both-sides',
        type: 'input',
        prompt: 'Solve 4x - 5 = x + 10. What is x?',
        accept: ['5', 'x=5', 'x = 5', '10/2'],
        feedback: {
          correct: 'Yes. Subtract x from both sides to get 3x - 5 = 10, then x = 5.',
          incorrect: 'Move the x on the right to the left first, then clear the -5.',
          reveal: '4x - 5 = x + 10 -> 3x - 5 = 10 -> 3x = 15 -> x = 5.',
          hintsByAnswer: {
            '15': '15 is the value of 3x after clearing -5. Divide by 3 to get one x.',
            '3': '3 is the coefficient after subtracting x, not the value of x.',
            '1': 'Check by substitution: 4(1) - 5 is not equal to 1 + 10.',
          },
        },
      },
      {
        id: 'complete-like-terms-summary',
        type: 'concept',
        title: 'You gathered before solving',
        body: 'You classified variable and constant terms, combined like terms, caught a wrong sign move, and solved equations by moving variables to one side before using inverse operations.',
        visual: 'balanced-scale',
      },
    ],
  },
  'coordinate-plane': {
    id: 'coordinate-plane',
    title: 'Coordinate Plane',
    subtitle: 'Plot and read points',
    skillIds: ['coordinate-plane'],
    prerequisites: ['like-terms-variables-both-sides'],
    nextLessonId: 'graphing-lines',
    steps: [
      {
        id: 'concept-coordinate-plane',
        type: 'concept',
        title: 'A point gives two directions',
        body: 'An ordered pair (x, y) starts at the origin. The x-value moves left or right, and the y-value moves up or down.',
      },
      {
        id: 'order-plot-point',
        type: 'sequence',
        prompt: 'Plot (3, -2) from the origin by tapping the moves in order.',
        equation: '(3, -2)',
        tiles: [
          {
            id: 'move-right-three',
            label: 'Move 3 right',
            detail: 'Positive x moves right.',
          },
          {
            id: 'move-down-two',
            label: 'Move 2 down',
            detail: 'Negative y moves down.',
          },
          {
            id: 'arrive-three-negative-two',
            label: 'Land at (3, -2)',
            detail: 'The final point.',
          },
          {
            id: 'move-left-three',
            label: 'Move 3 left',
            detail: 'This would be x = -3.',
          },
          {
            id: 'move-up-two',
            label: 'Move 2 up',
            detail: 'This would be y = 2.',
          },
        ],
        correctOrder: ['move-right-three', 'move-down-two', 'arrive-three-negative-two'],
        feedback: {
          correct: 'Correct. Positive x goes right, negative y goes down, so the point is (3, -2).',
          incorrect: 'Read the ordered pair as x first, then y.',
          incomplete: 'Use three tiles: horizontal move, vertical move, then the landing point.',
          reveal: 'Tap "Move 3 right", "Move 2 down", then "Land at (3, -2)".',
          hintsByTile: {
            'move-left-three': 'Left is for negative x-values. Here x is positive 3.',
            'move-up-two': 'Up is for positive y-values. Here y is -2.',
            'arrive-three-negative-two': 'The landing point comes after the two moves.',
          },
        },
      },
      {
        id: 'choose-coordinate-point',
        type: 'operation-choice',
        prompt: 'A hidden point has x = -4 and y = 2. Which ordered pair names it?',
        equation: 'x = -4, y = 2',
        correctId: 'negative-four-two',
        choices: [
          {
            id: 'negative-four-two',
            label: '(-4, 2)',
            detail: 'x first, y second.',
            feedback: 'Yes. Ordered pairs always put x first, then y.',
          },
          {
            id: 'two-negative-four',
            label: '(2, -4)',
            detail: 'Swaps the two coordinates.',
            feedback: 'This reverses the order. x is the first coordinate, so -4 must come first.',
          },
          {
            id: 'four-two',
            label: '(4, 2)',
            detail: 'Changes the sign of x.',
            feedback: 'The y-value is right, but x = -4 means four units left of the origin.',
          },
        ],
        feedback: {
          correct: 'Correct. (-4, 2) is left 4 and up 2.',
          incorrect: 'Keep the order as (x, y), and keep each sign.',
          reveal: 'Choose "(-4, 2)" because x = -4 is first and y = 2 is second.',
        },
      },
      {
        id: 'input-robot-coordinate',
        type: 'input',
        prompt: 'A robot starts at (0, 0), moves 5 left, then 1 up. Type its coordinate as (x, y).',
        accept: ['(-5,1)', '(-5, 1)', '-5,1', 'x=-5,y=1'],
        feedback: {
          correct: 'Exactly. Left 5 makes x = -5, and up 1 makes y = 1.',
          incorrect: 'Horizontal movement decides x. Vertical movement decides y.',
          reveal: 'The coordinate is (-5, 1): five left for x = -5, one up for y = 1.',
          hintsByAnswer: {
            '(5,1)': 'Right 5 would be positive. Moving left makes the x-coordinate negative.',
            '5,1': 'Right 5 would be positive. Moving left makes the x-coordinate negative.',
            '(1,-5)': 'The first coordinate is horizontal movement. The second coordinate is vertical movement.',
            '-5': 'That gives only x. Include both coordinates as (x, y).',
          },
        },
      },
      {
        id: 'concept-quadrants',
        type: 'concept',
        title: 'The axes make four quadrants',
        body: 'The x-axis and y-axis split the plane into four regions called quadrants. Start in the upper right and move counterclockwise: Quadrant I is (+,+), Quadrant II is (-,+), Quadrant III is (-,-), and Quadrant IV is (+,-). Points on an axis are on the border, so they are not inside any quadrant.',
      },
      {
        id: 'choose-quadrant',
        type: 'operation-choice',
        prompt: 'Use the quadrant sign map: which quadrant contains points where x is positive and y is negative?',
        equation: 'x > 0, y < 0',
        correctId: 'quadrant-four',
        choices: [
          {
            id: 'quadrant-one',
            label: 'Quadrant I',
            detail: 'Upper right: (+,+).',
            feedback: 'Quadrant I is upper right, so its signs are (+,+). This point needs y to be negative.',
          },
          {
            id: 'quadrant-three',
            label: 'Quadrant III',
            detail: 'Lower left: (-,-).',
            feedback: 'Quadrant III is lower left, so its signs are (-,-). This point needs x to be positive.',
          },
          {
            id: 'quadrant-four',
            label: 'Quadrant IV',
            detail: 'Lower right: (+,-).',
            feedback: 'Yes. Positive x moves right and negative y moves down, so the sign pattern (+,-) is Quadrant IV.',
          },
        ],
        feedback: {
          correct: 'Correct. Quadrant IV is the lower-right region with sign pattern (+,-).',
          incorrect: 'Translate the signs into directions: positive x is right, negative y is down. That is the lower-right region.',
          reveal: 'Choose "Quadrant IV" because x > 0 and y < 0 gives the sign pattern (+,-), the lower-right quadrant.',
        },
      },
      {
        id: 'complete-coordinate-plane-summary',
        type: 'concept',
        title: 'You can read the grid',
        body: 'You used ordered pairs to move from the origin, kept x before y, and matched coordinate signs to quadrants.',
      },
    ],
  },
  'graphing-lines': {
    id: 'graphing-lines',
    title: 'Graphing Lines',
    subtitle: 'Connect equations to lines',
    skillIds: ['graphing-lines'],
    prerequisites: ['coordinate-plane'],
    steps: [
      {
        id: 'concept-slope-intercept',
        type: 'concept',
        title: 'Slope and intercept shape a line',
        body: 'In y = mx + b, b is where the line crosses the y-axis. The slope m tells the line how to move from one point to the next.',
      },
      {
        id: 'choose-slope-intercept-equation',
        type: 'operation-choice',
        prompt: 'A line crosses the y-axis at 2 and rises 3 for every 1 step right. Which equation matches?',
        equation: 'intercept 2, slope 3',
        correctId: 'y-equals-three-x-plus-two',
        choices: [
          {
            id: 'y-equals-three-x-plus-two',
            label: 'y = 3x + 2',
            detail: 'Slope 3, intercept 2.',
            feedback: 'Yes. The slope is the coefficient of x, and the y-intercept is the +2.',
          },
          {
            id: 'y-equals-two-x-plus-three',
            label: 'y = 2x + 3',
            detail: 'Swaps slope and intercept.',
            feedback: 'This swaps the two clues. The intercept is 2, so the constant should be +2.',
          },
          {
            id: 'y-equals-negative-three-x-plus-two',
            label: 'y = -3x + 2',
            detail: 'Falls instead of rises.',
            feedback: 'A negative slope would go down as you move right. This line rises.',
          },
        ],
        feedback: {
          correct: 'Correct. y = 3x + 2 starts at 2 and climbs 3 for each step right.',
          incorrect: 'Match b to the y-intercept and m to the rise-over-run slope.',
          reveal: 'Choose "y = 3x + 2" because m = 3 and b = 2.',
        },
      },
      {
        id: 'order-plot-line',
        type: 'sequence',
        prompt: 'Use y = 2x - 1 to create two points for the line.',
        equation: 'y = 2x - 1',
        tiles: [
          {
            id: 'start-at-intercept',
            label: 'Start at (0, -1)',
            detail: 'The y-intercept is -1.',
          },
          {
            id: 'move-right-one-up-two',
            label: 'Move right 1, up 2',
            detail: 'Slope 2 means rise 2, run 1.',
          },
          {
            id: 'mark-one-one',
            label: 'Mark (1, 1)',
            detail: 'The next point on the line.',
          },
          {
            id: 'start-at-zero-two',
            label: 'Start at (0, 2)',
            detail: 'This treats slope as the intercept.',
          },
          {
            id: 'move-right-two-up-one',
            label: 'Move right 2, up 1',
            detail: 'This flips rise and run.',
          },
        ],
        correctOrder: ['start-at-intercept', 'move-right-one-up-two', 'mark-one-one'],
        feedback: {
          correct: 'Nice. The line starts at (0, -1), then slope 2 carries it to (1, 1).',
          incorrect: 'Start with the y-intercept, then use slope as rise over run.',
          incomplete: 'Use three tiles: start at b, move by the slope, then mark the new point.',
          reveal: 'Tap "Start at (0, -1)", "Move right 1, up 2", then "Mark (1, 1)".',
          hintsByTile: {
            'start-at-zero-two': 'The 2 is the slope. The y-intercept is the constant, -1.',
            'move-right-two-up-one': 'Slope 2 is 2/1, so rise 2 and run 1.',
            'mark-one-one': 'The point (1, 1) comes after applying the slope from the intercept.',
          },
        },
      },
      {
        id: 'input-line-y-value',
        type: 'input',
        prompt: 'For y = -x + 4, what is y when x = 3?',
        accept: ['1', 'y=1', 'y = 1', '2/2'],
        feedback: {
          correct: 'Exactly. y = -3 + 4 = 1.',
          incorrect: 'Substitute x = 3, then remember the negative sign in -x.',
          reveal: 'y = -x + 4 becomes y = -3 + 4, so y = 1.',
          hintsByAnswer: {
            '7': 'That uses +3 + 4. The equation has -x, so use -3.',
            '-1': 'Check the order: -3 + 4 is positive 1.',
            '4': '4 is the intercept before substituting x = 3.',
          },
        },
      },
      {
        id: 'choose-line-table',
        type: 'operation-choice',
        prompt: 'Which table belongs to y = 2x + 1?',
        equation: 'y = 2x + 1',
        correctId: 'table-two-x-plus-one',
        choices: [
          {
            id: 'table-two-x-plus-one',
            label: 'x: 0, 1, 2 -> y: 1, 3, 5',
            detail: 'Starts at 1 and adds 2.',
            feedback: 'Correct. Each y-value is 2x + 1.',
          },
          {
            id: 'table-one-x-plus-two',
            label: 'x: 0, 1, 2 -> y: 2, 3, 4',
            detail: 'Starts at 2 and adds 1.',
            feedback: 'This table matches y = x + 2. Its slope and intercept are swapped.',
          },
          {
            id: 'table-two-x-minus-one',
            label: 'x: 0, 1, 2 -> y: -1, 1, 3',
            detail: 'Starts at -1 and adds 2.',
            feedback: 'The slope is right, but the intercept should be +1, not -1.',
          },
        ],
        feedback: {
          correct: 'Yes. The table starts at y = 1 when x = 0 and rises by 2 each step.',
          incorrect: 'Check x = 0 for the intercept, then compare how y changes as x increases by 1.',
          reveal: 'Choose "x: 0, 1, 2 -> y: 1, 3, 5" because 2(0)+1=1, 2(1)+1=3, and 2(2)+1=5.',
        },
      },
      {
        id: 'complete-graphing-lines-summary',
        type: 'concept',
        title: 'You connected equations to lines',
        body: 'You matched slope-intercept clues, generated points from an equation, and checked a table against a line rule.',
      },
    ],
  },
}

export const algebraCourse: Course = {
  id: 'algebra-foundations',
  title: 'Algebra Foundations',
  subject: 'algebra',
  description: 'A hands-on path from the meaning of equals to solving and graphing lines.',
  lessonOrder: [
    'balancing-equations',
    'one-step-equations',
    'two-step-equations',
    'like-terms-variables-both-sides',
    'coordinate-plane',
    'graphing-lines',
  ],
  lessons: [
    {
      id: 'balancing-equations',
      title: 'Balancing Equations',
      description: 'Use a balance scale to feel what equality means.',
      status: 'available',
    },
    {
      id: 'one-step-equations',
      title: 'One-Step Equations',
      description: 'Practice inverse operations with addition, subtraction, multiplication, and division.',
      status: 'locked',
    },
    {
      id: 'two-step-equations',
      title: 'Two-Step Equations',
      description: 'Undo operations in the right order.',
      status: 'locked',
    },
    {
      id: 'like-terms-variables-both-sides',
      title: 'Like Terms & Variables on Both Sides',
      description: 'Classify x-terms, combine matching terms, and move variables while keeping equality true.',
      status: 'locked',
    },
    {
      id: 'coordinate-plane',
      title: 'Coordinate Plane',
      description: 'Read and plot ordered pairs on x- and y-axes.',
      status: 'locked',
    },
    {
      id: 'graphing-lines',
      title: 'Graphing Lines',
      description: 'Connect slope and intercept to the shape of a line.',
      status: 'locked',
    },
  ],
}
