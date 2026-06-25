import type { Lesson } from '../types'

export const twoStepEquationsLesson: Lesson = {
  id: 'two-step-equations',
  title: 'Two-Step Equations',
  subtitle: 'Undo in the right order',
  skillIds: ['two-step-equations'],
  prerequisites: ['one-step-equations'],
  steps: [
    {
      id: 'concept-reverse-order',
      type: 'concept',
      title: 'Peel off the outside operation',
      body: 'In 4x - 5 = 19, x is first multiplied by 4, then 5 is subtracted. Solve by working backward: clear the -5, then split the 4x into four equal parts.',
      visual: 'unknown-box',
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
        },
        {
          id: 'divide-four-both',
          label: 'Divide both sides by 4',
        },
        {
          id: 'x-equals-six',
          label: 'x = 6',
        },
        {
          id: 'subtract-five-both',
          label: 'Subtract 5 from both sides',
        },
        {
          id: 'x-equals-nineteen',
          label: 'x = 19',
        },
      ],
      correctOrder: ['add-five-both', 'divide-four-both', 'x-equals-six'],
      feedback: {
        correct: 'Nice. The reverse order is add 5, divide by 4, so x = 6.',
        incorrect: 'First undo the outside -5, then undo the multiplication, then write x.',
        incomplete: 'Use three tiles: clear the -5, split the 4x, then choose the value of x.',
        reveal: 'Tap "Add 5 to both sides", "Divide both sides by 4", then "x = 6".',
        hintsByTile: {
          'subtract-five-both': 'Subtracting 5 repeats the -5. Add 5 to undo it.',
          'x-equals-nineteen': '19 is the whole right side before either operation has been undone.',
          'x-equals-six': 'x = 6 is the result, but it belongs after both inverse moves.',
        },
      },
    },
    {
      id: 'manipulative-split-reactor-cores',
      type: 'manipulative',
      prompt:
        'Build it: crack the reactor code 4x + 2 = 18 by hand. You already pulled out the 2 spare cores, leaving 4x = 16. Now load the 16 energy cores into the 4 reactors so every reactor holds the same number \u2014 that equal count is x.',
      total: 16,
      object: { label: 'core', emoji: '\u{1F50B}' },
      goal: { type: 'equal-groups', groups: 4, perGroup: 4 },
      feedback: {
        correct: 'Reactor online. Undoing +2 left 4x = 16, and splitting it into 4 equal reactors makes x = 4.',
        incorrect: 'Two-step in reverse: the +2 is already cleared, so now every reactor needs the same count and all 16 cores must be used.',
        reveal: 'Put 4 cores in each reactor: 4 + 4 + 4 + 4 = 16, so x = 4.',
        hints: [
          { when: 'empty', text: 'Start dragging cores out of the tray until all 16 are loaded into the reactors.' },
          { when: 'too-many', text: 'One reactor is overloaded. 16 cores across 4 reactors is 4 each, because 16 / 4 = 4.' },
          { when: 'uneven', text: 'The reactors must match. Even them out so each one holds the same count.' },
          { when: 'too-few', text: 'Keep loading. Every reactor needs 4 cores and all 16 cores must be placed.' },
          { when: 'default', text: 'Share all 16 cores equally across the 4 reactors to reveal x.' },
        ],
      },
    },
    {
      id: 'input-puzzle-gate',
      type: 'input',
      prompt: 'A puzzle gate shows 2x + 4 = 16. What is x?',
      accept: ['6', 'x=6', 'x = 6', '12/2'],
      feedback: {
        correct: 'Exactly. Subtract 4 to get 2x = 12, then divide by 2 to get x = 6.',
        incorrect: 'Clear the +4 first, then divide the remaining value by 2.',
        reveal: '2x + 4 = 16 -> 2x = 12 -> x = 6.',
        hintsByAnswer: {
          '16': '16 is the value of the whole expression 2x + 4, not x.',
          '12': '12 is the value of 2x after clearing +4. Divide by 2 to find one x.',
          '10': 'That looks like adding 4 before dividing. The +4 should be subtracted away.',
          '8': 'Dividing 16 by 2 skips the +4. Clear the +4 before you split into groups of 2.',
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
        },
        {
          id: 'divide-two-both',
          label: 'Divide both sides by 2',
        },
        {
          id: 'x-equals-six',
          label: 'x = 6',
        },
        {
          id: 'x-equals-seventeen',
          label: 'x = 17',
        },
      ],
      correctOrder: ['subtract-five-both', 'divide-two-both', 'x-equals-six'],
      feedback: {
        correct: 'Correct. Clear the +5, divide by 2, and x = 6.',
        incorrect: 'The +5 is outside the 2x, so clear it before dividing.',
        incomplete: 'Choose the move that clears +5, the move that splits 2x, and then the value of x.',
        reveal: 'Tap "Subtract 5 from both sides", "Divide both sides by 2", then "x = 6".',
        hintsByTile: {
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
      id: 'mastery-input-word-problem',
      type: 'input',
      prompt:
        'Mastery check: A climbing gym charges an $8 day pass plus $4 for every route you climb. Sam paid $32 in all. Solve 4r + 8 = 32 to find how many routes r Sam climbed.',
      accept: ['6', 'r=6', 'r = 6', '24/4'],
      feedback: {
        correct: 'Yes. Subtract the $8 pass to get 4r = 24, then divide by 4: r = 6 routes.',
        incorrect: 'Two steps in reverse order: clear the $8 pass first, then divide what is left by 4.',
        reveal: '4r + 8 = 32 -> 4r = 24 -> r = 6.',
        hintsByAnswer: {
          '32': '32 is the whole bill, not the number of routes. Peel off the $8 pass first.',
          '24': '24 is the cost of the routes after removing the $8 pass. Divide by 4 to find one route.',
          '10': 'That adds the 8 instead of subtracting it. Undo +8 with -8 before dividing.',
          '8': 'Dividing 32 by 4 skips the +8. Clear the $8 pass before splitting into 4 equal routes.',
        },
      },
    },
    {
      id: 'mastery-order-division-two-step',
      type: 'sequence',
      prompt: 'Mastery check: build the full solution path for the division equation x/3 - 4 = 2.',
      equation: 'x/3 - 4 = 2',
      tiles: [
        {
          id: 'add-four-both',
          label: 'Add 4 to both sides',
        },
        {
          id: 'multiply-three-both',
          label: 'Multiply both sides by 3',
        },
        {
          id: 'x-equals-eighteen',
          label: 'x = 18',
        },
        {
          id: 'subtract-four-both',
          label: 'Subtract 4 from both sides',
        },
        {
          id: 'x-equals-two',
          label: 'x = 2',
        },
      ],
      correctOrder: ['add-four-both', 'multiply-three-both', 'x-equals-eighteen'],
      feedback: {
        correct: 'Correct. Add 4 to get x/3 = 6, then multiply by 3 to reach x = 18.',
        incorrect: 'Undo the outside -4 first, then undo the division by 3 with its inverse, multiplication.',
        incomplete: 'Use three tiles: clear the -4, undo the divide-by-3, then state the value of x.',
        reveal: 'Tap "Add 4 to both sides", "Multiply both sides by 3", then "x = 18".',
        hintsByTile: {
          'subtract-four-both': 'Subtracting 4 repeats the -4. Add 4 to undo it.',
          'x-equals-two': '2 is the right side before any inverse move has happened.',
          'multiply-three-both': 'Multiplying by 3 is the correct second move, but clear the -4 before it.',
          'x-equals-eighteen': 'x = 18 is the result, so it belongs after both inverse moves.',
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
      visual: { left: '4x - 5', right: '19' },
    },
  ],
}
