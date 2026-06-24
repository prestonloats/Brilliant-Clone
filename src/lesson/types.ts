export type StepPriorResult = {
  correct: boolean
  attempts: number
  feedback: string
}

export type CompleteOptions = {
  advance?: boolean
  recordAttempt?: boolean
}
