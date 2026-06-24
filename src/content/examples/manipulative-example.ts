import type { ManipulativeStep } from '../types'

// Reference instance for the data-driven manipulative puzzle step.
//
// To author a creative puzzle in a lesson, copy a shape like this into a step inside
// your own src/content/lessons/<id>.ts file. No shared renderer/engine edits are
// needed: the ManipulativeStepView renderer (App.tsx) and checkManipulativeStep
// (engine.ts) already handle every `type: 'manipulative'` step generically.
export const manipulativeExampleStep: ManipulativeStep = {
  id: 'manipulative-equal-groups-example',
  type: 'manipulative',
  prompt: 'Share 12 apples equally among 3 baskets.',
  total: 12,
  object: { label: 'apple', emoji: '\u{1F34E}' },
  goal: { type: 'equal-groups', groups: 3, perGroup: 4 },
  feedback: {
    correct: 'Exactly. 12 shared into 3 equal baskets is 4 each, because 12 / 3 = 4.',
    incorrect: 'Each basket should hold the same number, and every apple should be used.',
    reveal: 'Put 4 apples in each basket: 4 + 4 + 4 = 12.',
    hints: [
      { when: 'empty', text: 'Start dragging apples into the baskets so each one fills up.' },
      { when: 'too-many', text: 'One basket has too many. 12 / 3 means 4 in each basket.' },
      { when: 'uneven', text: 'The baskets must match. Even them out so each holds the same count.' },
      { when: 'too-few', text: 'Keep going until every apple is placed and each basket has 4.' },
      { when: 'default', text: 'Make the three baskets equal using all 12 apples.' },
    ],
  },
}

// Reference instance for the "discover the total" (build-product) variant. Instead of a
// pre-counted tray, the learner draws from a large pool and sets BOTH the number of groups
// and the per-group amount; the live total (groups x perGroup) is the value being found.
// Solved when both steppers match the targets. No shared renderer/engine edits are needed:
// ManipulativeBuildView (App.tsx) and checkManipulativeStep (engine.ts) handle it generically.
export const manipulativeBuildProductExampleStep: ManipulativeStep = {
  id: 'manipulative-build-product-example',
  type: 'manipulative',
  prompt: 'Solve y / 4 = 2 by building it: set the number of trays and how many apples sit in each, then read the total (y).',
  total: 30,
  object: { label: 'apple', emoji: '\u{1F34E}' },
  goal: { type: 'build-product', groups: 4, perGroup: 2, maxGroups: 6, maxPerGroup: 5 },
  feedback: {
    correct: 'Exactly. 4 trays of 2 build 8, so y = 4 x 2 = 8. Multiplying by 4 undoes dividing by 4.',
    incorrect: 'Match y / 4 = 2: the divisor 4 is the number of trays and the 2 is how many sit in each. The total is y.',
    reveal: 'Set 4 trays with 2 apples in each. The live total reads 4 x 2 = 8, so y = 8.',
    hints: [
      { when: 'empty', text: 'Add some trays and apples. The live total shows how many you have built so far.' },
      { when: 'groups', text: 'Dividing by 4 means 4 equal trays. Set the number of groups to the divisor in y / 4.' },
      { when: 'per-group', text: 'Each tray ended with 2 apples (the right side of y / 4 = 2). Set the per-group amount to 2.' },
      { when: 'default', text: 'Make 4 trays with 2 apples each, then read the live total: that product is y.' },
    ],
  },
}
