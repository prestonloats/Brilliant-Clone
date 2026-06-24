import { MiniScale } from '../../components/MiniScale'
import { ValueTable } from '../../components/ValueTable'
import type { ConceptStep } from '../../domain'

export function ConceptCard({ step, onContinue }: { step: ConceptStep; onContinue: () => void }) {
  return (
    <article className="lesson-card card">
      <p className="eyebrow">Concept</p>
      <h1>{step.title}</h1>
      <p className="lead">{step.body}</p>
      {step.visual && <MiniScale visual={step.visual} />}
      {step.tables && step.tables.length > 0 && (
        <div className="concept-tables">
          {step.tables.map((table, index) => (
            <ValueTable key={index} x={table.x} y={table.y} caption={table.caption} />
          ))}
        </div>
      )}
      <button className="primary-action" type="button" onClick={onContinue}>
        Continue
      </button>
    </article>
  )
}
