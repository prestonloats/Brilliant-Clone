import type { Lesson } from '../types'

export const graphingLinesLesson: Lesson = {
  id: 'graphing-lines',
  title: 'Graphing Lines',
  subtitle: 'Connect equations to lines',
  skillIds: ['graphing-lines'],
  // Path merge: Graphing Lines needs both parallel branches finished first.
  prerequisites: ['like-terms-variables-both-sides', 'coordinate-plane'],
  steps: [
    {
      id: 'concept-slope-intercept',
      type: 'concept',
      title: 'Slope and intercept shape a line',
      body: 'In y = mx + b, b is where the line crosses the y-axis. The slope m tells the line how to move from one point to the next.',
    },
    {
      id: 'match-slope-intercept-line',
      type: 'slider',
      prompt:
        'A line crosses the y-axis at 2 and rises 3 for every 1 step right. Drag the m and b sliders until the live line matches it.',
      slope: { min: -5, max: 5 },
      intercept: { min: -5, max: 5 },
      target: { slope: 3, intercept: 2 },
      range: { min: -6, max: 6 },
      feedback: {
        correct: 'Yes. y = 3x + 2 starts at 2 on the y-axis and climbs 3 for every 1 step right.',
        incorrect: 'Match b to where the line crosses the y-axis, and m to its rise over run.',
        reveal: 'Set m = 3 and b = 2 to draw y = 3x + 2.',
        hints: [
          { when: 'slope-direction', text: 'Your line tilts the wrong way. This line rises as you go right, so the slope m must be positive.' },
          { when: 'slope-off', text: 'The y-intercept is right. Now raise m until the line climbs 3 for every 1 step right.' },
          { when: 'intercept-off', text: 'The slope looks right. Now slide b until the line crosses the y-axis at 2.' },
          { when: 'both-off', text: 'Start with b: cross the y-axis at 2. Then set m so the line rises 3 for each step right.' },
          { when: 'close', text: 'Almost. Nudge m and b a little more so the line rises 3 and crosses at 2.' },
          { when: 'default', text: 'Set b to the y-intercept (2) and m to the rise over run (3).' },
        ],
      },
    },
    {
      id: 'build-slope-line',
      type: 'slider',
      prompt:
        'Build the line with no vertical shift that rises 2 units for every 1 unit to the right. Drag m and b until the rise-over-run guide shows a rise of 2 over a run of 1.',
      slope: { min: -4, max: 4 },
      intercept: { min: -5, max: 5 },
      target: { slope: 2, intercept: 0 },
      range: { min: -6, max: 6 },
      feedback: {
        correct: 'Exactly. y = 2x passes through the origin and rises 2 for every 1 step right, so its slope is rise 2 over run 1.',
        incorrect: 'Slope is rise over run: make the line climb 2 for every 1 step right, with no vertical shift.',
        reveal: 'Set m = 2 and b = 0 to draw y = 2x: rise 2 over run 1 through the origin.',
        hints: [
          { when: 'slope-direction', text: 'The line should climb to the right, not fall. Make the slope m positive.' },
          { when: 'slope-off', text: 'Good, there is no vertical shift. Now set m so the rise is 2 for every run of 1.' },
          { when: 'intercept-off', text: 'The climb is right. Now slide b to 0 so the line passes through the origin.' },
          { when: 'both-off', text: 'First slide b to 0 (through the origin). Then set m so the line rises 2 for each step right.' },
          { when: 'close', text: 'Almost there. Fine-tune until the rise is exactly 2 over a run of 1 with b at 0.' },
          { when: 'default', text: 'Rise over run = 2 means m = 2, and through the origin means b = 0.' },
        ],
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
      id: 'mastery-equation-from-graph',
      type: 'operation-choice',
      prompt: 'A line crosses the y-axis at (0, 5) and passes through (2, 1). Which equation matches its graph?',
      equation: 'through (0, 5) and (2, 1)',
      correctId: 'y-equals-negative-two-x-plus-five',
      choices: [
        {
          id: 'y-equals-negative-two-x-plus-five',
          label: 'y = -2x + 5',
          detail: 'Slope -2, intercept 5.',
          feedback: 'Correct. Rise -4 over run 2 is slope -2, and the line crosses the y-axis at 5.',
        },
        {
          id: 'y-equals-two-x-plus-five',
          label: 'y = 2x + 5',
          detail: 'Rises instead of falls.',
          feedback: 'The line drops from 5 down to 1, so y decreases as x grows. That is a negative slope.',
        },
        {
          id: 'y-equals-negative-four-x-plus-five',
          label: 'y = -4x + 5',
          detail: 'Uses the rise without the run.',
          feedback: 'The rise is -4, but slope is rise over run: -4 / 2 = -2, not -4.',
        },
        {
          id: 'y-equals-negative-two-x-plus-one',
          label: 'y = -2x + 1',
          detail: 'Intercept taken from the wrong point.',
          feedback: 'The y-intercept is where x = 0, which is 5. The 1 is just the y-value at x = 2.',
        },
      ],
      feedback: {
        correct:
          'Yes. From (0, 5) to (2, 1) the line falls 4 over a run of 2, giving slope -2 and intercept 5: y = -2x + 5.',
        incorrect: 'Find the slope as rise over run between the two points, then read the y-intercept where x = 0.',
        reveal: 'Slope = (1 - 5) / (2 - 0) = -4 / 2 = -2, and the intercept is 5, so y = -2x + 5.',
      },
    },
    {
      id: 'mastery-find-intercept',
      type: 'input',
      prompt: 'A line has slope -3 and passes through the point (2, 1). What is its y-intercept b in y = mx + b?',
      accept: ['7', 'b=7', 'b = 7'],
      feedback: {
        correct: 'Exactly. 1 = -3(2) + b gives 1 = -6 + b, so b = 7.',
        incorrect: 'Plug the slope and the point into y = mx + b, then solve for b.',
        reveal: 'Substitute the point into y = mx + b: 1 = -3(2) + b, so 1 = -6 + b, which gives b = 7.',
        hintsByAnswer: {
          '1': '1 is the y-value at the point (2, 1), not the y-intercept where x = 0.',
          '-5': 'Watch the signs: 1 = -6 + b means add 6 to both sides, so b = 7, not -5.',
          '-6': '-6 is only the -3 x 2 part. Put it back in the equation and solve 1 = -6 + b for b.',
        },
      },
    },
    {
      id: 'complete-graphing-lines-summary',
      type: 'concept',
      title: 'You connected equations to lines',
      body: 'You dragged sliders to match a line\u2019s slope and intercept, built a rise-over-run line through the origin, generated points from an equation, checked a table against a line rule, and worked backward from a graph to its equation and intercept.',
    },
  ],
}
