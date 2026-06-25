import type { Lesson } from '../types'

export const oneStepEquationsLesson: Lesson = {
  id: 'one-step-equations',
  title: 'One-Step Equations',
  subtitle: 'Undo one operation',
  skillIds: ['one-step-equations'],
  prerequisites: ['balancing-equations'],
  steps: [
    {
      id: 'concept-undoing',
      type: 'concept',
      title: 'Solving means undoing',
      body: 'When an operation changes x, solve by undoing that operation on both sides. The goal is to leave x alone while the equation stays true.',
      visual: 'unknown-box',
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
        },
        {
          id: 'x-equals-four',
          label: 'x = 4',
        },
        {
          id: 'add-six-both',
          label: 'Add 6 to both sides',
        },
        {
          id: 'x-equals-ten',
          label: 'x = 10',
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
      id: 'model-division-jars',
      type: 'manipulative',
      prompt:
        'In x / 5 = 3, a bag of x marbles was split evenly into 5 jars with 3 left in each. Set the number of jars and the marbles per jar to match the equation, and the live total reveals x.',
      // A large pool (not a pre-counted 15) so the total is discovered, never given away.
      total: 35,
      object: { label: 'marble', emoji: '\u{1F535}' },
      goal: { type: 'build-product', groups: 5, perGroup: 3, maxGroups: 7, maxPerGroup: 5 },
      feedback: {
        correct: 'Exactly. 5 jars of 3 rebuild the bag, so x = 5 x 3 = 15. Multiplying by 5 undoes dividing by 5.',
        incorrect:
          'Match x / 5 = 3: the divisor 5 is the number of jars and the 3 is how many sit in each. The total you build is x.',
        reveal: 'Set 5 jars with 3 marbles in each. The live total reads 5 x 3 = 15, so x = 15.',
        hints: [
          {
            when: 'empty',
            text: 'Add some jars and marbles. The live total shows how many marbles you have built so far.',
          },
          {
            when: 'groups',
            text: 'Dividing by 5 means 5 equal jars. Set the number of groups to the divisor in x / 5.',
          },
          {
            when: 'per-group',
            text: 'Each jar ended with 3 marbles (the right side of x / 5 = 3). Set the per-group amount to 3.',
          },
          {
            when: 'default',
            text: 'Make 5 jars with 3 marbles each, then read the live total: that product is x.',
          },
        ],
      },
    },
    {
      id: 'input-three-x',
      type: 'input',
      prompt: 'Solve 3x = 12. What is x?',
      accept: ['4', 'x=4', '12/3'],
      feedback: {
        correct: 'Right. x = 4 because 12 divided by 3 is 4.',
        incorrect: '3x means 3 times x, so divide both sides by 3 to undo the multiplication.',
        reveal: 'x = 4 because 3x / 3 = x and 12 / 3 = 4.',
        hintsByAnswer: {
          '9': '3x means 3 times x, not x + 3. Divide both sides by 3 instead of subtracting 3.',
          '36': 'Multiplying by 3 repeats the operation. Undo "3 times x" by dividing both sides by 3.',
          '12': '12 is the whole right side. Split it into 3 equal groups to find one x: 12 / 3 = 4.',
        },
      },
    },
    {
      id: 'order-division-undo',
      type: 'sequence',
      prompt: 'Put the undoing moves in order for x / 6 = 2.',
      equation: 'x / 6 = 2',
      tiles: [
        {
          id: 'multiply-six-both',
          label: 'Multiply both sides by 6',
        },
        {
          id: 'x-equals-twelve',
          label: 'x = 12',
        },
        {
          id: 'divide-six-both',
          label: 'Divide both sides by 6',
        },
        {
          id: 'x-equals-two',
          label: 'x = 2',
        },
      ],
      correctOrder: ['multiply-six-both', 'x-equals-twelve'],
      feedback: {
        correct: 'Correct. Multiplying both sides by 6 gives x = 12.',
        incorrect: 'Undo division by multiplying, then write the value of x.',
        incomplete: 'Choose the inverse move first, then the resulting value.',
        reveal: 'Tap "Multiply both sides by 6", then "x = 12".',
        hintsByTile: {
          'divide-six-both': 'Dividing by 6 again repeats the operation. Use multiplication to undo division.',
          'x-equals-two': '2 is what x becomes after division by 6, not the original x.',
          'x-equals-twelve': 'x = 12 is the result, but first show the move that gets there.',
        },
      },
    },
    {
      id: 'input-x-divided-by-four',
      type: 'input',
      prompt: 'Solve x / 4 = 2. What is x?',
      equation: 'x / 4 = 2',
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
      id: 'mastery-add-negative-result',
      type: 'input',
      prompt: 'Mastery check: solve x + 19 = 4. What is x?',
      accept: ['-15', 'x=-15', 'x = -15'],
      feedback: {
        correct: 'Yes. Subtract 19 from both sides: x = 4 - 19 = -15.',
        incorrect: 'Undo the + 19 by subtracting 19 from both sides. Here the result drops below zero.',
        reveal: 'x = -15 because 4 - 19 = -15.',
        hintsByAnswer: {
          '15': 'Right size, wrong sign. 4 - 19 is negative, so x = -15.',
          '23': 'That adds 19 instead of undoing it. Subtract 19 from both sides.',
          '4': 'That leaves the + 19 in place. Subtract 19 from both sides to isolate x.',
        },
      },
    },
    {
      id: 'mastery-divide-by-negative',
      type: 'input',
      prompt: 'Mastery check: solve x / -4 = 8. What is x?',
      accept: ['-32', 'x=-32', 'x = -32'],
      feedback: {
        correct: 'Exactly. Multiply both sides by -4: x = 8 x (-4) = -32.',
        incorrect: 'x is divided by -4, so multiply both sides by -4 and keep track of the sign.',
        reveal: 'x = -32 because 8 x (-4) = -32.',
        hintsByAnswer: {
          '32': 'Almost. Multiplying by a negative flips the sign, so x = -32.',
          '-2': 'That divides 8 by -4. Undo the division by multiplying both sides by -4.',
          '2': 'That divides instead of multiplying and drops the sign. Multiply both sides by -4.',
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
}
