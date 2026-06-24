const MIN_VISIBLE_FILL_PERCENT = 4

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const normalizedValue = Math.max(0, Math.min(100, value))

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalizedValue}
      aria-valuetext={`${label}, ${normalizedValue}%`}
      className="progress-block"
      role="progressbar"
    >
      <div className="progress-meta">
        <span>{label}</span>
        <span>{normalizedValue}%</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${Math.max(MIN_VISIBLE_FILL_PERCENT, normalizedValue)}%` }} />
      </div>
    </div>
  )
}
