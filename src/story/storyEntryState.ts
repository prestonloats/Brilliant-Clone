// Pure presentation-state for the Story Mode entry card (plan sections 6.1 / 8).
//
// Maps the three booleans CourseMap already computes (the unlock gate, whether a StoryAI
// provider is configured, and whether a saved session is active) onto a single discriminated
// UI state. Keeping this here, in a React-free `.ts` module, lets `StoryEntryCard` stay a pure
// render of the state AND lets the precedence be unit-tested under `node --test` (the repo has
// no DOM/React harness; the test build only transpiles `.ts`, not `.tsx`).
//
// This encodes EXACTLY the precedence the card used before, so it changes no behavior:
//   1. The unlock gate (first two lessons) wins over everything else -> 'locked'.
//   2. Otherwise resume is offline-safe for already-generated content, so an active session can
//      always be resumed; only a brand-new adventure needs a configured provider.
//   3. Otherwise (unlocked, no provider, no session) -> 'needs-provider'.

export type StoryEntryStatus = 'locked' | 'needs-provider' | 'ready'
export type StoryEntryAction = 'start' | 'resume'

export type StoryEntryInput = {
  unlocked: boolean
  providerConfigured: boolean
  hasActiveSession: boolean
}

export type StoryEntryState = {
  status: StoryEntryStatus
  // The primary call-to-action to render, or null when the card is gated (locked / no provider).
  action: StoryEntryAction | null
}

export function getStoryEntryState({
  unlocked,
  providerConfigured,
  hasActiveSession,
}: StoryEntryInput): StoryEntryState {
  if (!unlocked) return { status: 'locked', action: null }
  const canPlay = providerConfigured || hasActiveSession
  if (!canPlay) return { status: 'needs-provider', action: null }
  return { status: 'ready', action: hasActiveSession ? 'resume' : 'start' }
}
