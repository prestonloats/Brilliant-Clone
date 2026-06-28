// Hidden story-bible (plan) + meaningful-choice proof.
//
// The "story feels like it goes nowhere" fix gives every adventure a HIDDEN planning document (a
// "story bible") the LLM writes at session start and REVISES at each checkpoint, plus stronger,
// course-changing checkpoint choices. The controller is a React hook with no DOM harness, so the
// PURE seams it relies on are proven here without any LLM:
//   - the bible prompt builder (CREATE vs REVISE modes) asks for the right private, novel-shaped plan;
//   - the narrative beat builders thread the plan in as PRIVATE author's notes when present, and
//     behave EXACTLY as before when it is absent (back-compat);
//   - the meaningful-choice + storytelling rules ride the right beats (and never the outcome's
//     no-choice beat or the math-only re-theme);
//   - the reducer's `setStoryBible` trims/caps/clears the field with no `undefined` leaks; and
//   - `normalizeStorySession` round-trips the plan (kept + capped) and omits it for legacy sessions.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'
import type { StorySession, StoryTheme } from '../src/domain'
import {
  CALL_TO_ACTION_RULE,
  MEANINGFUL_CHOICE_RULE,
  OUTCOME_NO_CHOICE_RULE,
  STORY_BIBLE_SECRECY_NOTE,
  STORY_BIBLE_WORD_TARGET,
  STORY_CRAFT_RULE,
  buildContinuePrompt,
  buildRethemePrompt,
  buildSegmentPrompt,
  buildStartStoryPrompt,
  buildStoryBiblePrompt,
} from '../src/story/storyPrompts'
import {
  STORY_BIBLE_MAX_LENGTH,
  createInitialSession,
  setStoryBible,
} from '../src/story/storySessionReducer'

const theme: StoryTheme = {
  interestIds: ['space', 'fantasy'],
  freeformInterest: 'dragons',
  premise: 'A young pilot guards a fragile peace between sky-dragons and a star city.',
  protagonist: 'Captain Vega',
}

const SAMPLE_BIBLE = [
  'LOGLINE & CENTRAL QUESTION: Can Vega keep the peace without betraying the dragons?',
  'WORLD & RULES: The city secretly runs on dragon-fire it does not pay for.',
  'CHARACTERS & ARCS: Vega learns to trust; the mayor hides a betrayal.',
  'PLOT OUTLINE: setup (hopeful) -> a midpoint twist -> a low point (sad) -> climax (triumphant).',
  'NEXT STEPS: a choice between warning the dragons or protecting the city.',
].join('\n')

// --- buildStoryBiblePrompt: CREATE mode (no prior plan) ----------------------------------------

test('buildStoryBiblePrompt (create) asks for a hidden, novel-shaped plan with all the sections', () => {
  const prompt = buildStoryBiblePrompt({
    theme,
    currentBible: '',
    recentNarrative: 'Vega lands as alarms blare over the docking bay.',
  })

  // It is explicitly the private author plan, never shown to the reader.
  assert.match(prompt, /private/i)
  assert.match(prompt, /NEVER shown to the reader/i)
  assert.match(prompt, /story bible/i)
  // It reads like a novel: arc, twists, growth, and emotional beats (happy + sad).
  assert.match(prompt, /novel/i)
  assert.match(prompt, /character growth/i)
  assert.match(prompt, /sad/i)
  // Every planned section is requested.
  assert.match(prompt, /LOGLINE & CENTRAL QUESTION/)
  assert.match(prompt, /THEMES/)
  assert.match(prompt, /WORLD & RULES/)
  assert.match(prompt, /SECRETS/)
  assert.match(prompt, /CHARACTERS & ARCS/)
  assert.match(prompt, /PLOT OUTLINE/)
  assert.match(prompt, /TWISTS/)
  assert.match(prompt, /climax/i)
  assert.match(prompt, /emotional tone/i)
  assert.match(prompt, /FORESHADOWING & OPEN THREADS/)
  assert.match(prompt, /NEXT STEPS/)
  // It is grounded in the story so far + interests + the bounded length target.
  assert.match(prompt, /Vega lands as alarms blare/)
  assert.match(prompt, /space, fantasy/)
  assert.ok(prompt.includes(STORY_BIBLE_WORD_TARGET))
  // Create mode is NOT a revision (no current plan to fold in).
  assert.equal(/CURRENT STORY PLAN/.test(prompt), false)
  assert.equal(/The reader just chose to/.test(prompt), false)
})

// --- buildStoryBiblePrompt: REVISE mode (prior plan present) -----------------------------------

