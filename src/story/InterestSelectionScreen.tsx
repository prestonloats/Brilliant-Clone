import { useState } from 'react'
import type { CustomCharacter, MainCharacterSource, StoryInterestId, StoryTheme } from '../domain'
import { containsProfanity, containsUnsafeContent, sanitizeUserInput } from './safety'
import { INTEREST_CATALOG } from './interests'
import {
  CHARACTER_BACKSTORIES,
  CHARACTER_PERSONALITIES,
  getBackstoryLabel,
  getPersonalityLabel,
  MAX_CHARACTER_NAME_LEN,
  MAX_CUSTOM_CHARACTERS,
} from './characterPresets'

const MAX_INTERESTS = 3
// Cap for the single freeformInterest string the persistence layer enforces (validation.ts).
// The added custom-interest boxes are comma-joined into this one field on submit, so the
// combined join must stay within this bound.
const MAX_FREEFORM_LENGTH = 80
// How many custom-interest boxes the learner can add, and the per-box input cap. Small caps keep
// the comma-joined freeformInterest within MAX_FREEFORM_LENGTH and the UI tidy.
const MAX_CUSTOM_INTERESTS = 3
const MAX_CUSTOM_INTEREST_LENGTH = 40

// The main-character chooser. 'random' (let the LLM invent a hero) preserves the legacy default,
// so it is the initial selection; the controller resolves 'displayName' from the signed-in user.
const MAIN_CHARACTER_OPTIONS: { value: MainCharacterSource; label: string; hint: string }[] = [
  { value: 'displayName', label: 'Use my name', hint: 'Your profile name stars as the hero.' },
  { value: 'random', label: 'Surprise me', hint: 'We invent a hero that fits your theme.' },
  { value: 'custom', label: 'Custom name', hint: 'Play as any name you choose.' },
]

// Stable per-character id. Prefers crypto.randomUUID(); falls back for non-secure contexts so
// adding a character never throws.
const makeCharacterId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

type InterestSelectionScreenProps = {
  unlocked: boolean
  providerConfigured: boolean
  busy: boolean
  error: string
  onBegin: (theme: StoryTheme) => void
  onBackToPath: () => void
}

