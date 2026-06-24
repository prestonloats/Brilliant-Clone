import { MiniScale } from '../../components/MiniScale'
import type { ConceptStep } from '../../domain'

export function ConceptCard({ step, onContinue }: { step: ConceptStep; onContinue: () => void }) {
  return (
    <article className="lesson-card card">
      <p className="eyebrow">Concept</p>
      <h1>{step.title}</h1>
      <p className="lead">{step.body}</p>
      <MiniScale visual={step.visual} />
      <button className="primary-action" type="button" onClick={onContinue}>
        Continue
      </button>
    </article>
  )
}