test('buildStoryBiblePrompt (revise) folds in events + the choice, branches, and advances the arc', () => {
  const prompt = buildStoryBiblePrompt({
    theme,
    currentBible: SAMPLE_BIBLE,
    recentNarrative: 'Vega discovered the mayor lied about the dragon-fire.',
    userChoice: 'I warn the dragons even if the city falls into the dark',
    questionsSolved: 15,
  })

  // The current plan is shown for revision, verbatim.
  assert.match(prompt, /CURRENT STORY PLAN/)
  assert.ok(prompt.includes(SAMPLE_BIBLE))
  // The recent events + the reader's exact choice are both present so the plan can branch to them.
  assert.match(prompt, /Vega discovered the mayor lied/)
  assert.match(prompt, /I warn the dragons even if the city falls into the dark/)
  // The three core revision instructions: stay true, branch to the choice, advance the story.
  assert.match(prompt, /Stay TRUE/i)
  assert.match(prompt, /do not contradict/i)
  assert.match(prompt, /BRANCH/)
  assert.match(prompt, /lasting impact/i)
  assert.match(prompt, /ADVANCE/)
  // It keeps the same structure and re-points NEXT STEPS at the next big decision.
  assert.match(prompt, /SAME labeled section structure/i)
  assert.match(prompt, /NEXT STEPS/)
  assert.match(prompt, /course-changing decision/i)
  assert.ok(prompt.includes(STORY_BIBLE_WORD_TARGET))
})

test('buildStoryBiblePrompt (revise) omits the choice line when no choice is supplied', () => {
  const prompt = buildStoryBiblePrompt({ theme, currentBible: SAMPLE_BIBLE, recentNarrative: 'Time passes.' })
  assert.equal(/The reader just chose to/.test(prompt), false)
  // It is still a revision (current plan present), not a fresh create.
  assert.match(prompt, /CURRENT STORY PLAN/)
})

// --- the plan threads into narrative beats as PRIVATE notes (and only when present) ------------

test('the hidden plan is injected into segment + continue beats as private, secret author notes', () => {
  const segment = buildSegmentPrompt({ theme, recentNarrative: 'A storm rolls in.', questionsSolved: 5, storyBible: SAMPLE_BIBLE })
  const cont = buildContinuePrompt({ theme, recentNarrative: 'A storm rolls in.', userChoice: 'fly higher', storyBible: SAMPLE_BIBLE })

  for (const prompt of [segment, cont]) {
    // The secrecy framing rides with the plan...
    assert.ok(prompt.includes(STORY_BIBLE_SECRECY_NOTE))
    // ...and the plan text itself is included for the model to follow.
    assert.ok(prompt.includes(SAMPLE_BIBLE))
  }
  // The secrecy note keeps the plan PRIVATE and forbids leaking its twists to the reader.
  assert.match(STORY_BIBLE_SECRECY_NOTE, /PRIVATE/)
  assert.match(STORY_BIBLE_SECRECY_NOTE, /SECRET/)
  assert.match(STORY_BIBLE_SECRECY_NOTE, /do NOT copy it out/i)
  assert.match(STORY_BIBLE_SECRECY_NOTE, /reveal/i)
})

test('with no plan, the narrative beats behave EXACTLY as before (no plan/secrecy lines)', () => {
  const segment = buildSegmentPrompt({ theme, recentNarrative: 'A storm rolls in.', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme, recentNarrative: 'A storm rolls in.', userChoice: 'fly higher' })
  const start = buildStartStoryPrompt(theme)
  for (const prompt of [segment, cont, start]) {
    assert.equal(prompt.includes(STORY_BIBLE_SECRECY_NOTE), false)
    assert.equal(/STORY PLAN \(PRIVATE/.test(prompt), false)
  }
})

test('the hidden plan never leaks into the math-only question re-theme', () => {
  // The re-theme is a short scene wrapper around a math problem; it must not carry plan secrets.
  const retheme = buildRethemePrompt({
    theme,
    recentNarrative: 'You reach a locked hatch.',
    stepType: 'input',
    prompt: 'Solve for x.',
  })
  assert.equal(retheme.includes(STORY_BIBLE_SECRECY_NOTE), false)
  assert.equal(/STORY PLAN \(PRIVATE/.test(retheme), false)
})

// --- meaningful, course-changing choices ------------------------------------------------------

test('MEANINGFUL_CHOICE_RULE demands a big, course-changing crossroads with real stakes', () => {
  assert.match(MEANINGFUL_CHOICE_RULE, /MEANINGFUL CHOICE/)
  assert.match(MEANINGFUL_CHOICE_RULE, /crossroads/i)
  assert.match(MEANINGFUL_CHOICE_RULE, /different/i)
  assert.match(MEANINGFUL_CHOICE_RULE, /stakes/i)
  assert.match(MEANINGFUL_CHOICE_RULE, /trade-offs/i)
  // It explicitly bans the tiny "no real consequence" either/or that made the story feel static.
  assert.match(MEANINGFUL_CHOICE_RULE, /trivial/i)
  assert.match(MEANINGFUL_CHOICE_RULE, /no obvious/i)
  // Still answerable in free text + age-appropriate.
  assert.match(MEANINGFUL_CHOICE_RULE, /free text/i)
  assert.match(MEANINGFUL_CHOICE_RULE, /age-appropriate/i)
})

test('the meaningful-choice rule rides the choice-posing beats (opening + checkpoint) only', () => {
  const start = buildStartStoryPrompt(theme)
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'go left' })

  // The opening and the checkpoint bridge both POSE a choice, so both carry it (alongside the CTA).
  assert.ok(start.includes(MEANINGFUL_CHOICE_RULE))
  assert.ok(start.includes(CALL_TO_ACTION_RULE))
  assert.ok(segment.includes(MEANINGFUL_CHOICE_RULE))
  assert.ok(segment.includes(CALL_TO_ACTION_RULE))
  // The OUTCOME beat resolves a choice (no new one), so it must NOT carry either choice rule.
  assert.equal(cont.includes(MEANINGFUL_CHOICE_RULE), false)
  assert.equal(cont.includes(CALL_TO_ACTION_RULE), false)
  assert.ok(cont.includes(OUTCOME_NO_CHOICE_RULE))
})

