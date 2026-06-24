import { createPortal } from 'react-dom'

// The floating "ghost" tile that follows the pointer while dragging. It is portaled to
// <body> on purpose: its ancestor .lesson-card keeps a transform after its card-enter
// entrance animation (animation-fill-mode: both leaves transform: translateY(0)), and a
// transformed ancestor becomes the containing block for position: fixed children. Left
// inside the card, this fixed element's left/top would be measured from the card's box
// instead of the viewport, so the ghost drifted away from the cursor (and worse as the
// page scrolled). Portaling to <body> restores viewport-relative fixed positioning, so
// left = clientX - grabOffsetX tracks the pointer exactly for both mouse and touch.
export function DragPreview({
  className,
  x,
  y,
  offsetX,
  offsetY,
  width,
  height,
  children,
}: {
  className: string
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  children: React.ReactNode
}) {
  return createPortal(
    <div className={className} style={{ left: x - offsetX, top: y - offsetY, width, height }}>
      {children}
    </div>,
    document.body,
  )
}
