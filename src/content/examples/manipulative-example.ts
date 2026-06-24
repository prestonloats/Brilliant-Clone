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
