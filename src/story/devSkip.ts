// Pure helpers for the developer-only "skip this question and count it correct" control on the
// Story Mode question screen. Story Mode only advances on a correct solve, so the control just
// fires the normal submit. It is offered ONLY for the LIVE question (never while reviewing a past
// question or showing a chapter's story text) and is disabled while an AI generation is in flight
// ("busy") so it shares that lock and cannot double-fire. No imports / no import.meta on purpose.

export function shouldShowStoryDevSkip(input: {
  devEnabled: boolean
  reviewing: boolean
  showingChapterText: boolean
}): boolean {
  return input.devEnabled && !input.reviewing && !input.showingChapterText
}

export function isStoryDevSkipDisabled(input: { busy: boolean }): boolean {
  return input.busy
}
