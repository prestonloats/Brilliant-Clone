import type { Lesson } from '../types'

export const likeTermsVariablesBothSidesLesson: Lesson = {
  id: 'like-terms-variables-both-sides',
  title: 'Like Terms & Variables on Both Sides',
  subtitle: 'Combine terms before solving',
  skillIds: ['like-terms', 'variables-on-both-sides'],
  prerequisites: ['two-step-equations'],
  steps: [
    {
      id: 'concept-like-terms',
      type: 'concept',
      title: 'Terms can join their own team',
      body: 'Before graphing lines, learners need practice with equations that have several variable terms. Like terms have the same variable part: 4x and -x can combine because they are both x-terms, but 2y has to stay on the y team.',
      visual: 'unknown-box',
    },
    {
      id: 'sort-like-terms',
      type: 'dragTerms',
      prompt: 'Sort each term of 4x + 3 - x + 2y onto its team. Like terms share the same variable part.',
      equation: '4x + 3 - x + 2y',
      bins: [
        { id: 'x-terms', label: 'x-terms', detail: 'Variable part x' },
        { id: 'y-terms', label: 'y-terms', detail: 'Variable part y' },
        { id: 'constants', label: 'Constants', detail: 'Just a number' },
      ],
      tiles: [
        { id: 'tile-4x', label: '4x', bin: 'x-terms' },
        { id: 'tile-neg-x', label: '-x', bin: 'x-terms' },
        { id: 'tile-2y', label: '2y', bin: 'y-terms' },
        { id: 'tile-3', label: '3', bin: 'constants' },
      ],
      feedback: {
        correct: 'Yes. 4x and -x are both x-terms (they combine to 3x), 2y is the only y-term, and 3 is the constant.',
        incorrect: 'Sort by the variable part: x-terms with x-terms, y-terms with y-terms, and plain numbers as constants.',
        reveal: 'Put 4x and -x in x-terms, 2y in y-terms, and 3 in constants.',
        hints: [
          { when: 'empty', text: 'Each tile is one term. Start by dragging 4x into the x-terms bin.' },
          { when: 'incomplete', text: 'Keep going. Every term belongs to exactly one team: x-terms, y-terms, or constants.' },
          { when: 'misplaced', text: 'A tile is on the wrong team. x and y are different variable parts, and a plain number is a constant.' },
          { when: 'default', text: 'Match each tile to its variable part: 4x and -x are x-terms, 2y is a y-term, 3 is a constant.' },
        ],
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
        },
        {
          id: 'rewrite-expression',
          label: 'Rewrite as 3x + 3 + 2y',
        },
        {
          id: 'combine-x-y',
          label: 'Combine 3x and 2y',
        },
        {
          id: 'make-nine-x',
          label: 'Rewrite as 9x',
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
      id: 'group-like-terms-combine',
      type: 'dragTerms',
      prompt: 'Group the like terms in 7x + 4 - 2x + y - 3. Drop each tile with its team so you can combine them.',
      equation: '7x + 4 - 2x + y - 3',
      bins: [
        { id: 'x-terms', label: 'x-terms', detail: 'Combine to 5x' },
        { id: 'y-terms', label: 'y-terms', detail: 'Only one y-term' },
        { id: 'constants', label: 'Constants', detail: 'Combine to 1' },
      ],
      tiles: [
        { id: 'tile-7x', label: '7x', bin: 'x-terms' },
        { id: 'tile-neg-2x', label: '-2x', bin: 'x-terms' },
        { id: 'tile-y', label: 'y', bin: 'y-terms' },
        { id: 'tile-pos-4', label: '4', bin: 'constants' },
        { id: 'tile-neg-3', label: '-3', bin: 'constants' },
      ],
      feedback: {
        correct: 'Grouped. Now combine each team: 7x - 2x = 5x, the lone y stays, and 4 - 3 = 1, so the expression is 5x + y + 1.',
        incorrect: 'Only terms with the same variable part combine. Group the x-terms together, keep the y-term alone, and put the plain numbers with the constants.',
        reveal: 'x-terms: 7x and -2x. y-terms: y. Constants: 4 and -3. Combined, that is 5x + y + 1.',
        hints: [
          { when: 'empty', text: 'Drag the matching terms together first. 7x and -2x both belong on the x team.' },
          { when: 'incomplete', text: 'A few tiles are still loose. Every term needs a team before you can combine.' },
          { when: 'misplaced', text: 'Check the variable parts. y is its own team, and 4 and -3 are constants, not x-terms.' },
          { when: 'default', text: 'Same variable part means same team: 7x and -2x group, y is alone, and 4 and -3 are constants.' },
        ],
      },
    },
    {
      id: 'sort-equation-terms',
      type: 'dragTerms',
      prompt: 'Sort every term of 6x - 4 + 2x = 3x + 16 by type. The equals sign separates sides, not term types.',
      equation: '6x - 4 + 2x = 3x + 16',
      bins: [
        { id: 'x-terms', label: 'x-terms', detail: 'Has the variable x' },
        { id: 'constants', label: 'Constants', detail: 'Just a number' },
      ],
      tiles: [
        { id: 'tile-6x', label: '6x', bin: 'x-terms' },
        { id: 'tile-2x', label: '2x', bin: 'x-terms' },
        { id: 'tile-3x', label: '3x', bin: 'x-terms' },
        { id: 'tile-neg-4', label: '-4', bin: 'constants' },
        { id: 'tile-16', label: '16', bin: 'constants' },
      ],
      feedback: {
        correct: 'Right. 6x, 2x, and 3x are all x-terms even across the equals sign, while -4 and 16 are constants.',
        incorrect: 'Classify by the variable part, not by which side of the equals sign a term is on. 3x is still an x-term.',
        reveal: 'x-terms: 6x, 2x, and 3x. Constants: -4 and 16.',
        hints: [
          { when: 'empty', text: 'Drag each term to its type. 6x has an x, so it is an x-term.' },
          { when: 'incomplete', text: 'Keep sorting. The 3x on the right side is still an x-term.' },
          { when: 'misplaced', text: 'The equals sign separates sides, not term types. A term with x is an x-term wherever it sits.' },
          { when: 'default', text: 'Group by variable part: 6x, 2x, and 3x are x-terms; -4 and 16 are constants.' },
        ],
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
        },
        {
          id: 'subtract-seven-both',
          label: 'Subtract 7 from both sides',
        },
        {
          id: 'divide-three-both',
          label: 'Divide both sides by 3',
        },
        {
          id: 'x-equals-four',
          label: 'x = 4',
        },
        {
          id: 'add-two-x-both',
          label: 'Add 2x to both sides',
        },
        {
          id: 'x-equals-twelve',
          label: 'x = 12',
        },
      ],
      correctOrder: ['subtract-two-x-both', 'subtract-seven-both', 'divide-three-both', 'x-equals-four'],
      // Subtracting 2x and subtracting 7 commute, so clearing the constant first is equally valid.
      acceptableOrders: [['subtract-seven-both', 'subtract-two-x-both', 'divide-three-both', 'x-equals-four']],
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
      id: 'mastery-input-combine-and-solve',
      type: 'input',
      prompt: 'Mastery check: combine like terms, then solve for x in 8x + 5 - 3x = 2x + 20.',
      accept: ['5', 'x=5', 'x = 5', '15/3'],
      feedback: {
        correct: 'Yes. 8x - 3x = 5x, so 5x + 5 = 2x + 20. Then 3x + 5 = 20, 3x = 15, and x = 5.',
        incorrect: 'Combine 8x and -3x on the left first, then gather the x-terms on one side before solving.',
        reveal: '8x + 5 - 3x = 2x + 20 -> 5x + 5 = 2x + 20 -> 3x + 5 = 20 -> 3x = 15 -> x = 5.',
        hintsByAnswer: {
          '15': '15 is the value of 3x after clearing the +5. Divide both sides by 3 to get one x.',
          '3': '3 is the coefficient of x after gathering terms, not the value of x.',
          '2.5': 'Combine the like terms on the left first: 8x - 3x is 5x, not 6x.',
        },
      },
    },
    {
      id: 'mastery-sequence-full-solution',
      type: 'sequence',
      prompt: 'Mastery check: build the full solution for 10x - 2 - 4x = 2x + 14.',
      equation: '10x - 2 - 4x = 2x + 14',
      tiles: [
        {
          id: 'combine-subtract-coefficients',
          label: 'Combine 10x and -4x into 6x',
        },
        {
          id: 'combine-add-coefficients',
          label: 'Combine 10x and -4x into 14x',
        },
        {
          id: 'subtract-2x-both',
          label: 'Subtract 2x from both sides',
        },
        {
          id: 'add-2x-both',
          label: 'Add 2x to both sides',
        },
        {
          id: 'add-2-both',
          label: 'Add 2 to both sides',
        },
        {
          id: 'divide-4-both',
          label: 'Divide both sides by 4',
        },
        {
          id: 'mastery-x-equals-4',
          label: 'x = 4',
        },
      ],
      correctOrder: ['combine-subtract-coefficients', 'subtract-2x-both', 'add-2-both', 'divide-4-both', 'mastery-x-equals-4'],
      // After combining, subtracting 2x and adding 2 commute, so clearing the constant first is equally valid.
      acceptableOrders: [
        ['combine-subtract-coefficients', 'add-2-both', 'subtract-2x-both', 'divide-4-both', 'mastery-x-equals-4'],
      ],
      feedback: {
        correct: 'Correct. Combine 10x - 4x = 6x, gather the x-terms with -2x, clear -2, divide by 4, and x = 4.',
        incorrect: 'Combine the like terms first, then move the x-terms to one side before isolating x.',
        incomplete: 'Use five tiles: combine 10x - 4x, subtract 2x, add 2, divide by 4, then x = 4.',
        reveal: 'Tap "Combine 10x and -4x into 6x", "Subtract 2x from both sides", "Add 2 to both sides", "Divide both sides by 4", then "x = 4".',
        hintsByTile: {
          'combine-add-coefficients': 'Combining 10x - 4x subtracts the coefficients: 10 - 4 = 6, so it becomes 6x.',
          'add-2x-both': 'Adding 2x makes more variable terms. Subtract the smaller x-term, 2x, instead.',
          'subtract-2x-both': 'Combine the like terms on the left first, then move the x-terms across the equals sign.',
          'mastery-x-equals-4': 'x = 4 is the final value; it comes after the balancing moves.',
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
}
