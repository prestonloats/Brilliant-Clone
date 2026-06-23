export type StepType = 'concept' | 'mcq' | 'input' | 'balance' | 'operation-choice' | 'sequence'

export type SkillId = 'equality' | 'inverse-operations' | 'one-step-equations' | 'two-step-equations'

export type LessonId = 'balancing-equations' | 'one-step-equations' | 'two-step-equations'

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

export type LessonProgress = {
  userId: string
  lessonId: LessonId
  status: 'notStarted' | 'inProgress' | 'completed'
  currentStepIndex: number
  stepResults: Record<string, StepResult>
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
      prompt: 'The scale starts level. In the prediction card, one pan now has 3 + 2 while the other still has 3. What must happen?',
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
      prompt: 'For x + 4 = 9, which move keeps the scale balanced and starts isolating x?',
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
    steps: [
      {
        id: 'concept-reverse-order',
        type: 'concept',
        title: 'Undo the outside operation first',
        body: 'In 2x + 3 = 11, x is first multiplied by 2, then 3 is added. To solve, work backward: undo the +3 before undoing the times 2.',
        visual: 'unknown-box',
      },
      {
        id: 'choose-first-two-step-move',
        type: 'operation-choice',
        prompt: 'For 2x + 3 = 11, which operation should you undo first?',
        equation: '2x + 3 = 11',
        correctId: 'subtract-three-both',
        choices: [
          {
            id: 'subtract-three-both',
            label: '-3 from both sides',
            detail: 'Remove the outside +3 first.',
            feedback: 'Yes. Undo the +3 first so the equation becomes 2x = 8.',
          },
          {
            id: 'divide-two-both',
            label: '/2 on both sides',
            detail: 'Tries to undo multiplication first.',
            feedback: 'That is the second undoing move. The +3 is outside the 2x, so clear it first.',
          },
          {
            id: 'subtract-three-left',
            label: '-3 from left only',
            detail: 'Only changes one side.',
            feedback: 'That removes the +3, but changing only one side breaks equality.',
          },
        ],
        feedback: {
          correct: 'Correct. Subtract 3 from both sides first to get 2x = 8.',
          incorrect: 'Work backward from the outside operation, and keep both sides balanced.',
          reveal: 'Choose "-3 from both sides" first. Then divide both sides by 2.',
        },
      },
      {
        id: 'order-two-step-solution',
        type: 'sequence',
        prompt: 'Build the solution path for 2x + 3 = 11.',
        equation: '2x + 3 = 11',
        tiles: [
          {
            id: 'subtract-three-both',
            label: 'Subtract 3 from both sides',
            detail: '2x + 3 = 11 becomes 2x = 8.',
          },
          {
            id: 'divide-two-both',
            label: 'Divide both sides by 2',
            detail: '2x = 8 becomes x = 4.',
          },
          {
            id: 'x-equals-four',
            label: 'x = 4',
            detail: 'The isolated value.',
          },
          {
            id: 'divide-two-first',
            label: 'Divide by 2 first',
            detail: 'This ignores the +3.',
          },
          {
            id: 'x-equals-eleven',
            label: 'x = 11',
            detail: 'This uses the whole right side.',
          },
        ],
        correctOrder: ['subtract-three-both', 'divide-two-both', 'x-equals-four'],
        feedback: {
          correct: 'Nice. The reverse order is subtract 3, divide by 2, so x = 4.',
          incorrect: 'Undo the addition before the multiplication, then write the isolated value.',
          incomplete: 'Use three tiles: first undo +3, then undo times 2, then choose x.',
          reveal: 'Tap "Subtract 3 from both sides", "Divide both sides by 2", then "x = 4".',
          hintsByTile: {
            'divide-two-first': 'Dividing first is tempting, but the +3 is outside the multiplication.',
            'x-equals-eleven': '11 is the whole right side before either operation has been undone.',
            'x-equals-four': 'x = 4 is the result, but it belongs after the two balancing moves.',
          },
        },
      },
      {
        id: 'spot-two-step-mistake',
        type: 'operation-choice',
        prompt: 'A student tries to solve 2x + 3 = 11 and writes 2x + 3 = 11 -> x + 3 = 5.5. What went wrong?',
        equation: '2x + 3 = 11 -> x + 3 = 5.5',
        correctId: 'divided-too-early',
        choices: [
          {
            id: 'divided-too-early',
            label: 'They divided by 2 too early',
            detail: 'The +3 was still outside the multiplication.',
            feedback: 'Yes. The outside +3 must be removed before dividing by 2.',
          },
          {
            id: 'one-side-only',
            label: 'They only changed one side',
            detail: 'A balance mistake would change just left or just right.',
            feedback: 'They changed both sides by division. The issue is the order of the undoing moves.',
          },
          {
            id: 'subtracted-wrong',
            label: 'They subtracted 3 incorrectly',
            detail: 'This would happen after clearing the +3.',
            feedback: 'They have not subtracted 3 yet. First remove the +3, then divide 8 by 2.',
          },
        ],
        feedback: {
          correct: 'Right. Undo +3 first to make 2x = 8, then divide by 2 to get x = 4.',
          incorrect: 'Find the step that breaks the reverse order: undo addition before division.',
          reveal: 'The mistake is dividing by 2 before removing +3. Correct path: 2x + 3 = 11 -> 2x = 8 -> x = 4.',
        },
      },
      {
        id: 'complete-two-step-summary',
        type: 'concept',
        title: 'You solved in reverse order',
        body: 'Two-step equations are one-step equations chained together: undo the outside operation, then undo what is attached to x. Later lessons will add like terms and variables on both sides.',
        visual: 'balanced-scale',
      },
    ],
  },
}

export const algebraCourse: Course = {
  id: 'algebra-foundations',
  title: 'Algebra Foundations',
  subject: 'algebra',
  description: 'A hands-on path from the meaning of equals to solving and graphing lines.',
  lessonOrder: ['balancing-equations', 'one-step-equations', 'two-step-equations'],
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
  ],
}
