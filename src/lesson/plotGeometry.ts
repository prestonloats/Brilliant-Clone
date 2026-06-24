export const PLOT_VIEW_BOX = 360
export const PLOT_PADDING = 34
export const PLOT_AREA = PLOT_VIEW_BOX - PLOT_PADDING * 2

export const clampToRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
