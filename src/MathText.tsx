import { useLayoutEffect, useRef } from 'react'
import katex from 'katex'
import { equationToAriaLabel, equationToLatex } from './equationLatex'

type MathTextProps = {
  // The equation in the app's plain authoring notation, e.g. "3x - 5 = 19".
  children: string
  // Render as a centered display equation (KaTeX displayMode) instead of inline.
  display?: boolean
  // Extra class on the wrapper, e.g. the surface's existing equation class.
  className?: string
  // Override the screen-reader label; defaults to a readable form of `children`.
  ariaLabel?: string
}

// Renders an equation with KaTeX through a ref using katex.render (no
// dangerouslySetInnerHTML in app code). The visible KaTeX output is aria-hidden, while a
// visually-hidden span carries the original plain-text equation so screen readers — and
// aria-live regions that wrap a MathText — still announce the real meaning. KaTeX runs with
// throwOnError:false, and any unexpected failure falls back to plain text, so an equation
// never crashes or vanishes.
export function MathText({ children, display = false, className, ariaLabel }: MathTextProps) {
  const renderTargetRef = useRef<HTMLSpanElement>(null)
  const label = ariaLabel ?? equationToAriaLabel(children)

  useLayoutEffect(() => {
    const target = renderTargetRef.current
    if (!target) return
    try {
      katex.render(equationToLatex(children), target, {
        throwOnError: false,
        displayMode: display,
        output: 'html',
        // Defense-in-depth: keep KaTeX's safe default explicit so commands that can
        // emit active markup (\href, \url, \includegraphics, \htmlData, ...) are never
        // honored, even if a future KaTeX default changes or authored/user-derived
        // notation ever reaches this renderer.
        trust: false,
      })
    } catch {
      target.textContent = children
    }
  }, [children, display])

  return (
    <span className={className ? `math-text ${className}` : 'math-text'}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" ref={renderTargetRef} />
    </span>
  )
}
