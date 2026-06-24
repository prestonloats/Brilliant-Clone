import type { LessonStep } from '../domain'
import type { CompleteOptions, StepPriorResult } from './types'
import { BalanceStepView } from './steps/BalanceStepView'
import { ConceptCard } from './steps/ConceptCard'
import { DragTermsStepView } from './steps/DragTermsStepView'
import { ManipulativeBuildView } from './steps/ManipulativeBuildView'
import { ManipulativeStepView } from './steps/ManipulativeStepView'
import { MultipleChoiceStep } from './steps/MultipleChoiceStep'
import { NumericInputStep } from './steps/NumericInputStep'
import { OperationChoiceStepView } from './steps/OperationChoiceStepView'
import { PlotStepView } from './steps/PlotStepView'
import { SequenceStepView } from './steps/SequenceStepView'
import { SliderStepView } from './steps/SliderStepView'

type StepRendererProps = {
  step: LessonStep
  priorResult?: StepPriorResult
  onComplete: (correct: boolean, feedback: string, options?: CompleteOptions) => void
  onAdvance: (feedback: string) => void
}

export function StepRenderer({ step, priorResult, onComplete, onAdvance }: StepRendererProps) {
  if (step.type === 'concept') {
    return <ConceptCard step={step} onContinue={() => onComplete(true, 'Concept viewed.', { recordAttempt: false })} />
  }

  if (step.type === 'mcq') {
    return <MultipleChoiceStep step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'input') {
    return <NumericInputStep step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'operation-choice') {
    return <OperationChoiceStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'sequence') {
    return <SequenceStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'manipulative') {
    // The discover-the-total mode is a different interaction (steppers + live total instead of a
    // pre-counted drag tray), so it has its own view. Dispatching here keeps each view's hooks
    // unconditional (rules-of-hooks).
    return step.goal.type === 'build-product' ? (
      <ManipulativeBuildView
        step={step}
        goal={step.goal}
        priorResult={priorResult}
        onAdvance={onAdvance}
        onComplete={onComplete}
      />
    ) : (
      <ManipulativeStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
    )
  }

  if (step.type === 'plot') {
    return <PlotStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'slider') {
    return <SliderStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  if (step.type === 'dragTerms') {
    return <DragTermsStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
  }

  return <BalanceStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />
}
