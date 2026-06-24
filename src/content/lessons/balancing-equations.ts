import type { Lesson } from '../types'

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
      prompt:
        'Make the scale level again. Drag the loose 2 from the tray onto the pan that balances it — if it lands on the wrong side, just drag it again.',
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
            text: 'Drag the 2 onto the pan that makes both totals equal. You can drag it again if it lands on the wrong side.',
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
      id: 'balance-subtract-four-both',
      type: 'balance',
      prompt: 'Isolate x in x + 4 = 9 by removing 4 from both sides.',
      state: {
        left: [
          { id: 'x-plus-four-x', label: 'x', value: 5, kind: 'unknown', locked: true },
          { id: 'left-4', label: '4', value: 4, kind: 'weight', locked: true },
        ],
        right: [{ id: 'right-9', label: '9', value: 9, kind: 'weight', locked: true }],
        unknownValue: 5,
      },
      operations: [
        { id: 'subtract-four-both', label: '-4 from both sides', amount: -4, sides: 'both' },
        { id: 'subtract-four-left', label: '-4 from left only', amount: -4, sides: 'left' },
      ],
      goal: { type: 'isolate', unknownId: 'x-plus-four-x', value: 5 },
      feedback: {
        correct: 'Yes. x = 5 because removing 4 from both sides turns x + 4 = 9 into x = 5.',
        explanation:
          'The +4 sits next to x, so subtract 4 to undo it. Remove the same 4 from the 9 side so the scale stays balanced.',
        hints: [
          {
            when: 'one-side-only',
            text: 'You removed 4 from only one side, so the scale tipped. Whatever you do to one side, do to the other.',
          },
          {
            when: 'not-isolated',
            text: 'The goal is to leave x by itself while keeping both pans equal.',
          },
          {
            when: 'default',
            text: 'Choose the operation that removes 4 from both sides.',
          },
        ],
        reveal: 'Tap "-4 from both sides" to turn x + 4 = 9 into x = 5.',
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
      id: 'mastery-solve-negative',
      type: 'input',
      prompt: 'Mastery check: keep both pans equal. If x + 9 = 4, what is x?',
      accept: ['-5', 'x=-5', 'x = -5'],
      feedback: {
        correct: 'Yes. Subtract 9 from both sides: x = 4 - 9 = -5. The balance still holds when x is negative.',
        incorrect: 'Undo the +9 by subtracting 9 from both sides, and mind the sign once 4 - 9 drops below zero.',
        reveal: 'x = -5, because 4 - 9 = -5, and -5 + 9 = 4 checks out on both pans.',
        hintsByAnswer: {
          '13': 'That adds 9 instead of undoing it. Subtract 9 from both sides to isolate x.',
          '5': 'Right size, wrong sign. 4 - 9 lands below zero, so x is negative.',
          '-13': 'Close on the sign, but 4 - 9 is -5, not -13. Subtract 9 from 4.',
        },
      },
    },
    {
      id: 'mastery-balance-story',
      type: 'sequence',
      prompt: 'Mastery check: build the full balance story for x - 6 = 9, from the first move to the final value.',
      equation: 'x - 6 = 9',
      tiles: [
        { id: 'add-six-both', label: 'Add 6 to both sides', detail: 'Undo the -6 next to x without tipping the scale.' },
        { id: 'x-equals-nine-plus-six', label: 'x = 9 + 6', detail: 'Show the right side before simplifying.' },
        { id: 'x-equals-fifteen', label: 'x = 15', detail: 'Simplify 9 + 6.' },
        { id: 'add-six-left', label: 'Add 6 to the left only', detail: 'Tempting, but it tips the scale.' },
        { id: 'x-equals-nine', label: 'x = 9', detail: 'This forgets to undo the -6.' },
      ],
      correctOrder: ['add-six-both', 'x-equals-nine-plus-six', 'x-equals-fifteen'],
      feedback: {
        correct: 'Exactly. Add 6 to both sides, so x = 9 + 6 = 15, and the scale stays balanced the whole way.',
        incorrect: 'Keep the scale balanced first, then show the arithmetic that isolates x.',
        incomplete: 'Use all three steps: the balancing move, the rewrite, then the final value.',
        reveal: 'Order: "Add 6 to both sides", then "x = 9 + 6", then "x = 15".',
        hintsByTile: {
          'add-six-left': 'Adding 6 to only the left side breaks equality. Do it to both sides.',
          'x-equals-nine': 'x = 9 skips undoing the -6. After adding 6, the right side is 9 + 6.',
          'x-equals-fifteen': 'x = 15 is the final value, but first show the move and the rewrite that reach it.',
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