export function InterestSelectionScreen({
  unlocked,
  providerConfigured,
  busy,
  error,
  onBegin,
  onBackToPath,
}: InterestSelectionScreenProps) {
  const [selected, setSelected] = useState<StoryInterestId[]>([])
  const [customInterests, setCustomInterests] = useState<string[]>([])
  const [interestDraft, setInterestDraft] = useState('')
  const [interestError, setInterestError] = useState('')
  const [characters, setCharacters] = useState<CustomCharacter[]>([])
  const [draftName, setDraftName] = useState('')
  const [draftPersonality, setDraftPersonality] = useState('')
  const [draftBackstory, setDraftBackstory] = useState('')
  const [characterError, setCharacterError] = useState('')
  const [mainCharacterSource, setMainCharacterSource] = useState<MainCharacterSource>('random')
  const [mainCharacterName, setMainCharacterName] = useState('')
  const [mainNameError, setMainNameError] = useState('')
  // Split the setup into two sequential steps: pick interests first, then build the cast.
  // Purely presentational — every field still submits together via handleBegin/onBegin.
  const [step, setStep] = useState<'interests' | 'cast'>('interests')

  const atCharacterLimit = characters.length >= MAX_CUSTOM_CHARACTERS

  const atInterestLimit = customInterests.length >= MAX_CUSTOM_INTERESTS

  // No themes chosen at all (no presets, no custom tags). Allowed: the adventure then begins seeded
  // from a random off-interest scene (a "surprise"), so the buttons stay enabled.
  const noInterestsChosen = selected.length === 0 && customInterests.length === 0

  const toggle = (id: StoryInterestId) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= MAX_INTERESTS) return current
      return [...current, id]
    })
  }

  // "Add your own" becomes removable boxes/chips. Each typed interest is sanitized + moderated
  // (same teen-safety gate as character names), de-duplicated case-insensitively, and length-
  // guarded against the shared freeformInterest cap so the comma-joined result never silently
  // truncates on submit. This is purely UI: the chips fold back into `freeformInterest` (one
  // string) in handleBegin, so the StoryTheme shape/validation/prompts are untouched.
  const addCustomInterest = () => {
    if (busy || atInterestLimit) return
    const value = sanitizeUserInput(interestDraft, MAX_CUSTOM_INTEREST_LENGTH)
    if (!value) {
      setInterestError('Enter an interest using letters or numbers.')
      return
    }
    if (containsProfanity(value) || containsUnsafeContent(value)) {
      setInterestError('That interest isn’t allowed here — please choose another.')
      return
    }
    if (customInterests.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setInterestError('You’ve already added that interest.')
      return
    }
    if ([...customInterests, value].join(', ').length > MAX_FREEFORM_LENGTH) {
      setInterestError('That’s too long to add — remove one or shorten it.')
      return
    }
    setCustomInterests((current) => [...current, value])
    setInterestDraft('')
    setInterestError('')
  }

  const removeCustomInterest = (value: string) => {
    setCustomInterests((current) => current.filter((interest) => interest !== value))
  }

  // Teen-safety gate shared by character names and the custom main-character name: sanitize +
  // cap to MAX_CHARACTER_NAME_LEN, then reject empty/profane/unsafe text. The persistence layer
  // re-sanitizes, but enforcing it here gives the learner immediate, inline feedback.
  const checkName = (raw: string): { name: string } | { error: string } => {
    const name = sanitizeUserInput(raw, MAX_CHARACTER_NAME_LEN)
    if (!name) return { error: 'Enter a name using letters or numbers.' }
    if (containsProfanity(name) || containsUnsafeContent(name)) {
      return { error: 'That name isn’t allowed here — please choose another.' }
    }
    return { name }
  }

  const addCharacter = () => {
    if (busy || atCharacterLimit) return
    const result = checkName(draftName)
    if ('error' in result) {
      setCharacterError(result.error)
      return
    }
    const character: CustomCharacter = {
      id: makeCharacterId(),
      name: result.name,
      ...(draftPersonality ? { personalityId: draftPersonality } : {}),
      ...(draftBackstory ? { backstoryId: draftBackstory } : {}),
    }
    setCharacters((current) => [...current, character])
    setDraftName('')
    setDraftPersonality('')
    setDraftBackstory('')
    setCharacterError('')
  }

  const removeCharacter = (id: string) => {
    setCharacters((current) => current.filter((character) => character.id !== id))
  }

  const handleBegin = () => {
    if (busy) return

    // A custom protagonist name goes through the same safety gate before we start.
    let resolvedMainName: string | undefined
    if (mainCharacterSource === 'custom') {
      const result = checkName(mainCharacterName)
      if ('error' in result) {
        setMainNameError(result.error)
        return
      }
      resolvedMainName = result.name
    }

    // Fold the added custom-interest boxes into the single freeformInterest string (UI-only):
    // comma-join the already-sanitized entries and re-sanitize within the shared cap.
    const freeform = sanitizeUserInput(customInterests.join(', '), MAX_FREEFORM_LENGTH)
    onBegin({
      interestIds: selected,
      ...(freeform ? { freeformInterest: freeform } : {}),
      // The LLM fills these in at session start; the controller supplies safe fallbacks.
      premise: '',
      protagonist: '',
      ...(characters.length > 0 ? { characters } : {}),
      mainCharacterSource,
      // 'displayName' is resolved by the controller from the signed-in user at begin time.
      ...(resolvedMainName ? { mainCharacterName: resolvedMainName } : {}),
    })
  }

  if (!unlocked) {
    return (
      <section className="screen-stack">
        <article className="card story-gate-card">
          <span className="story-gate-icon" aria-hidden="true">
            🔒
          </span>
          <header className="story-screen-head">
            <p className="eyebrow">Story Mode</p>
            <h1>Keep going to unlock Story Mode</h1>
            <p className="lead">
              Finish the first two lessons — Balancing Equations and One-Step Equations — to unlock an endless,
              story-wrapped review adventure built from what you have already learned.
            </p>
          </header>
          <button className="primary-action" type="button" onClick={onBackToPath}>
            Back to path
          </button>
        </article>
      </section>
    )
  }

  if (!providerConfigured) {
    return (
      <section className="screen-stack">
        <article className="card story-gate-card">
          <span className="story-gate-icon" aria-hidden="true">
            🔑
          </span>
          <header className="story-screen-head">
            <p className="eyebrow">Story Mode</p>
            <h1>Add a key to enable Story Mode</h1>
            <p className="lead">
              Story Mode wraps your practice in an AI-generated adventure. To turn it on locally, add your OpenAI
              key as <code>OPENAI_API_KEY</code> in a <code>.env.local</code> file, then restart the dev server.
            </p>
          </header>
          <p className="story-note">Your math, answers, and grading always stay local — the AI only rewrites the story around each question.</p>
          <button className="primary-action" type="button" onClick={onBackToPath}>
            Back to path
          </button>
        </article>
      </section>
    )
  }

  return (
    <section className="screen-stack">
      <article className="card story-interests-card">
        <button className="back-button" type="button" onClick={onBackToPath}>
          Back to path
        </button>
        {step === 'interests' ? (
          <>
            <header className="story-screen-head">
              <p className="eyebrow">Story Mode · Step 1 of 2</p>
              <h1>Choose your adventure</h1>
              <p className="lead">
                Pick up to {MAX_INTERESTS} themes — or skip them and we will surprise you with one — and we will weave
                your math review into an endless, AI-narrated adventure you steer. The questions come straight from
                lessons you have already completed.
              </p>
            </header>
            <p className="story-note story-reassure">
              Same math, same grading — just wrapped in a story. Your progress and mastery never change here.
            </p>

            <fieldset className="interest-fieldset">
              <legend className="story-legend">
                <span>Interests</span>
                <span className="story-legend-hint">
                  {selected.length > 0 ? `${selected.length} of ${MAX_INTERESTS} chosen` : `up to ${MAX_INTERESTS}, or skip`}
                </span>
              </legend>
              <div className="interest-grid">
                {INTEREST_CATALOG.map((interest) => {
                  const isSelected = selected.includes(interest.id)
                  const atLimit = !isSelected && selected.length >= MAX_INTERESTS
                  return (
                    <button
                      key={interest.id}
                      type="button"
                      className={`interest-card ${isSelected ? 'is-selected' : ''}`}
                      aria-pressed={isSelected}
                      disabled={atLimit || busy}
                      onClick={() => toggle(interest.id)}
                    >
                      <span className="interest-emoji" aria-hidden="true">
                        {interest.emoji}
                      </span>
                      <span className="interest-label">{interest.label}</span>
                      {isSelected && (
                        <span className="interest-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="interest-fieldset custom-interest-fieldset">
              <legend className="story-legend">
                <span>
                  Add your own <span className="story-freeform-optional">(optional)</span>
                </span>
                <span className="story-legend-hint">
                  {customInterests.length > 0
                    ? `${customInterests.length} of ${MAX_CUSTOM_INTERESTS} added`
                    : `add up to ${MAX_CUSTOM_INTERESTS}`}
                </span>
              </legend>

              <p className="story-note">
                Type anything you love — a hobby, place, or topic — and add it as a tag we
                will weave in alongside the themes above.
              </p>

              {customInterests.length > 0 && (
                <ul className="custom-interest-list">
                  {customInterests.map((interest) => (
                    <li key={interest} className="custom-interest-chip">
                      <span className="custom-interest-chip-label">{interest}</span>
                      <button
                        type="button"
                        className="custom-interest-remove"
                        aria-label={`Remove ${interest}`}
                        disabled={busy}
                        onClick={() => removeCustomInterest(interest)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path
                            d="M7 7l10 10M17 7L7 17"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {atInterestLimit ? (
                <p className="story-note">You’ve added the maximum of {MAX_CUSTOM_INTERESTS} custom interests.</p>
              ) : (
                <div className="custom-interest-add">
                  <div className="custom-interest-add-row">
                    <input
                      type="text"
                      className="custom-interest-input"
                      maxLength={MAX_CUSTOM_INTEREST_LENGTH}
                      placeholder="e.g. dinosaurs, skateboarding"
                      value={interestDraft}
                      disabled={busy}
                      aria-label="Add a custom interest"
                      aria-invalid={interestError ? true : undefined}
                      aria-describedby={interestError ? 'custom-interest-error' : undefined}
                      onChange={(event) => {
                        setInterestDraft(event.target.value)
                        if (interestError) setInterestError('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addCustomInterest()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="custom-interest-add-button"
                      disabled={busy}
                      onClick={addCustomInterest}
                    >
                      Add
                    </button>
                  </div>
                  {interestError && (
                    <p className="character-error" id="custom-interest-error" role="alert">
                      {interestError}
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            <div className="story-step-actions">
              <button
                className="primary-action"
                type="button"
                disabled={busy}
                onClick={() => setStep('cast')}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <header className="story-screen-head">
              <p className="eyebrow">Story Mode · Step 2 of 2</p>
              <h1>Build your cast</h1>
              <p className="lead">
                Add people to your story and choose who the hero is — all optional except picking who stars.
              </p>
            </header>

            <fieldset className="interest-fieldset character-fieldset">
              <legend className="story-legend">
                <span>
                  Characters <span className="story-freeform-optional">(optional)</span>
                </span>
                <span className="story-legend-hint">
                  {characters.length > 0
                    ? `${characters.length} of ${MAX_CUSTOM_CHARACTERS} added`
                    : `add up to ${MAX_CUSTOM_CHARACTERS} friends or family`}
                </span>
              </legend>

              <p className="story-note">
                Add people to weave into your adventure — a name is all you need, with an optional
                personality and how you know them.
              </p>

              {characters.length > 0 && (
                <ul className="character-list">
                  {characters.map((character) => (
                    <li key={character.id} className="character-chip">
                      <div className="character-chip-copy">
                        <span className="character-chip-name">{character.name}</span>
                        {(character.personalityId || character.backstoryId) && (
                          <span className="character-chip-tags">
                            {character.personalityId && (
                              <span className="character-chip-tag">
                                {getPersonalityLabel(character.personalityId)}
                              </span>
                            )}
                            {character.backstoryId && (
                              <span className="character-chip-tag">
                                {getBackstoryLabel(character.backstoryId)}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="character-remove"
                        aria-label={`Remove ${character.name}`}
                        disabled={busy}
                        onClick={() => removeCharacter(character.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {atCharacterLimit ? (
                <p className="story-note">You’ve added the maximum of {MAX_CUSTOM_CHARACTERS} characters.</p>
              ) : (
                <div className="character-add">
                  <div className="character-add-fields">
                    <label className="character-field character-field-name">
                      <span>Name</span>
                      <input
                        type="text"
                        maxLength={MAX_CHARACTER_NAME_LEN}
                        placeholder="e.g. Maya"
                        value={draftName}
                        disabled={busy}
                        aria-invalid={characterError ? true : undefined}
                        aria-describedby={characterError ? 'character-add-error' : undefined}
                        onChange={(event) => {
                          setDraftName(event.target.value)
                          if (characterError) setCharacterError('')
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addCharacter()
                          }
                        }}
                      />
                    </label>
                    <label className="character-field">
                      <span>Personality</span>
                      <select
                        value={draftPersonality}
                        disabled={busy}
                        onChange={(event) => setDraftPersonality(event.target.value)}
                      >
                        <option value="">Any</option>
                        {CHARACTER_PERSONALITIES.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="character-field">
                      <span>Relationship</span>
                      <select
                        value={draftBackstory}
                        disabled={busy}
                        onChange={(event) => setDraftBackstory(event.target.value)}
                      >
                        <option value="">Any</option>
                        {CHARACTER_BACKSTORIES.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="character-add-button"
                      disabled={busy}
                      onClick={addCharacter}
                    >
                      Add
                    </button>
                  </div>
                  {characterError && (
                    <p className="character-error" id="character-add-error" role="alert">
                      {characterError}
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            <fieldset className="interest-fieldset character-main-fieldset">
              <legend className="story-legend">
                <span>Main character</span>
              </legend>
              <div className="character-main-options">
                {MAIN_CHARACTER_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`character-main-option ${
                      mainCharacterSource === option.value ? 'is-selected' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="story-main-character"
                      value={option.value}
                      checked={mainCharacterSource === option.value}
                      disabled={busy}
                      onChange={() => {
                        setMainCharacterSource(option.value)
                        setMainNameError('')
                      }}
                    />
                    <span className="character-main-label">{option.label}</span>
                    <span className="character-main-hint">{option.hint}</span>
                  </label>
                ))}
              </div>
              {mainCharacterSource === 'custom' && (
                <label className="story-freeform character-main-custom">
                  <span>Main character name</span>
                  <input
                    type="text"
                    maxLength={MAX_CHARACTER_NAME_LEN}
                    placeholder="e.g. Captain Maya"
                    value={mainCharacterName}
                    disabled={busy}
                    aria-invalid={mainNameError ? true : undefined}
                    aria-describedby={mainNameError ? 'main-character-error' : undefined}
                    onChange={(event) => {
                      setMainCharacterName(event.target.value)
                      if (mainNameError) setMainNameError('')
                    }}
                  />
                  {mainNameError && (
                    <span className="character-error" id="main-character-error" role="alert">
                      {mainNameError}
                    </span>
                  )}
                </label>
              )}
            </fieldset>

            {error && (
              <p className="feedback bad" role="alert" aria-live="assertive">
                {error}
              </p>
            )}

            <div className="story-step-actions">
              <button
                className="story-step-back"
                type="button"
                disabled={busy}
                onClick={() => setStep('interests')}
              >
                Back
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={busy}
                onClick={handleBegin}
              >
                {busy ? 'Starting your adventure…' : noInterestsChosen ? 'Surprise me' : 'Begin adventure'}
              </button>
            </div>
          </>
        )}
      </article>
    </section>
  )
}
