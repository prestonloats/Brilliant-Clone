import type { Lesson } from '../types'

export const coordinatePlaneLesson: Lesson = {
  id: 'coordinate-plane',
  title: 'Coordinate Plane',
  subtitle: 'Plot and read points',
  skillIds: ['coordinate-plane'],
  // Path branch: Coordinate Plane runs parallel to Like Terms, so both open once
  // Two-Step Equations is complete rather than chaining off Like Terms.
  prerequisites: ['two-step-equations'],
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
        },
        {
          id: 'move-down-two',
          label: 'Move 2 down',
        },
        {
          id: 'arrive-three-negative-two',
          label: 'Land at (3, -2)',
        },
        {
          id: 'move-left-three',
          label: 'Move 3 left',
        },
        {
          id: 'move-up-two',
          label: 'Move 2 up',
        },
      ],
      correctOrder: ['move-right-three', 'move-down-two', 'arrive-three-negative-two'],
      // The horizontal and vertical moves commute, so moving down first then right is equally valid.
      acceptableOrders: [['move-down-two', 'move-right-three', 'arrive-three-negative-two']],
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
      type: 'plot',
      prompt: 'Plot the point with x = -4 and y = 2. Tap the grid, or type the coordinates, to place it.',
      range: { min: -5, max: 5 },
      target: { kind: 'points', points: [{ x: -4, y: 2 }] },
      feedback: {
        correct: 'Correct. (-4, 2) is 4 units left and 2 units up from the origin.',
        incorrect: 'Read it as (x, y): x = -4 is a move left, y = 2 is a move up.',
        reveal: 'Place the point at (-4, 2): from the origin go 4 left, then 2 up.',
        hints: [
          { when: 'empty', text: 'Tap the grid to drop a point. Go left for a negative x and up for a positive y.' },
          { when: 'swapped', text: 'Keep the order (x, y): x = -4 is the horizontal move and y = 2 is the vertical one.' },
          { when: 'close', text: 'Right quadrant. Now line up x = -4 (4 left) and y = 2 (2 up) exactly.' },
          { when: 'too-many', text: 'Only one point is needed. Clear the extras and place (-4, 2).' },
          { when: 'default', text: 'x = -4 means 4 left of the origin; y = 2 means 2 up.' },
        ],
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
      type: 'plot',
      prompt: 'Place a point in Quadrant IV - the region where x is positive and y is negative.',
      range: { min: -5, max: 5 },
      target: { kind: 'quadrants', quadrants: [4] },
      feedback: {
        correct: 'Correct. Positive x (right) with negative y (down) lands in the lower-right region, Quadrant IV.',
        incorrect: 'Quadrant IV is lower-right: x must be positive (right of the y-axis) and y negative (below the x-axis).',
        reveal: 'Place any point with x > 0 and y < 0, such as (3, -2), to land in Quadrant IV.',
        hints: [
          { when: 'empty', text: 'Drop a point in the lower-right block of the grid.' },
          { when: 'on-axis', text: 'Points on an axis are on the border. Move fully right and down so neither coordinate is zero.' },
          { when: 'wrong-quadrant', text: 'Check the signs: Quadrant IV needs positive x (right) and negative y (down).' },
          { when: 'too-many', text: 'One point is enough. Clear the extras and leave a single point in Quadrant IV.' },
          { when: 'default', text: 'Aim for the lower-right region: right of the y-axis and below the x-axis.' },
        ],
      },
    },
    {
      id: 'plot-point-each-quadrant',
      type: 'plot',
      prompt: 'Build a four-quadrant map: place one point in each of the four quadrants.',
      range: { min: -5, max: 5 },
      target: { kind: 'quadrants', quadrants: [1, 2, 3, 4] },
      feedback: {
        correct: 'Balanced map. One point in each quadrant covers (+,+), (-,+), (-,-), and (+,-).',
        incorrect: 'Each quadrant needs exactly one point, and none may sit on an axis.',
        reveal: 'Place four points such as (3, 2), (-3, 2), (-3, -2), and (3, -2) - one per quadrant.',
        hints: [
          { when: 'empty', text: 'Start dropping points. You need one in each of the four corners of the plane.' },
          { when: 'on-axis', text: 'A point on an axis is in no quadrant. Keep both coordinates away from zero.' },
          { when: 'incomplete', text: 'Good start. Keep going until every quadrant holds exactly one point.' },
          { when: 'wrong-quadrant', text: 'Two points share a quadrant. Spread them so all four quadrants are covered once.' },
          { when: 'too-many', text: 'Four points is the goal - one per quadrant. Clear any extras.' },
          { when: 'default', text: 'Cover all four quadrants: (+,+), (-,+), (-,-), and (+,-).' },
        ],
      },
    },
    {
      id: 'input-net-coordinate-walk',
      type: 'input',
      prompt:
        'Mastery check: from the origin, move 7 right, 3 up, 9 left, then 8 down. Type the final coordinate as (x, y).',
      accept: ['(-2,-5)', '(-2, -5)', '-2,-5', 'x=-2,y=-5'],
      feedback: {
        correct: 'Exactly. Left/right combine to 7 - 9 = -2, and up/down combine to 3 - 8 = -5, so the point is (-2, -5).',
        incorrect: 'Combine the horizontal moves for x and the vertical moves for y, keeping right and up positive.',
        reveal: 'Combine each direction: 7 - 9 = -2 for x and 3 - 8 = -5 for y, giving (-2, -5).',
        hintsByAnswer: {
          '(-5,-2)': 'Keep x first: combine left/right for the x-coordinate, then up/down for the y-coordinate.',
          '-5,-2': 'Keep x first: combine left/right for the x-coordinate, then up/down for the y-coordinate.',
          '(2,-5)': 'Right 7 then left 9 ends left of the origin, so the x-coordinate is negative.',
          '2,-5': 'Right 7 then left 9 ends left of the origin, so the x-coordinate is negative.',
          '(-2,5)': 'Up 3 then down 8 ends below the origin, so the y-coordinate is negative.',
          '-2,5': 'Up 3 then down 8 ends below the origin, so the y-coordinate is negative.',
          '-2': 'That is only the x-coordinate. Include both values as (x, y).',
        },
      },
    },
    {
      id: 'choose-point-in-quadrant-two',
      type: 'plot',
      prompt: 'Mastery check: place a point in Quadrant II, where x is negative and y is positive.',
      range: { min: -5, max: 5 },
      target: { kind: 'quadrants', quadrants: [2] },
      feedback: {
        correct: 'Correct. Negative x (left) with positive y (up) is the (-, +) pattern of Quadrant II.',
        incorrect: 'Quadrant II is upper-left: x negative (left of the y-axis) and y positive (above the x-axis).',
        reveal: 'Place any point with x < 0 and y > 0, such as (-2, 3), to land in Quadrant II.',
        hints: [
          { when: 'empty', text: 'Drop a point in the upper-left block of the grid.' },
          { when: 'on-axis', text: 'On an axis means no quadrant. Move fully left and up so neither coordinate is zero.' },
          { when: 'wrong-quadrant', text: 'Match the signs: Quadrant II is (-, +) - negative x, positive y.' },
          { when: 'too-many', text: 'Only one point is needed here. Clear the extras.' },
          { when: 'default', text: 'Aim for the upper-left region: left of the y-axis and above the x-axis.' },
        ],
      },
    },
    {
      id: 'complete-coordinate-plane-summary',
      type: 'concept',
      title: 'You can read the grid',
      body: 'You plotted points from the origin, kept x before y, placed a point in every quadrant, and matched coordinate signs to the quadrant they name.',
    },
  ],
}
