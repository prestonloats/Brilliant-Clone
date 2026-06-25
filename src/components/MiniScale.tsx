import { MathText } from '../MathText'

type ScaleVisual = 'balanced-scale' | 'unknown-box' | { left: string; right: string }

const SCALE_PRESETS: Record<'balanced-scale' | 'unknown-box', { left: string; right: string }> = {
  'balanced-scale': { left: '3', right: '3' },
  'unknown-box': { left: 'x + 2', right: '5' },
}

export function MiniScale({ visual }: { visual?: ScaleVisual }) {
  const { left, right } = typeof visual === 'object' ? visual : SCALE_PRESETS[visual ?? 'balanced-scale']
  return (
    <div className="mini-scale">
      <span><MathText>{left}</MathText></span>
      <strong>=</strong>
      <span><MathText>{right}</MathText></span>
    </div>
  )
}