test('the opening still orders hook -> background -> CTA, with the meaningful-choice refinement after it', () => {
  const start = buildStartStoryPrompt(theme)
  const ctaIdx = start.indexOf(CALL_TO_ACTION_RULE)
  const choiceIdx = start.indexOf(MEANINGFUL_CHOICE_RULE)
  assert.ok(ctaIdx >= 0 && choiceIdx >= 0)
  assert.ok(ctaIdx < choiceIdx, 'the meaningful-choice rule refines the CTA, so it comes right after it')
})

// --- storytelling / novel-craft rule ----------------------------------------------------------

test('STORY_CRAFT_RULE pushes novel-quality writing and rides the prose beats', () => {
  assert.match(STORY_CRAFT_RULE, /STORYTELLING/)
  assert.match(STORY_CRAFT_RULE, /novel/i)
  assert.match(STORY_CRAFT_RULE, /grow and change/i)
  assert.match(STORY_CRAFT_RULE, /twists/i)
  assert.match(STORY_CRAFT_RULE, /emotional/i)
  assert.match(STORY_CRAFT_RULE, /sad/i)

  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'go left' })
  assert.ok(segment.includes(STORY_CRAFT_RULE), 'the checkpoint beat should read like a novel')
  assert.ok(cont.includes(STORY_CRAFT_RULE), 'the outcome beat should read like a novel')
})

// --- reducer: setStoryBible -------------------------------------------------------------------

const baseSession = (): StorySession => createInitialSession(theme, 'user-1', '2026-06-27T00:00:00.000Z', 'story-1')

test('setStoryBible stores the trimmed plan and bumps updatedAt', () => {
  const session = baseSession()
  const next = setStoryBible(session, `  ${SAMPLE_BIBLE}  `, '2026-06-27T01:00:00.000Z')
  assert.equal(next.storyBible, SAMPLE_BIBLE)
  assert.equal(next.updatedAt, '2026-06-27T01:00:00.000Z')
  // Pure: the input session is never mutated.
  assert.equal('storyBible' in session, false)
})

test('setStoryBible caps the plan at STORY_BIBLE_MAX_LENGTH', () => {
  const huge = 'x'.repeat(STORY_BIBLE_MAX_LENGTH + 5000)
  const next = setStoryBible(baseSession(), huge)
  assert.ok(next.storyBible)
  assert.ok((next.storyBible ?? '').length <= STORY_BIBLE_MAX_LENGTH)
})

test('setStoryBible with an empty/whitespace plan clears the key entirely (no undefined leak)', () => {
  const withPlan = setStoryBible(baseSession(), SAMPLE_BIBLE)
  assert.equal(withPlan.storyBible, SAMPLE_BIBLE)
  const cleared = setStoryBible(withPlan, '   ')
  assert.equal('storyBible' in cleared, false)
})

test('setStoryBible is a no-op when clearing an already-absent plan', () => {
  const session = baseSession()
  const next = setStoryBible(session, '')
  assert.equal(next, session)
})

// --- persistence: normalizeStorySession round-trips the plan ----------------------------------

const persistBase = { id: 'story-bible', userId: 'user-1' }

test('a session WITH a storyBible round-trips the plan', () => {
  const session = normalizeStorySession({ ...persistBase, storyBible: SAMPLE_BIBLE })
  assert.ok(session)
  assert.equal(session.storyBible, SAMPLE_BIBLE)
})

test('a session WITHOUT a storyBible omits the key (legacy round-trip identity)', () => {
  const session = normalizeStorySession({ ...persistBase })
  assert.ok(session)
  assert.equal('storyBible' in session, false)
})

test('a non-string or blank storyBible is dropped (key omitted)', () => {
  for (const bad of [42, {}, [], '   ', '', null]) {
    const session = normalizeStorySession({ ...persistBase, storyBible: bad })
    assert.ok(session)
    assert.equal('storyBible' in session, false, `storyBible ${JSON.stringify(bad)} should be omitted`)
  }
})

test('an over-long storyBible is capped on read', () => {
  const huge = 'y'.repeat(STORY_BIBLE_MAX_LENGTH + 9000)
  const session = normalizeStorySession({ ...persistBase, storyBible: huge })
  assert.ok(session)
  assert.ok((session.storyBible ?? '').length <= STORY_BIBLE_MAX_LENGTH)
})
