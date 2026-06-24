import { MathText } from '../MathText'
import type { ConceptStep } from '../domain'

export function MiniScale({ visual }: { visual?: ConceptStep['visual'] }) {
  const leftSide = visual === 'unknown-box' ? 'x + 2' : '3'
  const rightSide = visual === 'unknown-box' ? '5' : '3'
  return (
    <div className="mini-scale">
      <span><MathText>{leftSide}</MathText></span>
      <strong>=</strong>
      <span><MathText>{rightSide}</MathText></span>
    </div>
  )
}
