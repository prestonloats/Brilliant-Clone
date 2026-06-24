import type { Course } from './types'

// Course-level metadata and the topological lesson order. The branching dependency
// graph itself lives on each lesson's `prerequisites` (see src/content/lessons/*),
// while `lessonOrder` stays a valid topological order for recommendations.
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
