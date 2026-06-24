import type { Skill } from './types'

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
  {
    id: 'like-terms',
    title: 'Like terms',
    description: 'Combine terms that have the same variable part.',
    prerequisites: ['two-step-equations'],
  },
  {
    id: 'variables-on-both-sides',
    title: 'Variables on both sides',
    description: 'Move variable terms across the equals sign while preserving equality.',
    prerequisites: ['like-terms'],
  },
  {
    id: 'coordinate-plane',
    title: 'Coordinate plane',
    description: 'Read and place points using x- and y-coordinates.',
    prerequisites: ['variables-on-both-sides'],
  },
  {
    id: 'graphing-lines',
    title: 'Graphing lines',
    description: 'Connect slope-intercept equations to line graphs.',
    prerequisites: ['coordinate-plane'],
  },
]
