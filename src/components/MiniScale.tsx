import { MathText } from '../MathText'

export function MiniScale({ visual }: { visual?: 'balanced-scale' | 'unknown-box' }) {
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
