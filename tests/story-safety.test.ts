// Teen-safety helpers and provider-agnostic call helpers (plan 5.4-5.6).
//
// These cover the PURE, network-free logic: input sanitization, the profanity/abuse
// filter, output moderation, the RethemeResult JSON parser/validator, the timeout race,
// quota detection, and the exponential-backoff + graceful-fallback wrappers. The model
// adapters stay thin so all testable logic lives here; NO real network/SDK calls happen.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { StoryTheme } from '../src/domain'
import type { RethemeRequest } from '../src/story/storyAi'
import {
  MAX_RAW_INPUT_LENGTH,
  MAX_USER_INPUT_LENGTH,
  containsProfanity,
  containsUnsafeContent,
  isOutputSafe,
  moderateOutput,
  moderateUserInput,
  sanitizeUserInput,
} from '../src/story/safety'
import {
  CALL_TO_ACTION_RULE,
  COMMITTED_PATH_RULE,
  GROUNDED_WORLD_RULE,
  HOOK_RULE,
  IMAGINATIVE_WORLD_RULE,
  NARRATION_LENGTH_RULE,
  OPENING_BACKGROUND_RULE,
  OUTCOME_NO_CHOICE_RULE,
  RETHEME_CONTINUITY_RULE,
  SECOND_PERSON_RULE,
  SINGLE_THREAD_RULE,
  SYSTEM_PREAMBLE,
  THEME_FIDELITY_RULE,
  UNTRUSTED_CHARACTER_NOTE,
  buildContinuePrompt,
  buildRethemePrompt,
  buildSegmentPrompt,
  buildStartStoryPrompt,
  buildSummarizePrompt,
  callWithBackoff,
  isQuotaError,
  parseRethemeResult,
  withTimeout,
} from '../src/story/storyPrompts'
import { isGroundedInterestSet, isImaginativeInterest } from '../src/story/interests'

const delay = <T>(ms: number, value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

const theme: StoryTheme = {
  interestIds: ['space', 'fashion'],
  freeformInterest: 'lighthouses',
  premise: 'A young engineer repairs orbital lighthouses for lost cargo ships.',
  protagonist: 'Mira the beacon-keeper',
}

// --- sanitizeUserInput -------------------------------------------------------

test('sanitizeUserInput caps length to ~200 chars', () => {
  const out = sanitizeUserInput('a'.repeat(500))
  assert.equal(out.length, MAX_USER_INPUT_LENGTH)
})

test('sanitizeUserInput bounds pathological input quickly (no ReDoS) and still caps output', () => {
  // A long run of domain-like text with no terminating dot is the worst case for the URL/domain
  // strippers; with the raw-length guard it must finish promptly and still return <= maxLength.
  const hostile = 'a-'.repeat(2_000_000) // 4M chars, far above MAX_RAW_INPUT_LENGTH
  const started = Date.now()
  const out = sanitizeUserInput(hostile)
  assert.ok(Date.now() - started < 1000, 'sanitize should not hang on hostile input')
  assert.ok(out.length <= MAX_USER_INPUT_LENGTH)
  assert.ok(MAX_RAW_INPUT_LENGTH >= MAX_USER_INPUT_LENGTH)
})

test('sanitizeUserInput strips control characters', () => {
  const out = sanitizeUserInput('open\u0000 the\u0007 hatch\u001F now')
  assert.match(out, /open the hatch now/)
  // eslint-disable-next-line no-control-regex
  assert.equal(/[\u0000-\u001F\u007F-\u009F]/.test(out), false)
})

test('sanitizeUserInput strips URLs and bare domains', () => {
  const out = sanitizeUserInput('go to http://evil.example/x and www.bad.org and plain phishy.com please')
  assert.equal(/https?:\/\//i.test(out), false)
  assert.equal(/www\./i.test(out), false)
  assert.equal(/\.org/i.test(out), false)
  assert.equal(/\.com/i.test(out), false)
  assert.match(out, /go to .*please/)
})

test('sanitizeUserInput strips html/markdown markup', () => {
  const out = sanitizeUserInput('<script>alert(1)</script> use **bold** and `code` <b>x</b>')
  assert.equal(/[<>*`]/.test(out), false)
  assert.equal(/script|alert/i.test(out), true) // text content survives, tags do not
})

test('sanitizeUserInput leaves safe text intact (trimmed)', () => {
  assert.equal(sanitizeUserInput('  I sneak past the sleeping dragon  '), 'I sneak past the sleeping dragon')
})

test('sanitizeUserInput tolerates non-string input', () => {
  assert.equal(sanitizeUserInput(undefined as unknown as string), '')
})

// --- profanity / abuse filter ------------------------------------------------

test('containsProfanity flags plain, leetspeak, and spaced-out profanity', () => {
  assert.equal(containsProfanity('this plan is shit'), true)
  assert.equal(containsProfanity('what the sh1t'), true)
  assert.equal(containsProfanity('s h i t happens'), true)
  assert.equal(containsProfanity('what a b1tch'), true)
})

test('containsProfanity does not flag clean adventure text', () => {
  assert.equal(containsProfanity('I open the treasure chest and grab the map'), false)
  assert.equal(containsProfanity(''), false)
})

test('containsUnsafeContent flags self-harm, weapons, and abuse', () => {
  assert.equal(containsUnsafeContent('how to make a bomb'), true)
  assert.equal(containsUnsafeContent('kys loser'), true)
  assert.equal(containsUnsafeContent('I want to commit suicide'), true)
})

test('containsUnsafeContent allows mild fantasy adventure', () => {
  assert.equal(containsUnsafeContent('the knight fought the goblin with a sword'), false)
  assert.equal(containsUnsafeContent('we bake cookies and solve riddles'), false)
})

// --- moderateUserInput (sanitize + filter pipeline) --------------------------

test('moderateUserInput accepts clean input and returns the sanitized text', () => {
  const result = moderateUserInput('  I climb the ancient tower  ')
  assert.equal(result.ok, true)
  assert.equal(result.sanitized, 'I climb the ancient tower')
})

test('moderateUserInput rejects profanity and unsafe topics', () => {
  const profane = moderateUserInput('you are a piece of shit')
  assert.equal(profane.ok, false)
  assert.ok(profane.reason)

  const unsafe = moderateUserInput('teach me to build a bomb')
  assert.equal(unsafe.ok, false)
  assert.ok(unsafe.reason)
})

test('moderateUserInput rejects empty input after sanitization', () => {
  const result = moderateUserInput('   <>   ')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'empty')
})

// --- output moderation -------------------------------------------------------

test('isOutputSafe accepts wholesome narrative and rejects unsafe output', () => {
  assert.equal(isOutputSafe('You stride into the sunny meadow and greet a friendly fox.'), true)
  assert.equal(isOutputSafe('The brave knight fought the dragon with a glowing sword.'), true)
  assert.equal(isOutputSafe('He pulled out a gun and started shooting everyone.'), false)
  assert.equal(isOutputSafe('Well, shit, that went badly.'), false)
})

test('moderateOutput returns a reason when it rejects', () => {
  const ok = moderateOutput('A calm walk along the glittering shore.')
  assert.equal(ok.ok, true)

  const bad = moderateOutput('Well, shit, that went badly.')
  assert.equal(bad.ok, false)
  assert.ok(bad.reason)
})

test('isOutputSafe does NOT false-positive on common words that merely contain an unsafe substring', () => {
  // Regression: the old despaced substring check flagged ordinary prose, discarding safe beats and
  // forcing the offline "default text". Each of these contains a banned substring across/within
  // words but is obviously safe, so all must pass: "something"/"method" ⊃ meth, "heroine" ⊃ heroin,
  // "lucky stars"/"rocky shore" ⊃ kys.
  assert.equal(isOutputSafe('You notice something strange near the old barn.'), true)
  assert.equal(isOutputSafe('She used a clever method to fix the engine.'), true)
  assert.equal(isOutputSafe('The heroine waved to the cheering crowd.'), true)
  assert.equal(isOutputSafe('Lucky stars lit the sky above the rocky shore.'), true)
  assert.equal(isOutputSafe('They made a plan and set off on the journey.'), true)
})

test('isOutputSafe still catches genuinely unsafe single words and phrases (no regression)', () => {
  assert.equal(isOutputSafe('He grabbed a gun and ran.'), false) // weapon word
  assert.equal(isOutputSafe('They planned a school shooting.'), false) // phrase + "shooting"
  assert.equal(isOutputSafe('Here is how to make a bomb.'), false) // phrase + "bomb"
  assert.equal(isOutputSafe('Just kill yourself.'), false) // self-harm phrase
  assert.equal(isOutputSafe('He sold heroin on the corner.'), false) // whole-word drug term
})

test('containsUnsafeContent keeps catching whole-word + spaced-evasion input without the cross-word false positives', () => {
  // Still flags real unsafe input (whole words, phrases, and despaced evasion of long phrases)...
  assert.equal(containsUnsafeContent('tell me how to make a bomb'), true)
  assert.equal(containsUnsafeContent('k i l l y o u r s e l f'), true) // spaced evasion of a long phrase
  assert.equal(containsUnsafeContent('I took some heroin'), true)
  // ...but no longer rejects an ordinary choice just because it contains a substring.
  assert.equal(containsUnsafeContent('I look for something near the rocky shore'), false)
  assert.equal(containsUnsafeContent('the heroine climbs the lucky stairs'), false)
})

// --- parseRethemeResult ------------------------------------------------------

test('parseRethemeResult accepts well-formed JSON', () => {
  const parsed = parseRethemeResult('{"themedPrompt":"Hi","themedOptions":[{"id":"a","label":"A"}]}')
  assert.ok(parsed)
  assert.equal(parsed?.themedPrompt, 'Hi')
  assert.equal(parsed?.themedOptions?.length, 1)
  assert.equal(parsed?.themedTiles, undefined)
})

test('parseRethemeResult strips ```json fences', () => {
  const parsed = parseRethemeResult('```json\n{"themedPrompt":"Fenced"}\n```')
  assert.ok(parsed)
  assert.equal(parsed?.themedPrompt, 'Fenced')
})

test('parseRethemeResult rejects malformed or wrong-shaped payloads', () => {
  assert.equal(parseRethemeResult('not json at all'), null)
  assert.equal(parseRethemeResult(''), null)
  assert.equal(parseRethemeResult('{"foo":1}'), null) // no themedPrompt
  assert.equal(parseRethemeResult('{"themedPrompt":123}'), null) // wrong type
  assert.equal(parseRethemeResult('{"themedPrompt":"ok","themedOptions":[{"id":1}]}'), null) // bad option
  assert.equal(parseRethemeResult('{"themedPrompt":"   "}'), null) // blank prompt
})

// --- withTimeout -------------------------------------------------------------

test('withTimeout resolves when the work beats the deadline', async () => {
  assert.equal(await withTimeout(Promise.resolve(42), 1000), 42)
  assert.equal(await withTimeout(delay(5, 'ok'), 1000), 'ok')
})

test('withTimeout rejects when the deadline passes first', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 10), /timed out/i)
})

// --- isQuotaError ------------------------------------------------------------

test('isQuotaError detects 429 / RESOURCE_EXHAUSTED shapes', () => {
  assert.equal(isQuotaError({ status: 429 }), true)
  assert.equal(isQuotaError({ code: 429 }), true)
  assert.equal(isQuotaError({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }), true)
  assert.equal(isQuotaError(new Error('429 RESOURCE_EXHAUSTED: quota exceeded')), true)
  assert.equal(isQuotaError(new Error('rate limit reached, slow down')), true)
})

test('isQuotaError ignores unrelated errors', () => {
  assert.equal(isQuotaError(new Error('network boom')), false)
  assert.equal(isQuotaError({ status: 500 }), false)
  assert.equal(isQuotaError(null), false)
  assert.equal(isQuotaError(undefined), false)
})

// --- callWithBackoff ---------------------------------------------------------

const makeSleepSpy = () => {
  const delays: number[] = []
  return { delays, sleep: async (ms: number) => void delays.push(ms) }
}

test('callWithBackoff returns immediately on first success', async () => {
  let calls = 0
  const out = await callWithBackoff(async () => {
    calls += 1
    return 'ok'
  })
  assert.equal(out, 'ok')
  assert.equal(calls, 1)
})

test('callWithBackoff retries quota errors then succeeds (deterministic delays)', async () => {
  const { delays, sleep } = makeSleepSpy()
  let calls = 0
  const out = await callWithBackoff(
    async () => {
      calls += 1
      if (calls <= 2) throw { status: 429 }
      return 'recovered'
    },
    { baseDelayMs: 100, retries: 5, sleep, rng: () => 1 },
  )
  assert.equal(out, 'recovered')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [100, 200]) // full-jitter cap = base * 2^attempt with rng()=1
})

test('callWithBackoff gives up after the bounded retry count', async () => {
  const { delays, sleep } = makeSleepSpy()
  let calls = 0
  await assert.rejects(
    () =>
      callWithBackoff(
        async () => {
          calls += 1
          throw { status: 429 }
        },
        { baseDelayMs: 50, retries: 2, sleep, rng: () => 1 },
      ),
    // The last quota error is rethrown unchanged once the retry budget is spent.
    (error: unknown) => {
      assert.deepEqual(error, { status: 429 })
      return true
    },
  )
  assert.equal(calls, 3) // 1 initial + 2 retries
  assert.equal(delays.length, 2)
})

test('callWithBackoff does not retry non-quota errors', async () => {
  const { delays, sleep } = makeSleepSpy()
  let calls = 0
  await assert.rejects(
    () =>
      callWithBackoff(
        async () => {
          calls += 1
          throw new Error('fatal parse error')
        },
        { sleep, retries: 3 },
      ),
    /fatal parse error/,
  )
  assert.equal(calls, 1)
  assert.equal(delays.length, 0)
})

// --- prompt builders ---------------------------------------------------------

test('SYSTEM_PREAMBLE carries the math-preservation and teen-safety rules', () => {
  assert.match(SYSTEM_PREAMBLE, /teen/i)
  assert.match(SYSTEM_PREAMBLE, /age-appropriate/i)
  assert.match(SYSTEM_PREAMBLE, /never/i)
  assert.match(SYSTEM_PREAMBLE, /personal information|personal details/i)
})

test('SYSTEM_PREAMBLE adds strong reading-level / plain-language guidance', () => {
  assert.match(SYSTEM_PREAMBLE, /8th[- ]grade/i)
  assert.match(SYSTEM_PREAMBLE, /reading level/i)
  assert.match(SYSTEM_PREAMBLE, /simple/i)
  assert.match(SYSTEM_PREAMBLE, /everyday words/i)
  assert.match(SYSTEM_PREAMBLE, /short/i)
  assert.match(SYSTEM_PREAMBLE, /sentence/i)
  // Guidance must apply to BOTH the re-themed question text and the narrative.
  assert.match(SYSTEM_PREAMBLE, /question/i)
  assert.match(SYSTEM_PREAMBLE, /narrative/i)
})

test('prompt builders reinforce the simple, age-appropriate reading level', () => {
  const retheme = buildRethemePrompt({
    theme,
    recentNarrative: '',
    stepType: 'input',
    prompt: 'Solve for x.',
  })
  assert.match(retheme, /simple, everyday words/i)
  assert.match(retheme, /8th-grade reading level/i)

  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 10 })
  assert.match(segment, /simple, everyday words/i)
  assert.match(segment, /8th-grade reading level/i)

  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'I open the door' })
  assert.match(cont, /simple, everyday words/i)
  assert.match(cont, /8th-grade reading level/i)

  const start = buildStartStoryPrompt(theme)
  assert.match(start, /simple, everyday words/i)
  assert.match(start, /8th-grade reading level/i)

  const summary = buildSummarizePrompt({ narrative: 'A long adventure.' })
  assert.match(summary, /simple, everyday words/i)
  assert.match(summary, /8th-grade reading level/i)
})

test('buildRethemePrompt includes the original prompt, ids, and theme, and demands matching ids', () => {
  const req: RethemeRequest = {
    theme,
    recentNarrative: 'Mira docked at the broken beacon.',
    stepType: 'mcq',
    prompt: 'Predict the tilt of the scale.',
    options: [
      { id: 'tips-left', label: 'Left drops' },
      { id: 'stays-level', label: 'Stays level' },
    ],
  }
  const prompt = buildRethemePrompt(req)
  assert.match(prompt, /Predict the tilt of the scale\./)
  assert.match(prompt, /tips-left/)
  assert.match(prompt, /stays-level/)
  assert.match(prompt, /Mira the beacon-keeper/)
  assert.match(prompt, /same ids/i)
})

test('buildRethemePrompt lists tiles for sequence steps', () => {
  const req: RethemeRequest = {
    theme,
    recentNarrative: '',
    stepType: 'sequence',
    prompt: 'Order the steps.',
    tiles: [
      { id: 'a', label: 'Subtract 1' },
      { id: 'b', label: 'x = 5' },
    ],
  }
  const prompt = buildRethemePrompt(req)
  assert.match(prompt, /\ba\b/)
  assert.match(prompt, /\bb\b/)
})

// --- re-theme chronological continuity ---------------------------------------

test('RETHEME_CONTINUITY_RULE frames the question as the NEXT chronological step in the adventure', () => {
  // The re-themed question must read as the next moment in the ongoing story (continuing the
  // timeline from the story so far), not a loosely-themed standalone riddle.
  assert.match(RETHEME_CONTINUITY_RULE, /continuity/i)
  assert.match(RETHEME_CONTINUITY_RULE, /next moment in the ongoing adventure/i)
  assert.match(RETHEME_CONTINUITY_RULE, /story so far/i)
  assert.match(RETHEME_CONTINUITY_RULE, /right now/i)
  // It must ADVANCE the adventure forward in chronological / causal order.
  assert.match(RETHEME_CONTINUITY_RULE, /advance the adventure forward/i)
  assert.match(RETHEME_CONTINUITY_RULE, /chronological/i)
  assert.match(RETHEME_CONTINUITY_RULE, /causal/i)
  // Same setting / characters, consistent with what just happened.
  assert.match(RETHEME_CONTINUITY_RULE, /same setting/i)
  assert.match(RETHEME_CONTINUITY_RULE, /same characters/i)
  assert.match(RETHEME_CONTINUITY_RULE, /what just happened/i)
  // It must NOT reset, jump away, contradict, or read like a standalone riddle.
  assert.match(RETHEME_CONTINUITY_RULE, /do not reset the scene/i)
  assert.match(RETHEME_CONTINUITY_RULE, /contradict/i)
  assert.match(RETHEME_CONTINUITY_RULE, /standalone riddle/i)
  // Consecutive questions should feel like connected events in one story.
  assert.match(RETHEME_CONTINUITY_RULE, /connected events/i)
  // It is STILL only a short wrapper around the SAME math problem — the math/answer never change.
  assert.match(RETHEME_CONTINUITY_RULE, /same math problem/i)
  assert.match(RETHEME_CONTINUITY_RULE, /do not change the math/i)
  assert.match(RETHEME_CONTINUITY_RULE, /never reveal or work out the answer/i)
})

test('buildRethemePrompt presents the puzzle as the next step in the adventure using the story-so-far', () => {
  const req: RethemeRequest = {
    theme,
    recentNarrative: 'Mira sealed the cracked lens and climbed toward the dark beacon room.',
    stepType: 'mcq',
    prompt: 'Predict the tilt of the scale.',
    options: [
      { id: 'tips-left', label: 'Left drops' },
      { id: 'stays-level', label: 'Stays level' },
    ],
  }
  const prompt = buildRethemePrompt(req)
  // The chronological-continuity rule is embedded verbatim.
  assert.ok(prompt.includes(RETHEME_CONTINUITY_RULE), 're-theme prompt must embed the continuity rule')
  // The rewrite instruction now asks for the NEXT moment in the adventure, continuing the timeline.
  assert.match(prompt, /next moment in the adventure/i)
  assert.match(prompt, /continuing the timeline/i)
  // The story-so-far is offered as the timeline to continue from — no longer just "for tone only".
  assert.match(prompt, /STORY SO FAR/)
  assert.match(prompt, /continue the timeline directly from here/i)
  assert.match(prompt, /Mira sealed the cracked lens/)
  assert.equal(/for tone only/i.test(prompt), false)

  // GUARDRAILS still intact: math identical, exactly the same ids, JSON shape, options preserved.
  assert.match(prompt, /Keep the math identical/i)
  assert.match(prompt, /exactly the same ids/i)
  assert.match(prompt, /same ids/i)
  assert.match(prompt, /Return JSON/i)
  assert.match(prompt, /tips-left/)
  assert.match(prompt, /stays-level/)
  // The re-theme is NOT a story beat, so it must still NOT carry the checkpoint call-to-action.
  assert.equal(prompt.includes(CALL_TO_ACTION_RULE), false)
})

test('the re-theme continuity framing preserves the math / no-answer / reading-level guardrails', () => {
  // The hard math + no-answer + same-meaning + JSON rules live in the system preamble, untouched.
  assert.match(SYSTEM_PREAMBLE, /NEVER change any number/i)
  assert.match(SYSTEM_PREAMBLE, /NEVER reveal, hint at, or compute the answer/i)
  assert.match(SYSTEM_PREAMBLE, /Keep every option\/tile meaning the same/i)
  assert.match(SYSTEM_PREAMBLE, /JSON schema/i)

  // A sequence re-theme keeps tiles + the matching-id rule alongside the new continuity framing,
  // and never receives the custom cast (the continuity rule must not reintroduce cast lines).
  const retheme = buildRethemePrompt({
    theme: themeWithCast,
    recentNarrative: 'The crew reached the locked vault door at the end of the hall.',
    stepType: 'sequence',
    prompt: 'Order the steps.',
    tiles: [
      { id: 'a', label: 'Subtract 1' },
      { id: 'b', label: 'x = 5' },
    ],
  })
  assert.ok(retheme.includes(RETHEME_CONTINUITY_RULE))
  assert.match(retheme, /Keep the math identical/i)
  assert.match(retheme, /exactly the same ids/i)
  assert.match(retheme, /8th-grade reading level/i)
  assert.match(retheme, /Return JSON/i)
  // The cast guardrails are unchanged: the re-theme builder still never gets the custom cast.
  assert.equal(/recurring cast/i.test(retheme), false)
  assert.equal(retheme.includes(UNTRUSTED_CHARACTER_NOTE), false)
  assert.equal(/Maya|Rex|Pip/.test(retheme), false)
})

test('buildContinuePrompt echoes the user choice and keeps the steer-back-safely guardrail', () => {
  const prompt = buildContinuePrompt({
    theme,
    recentNarrative: 'The beacon flickered.',
    userChoice: 'I reroute power to the dish',
  })
  assert.match(prompt, /I reroute power to the dish/)
  assert.match(prompt, /steer back|safe continuation/i)
})

test('buildContinuePrompt HARD-REQUIRES enacting the exact choice as the cause of what happens next', () => {
  // The core fix: the "choose your own adventure" continuation must ACT OUT the reader's exact
  // typed action and make it the direct cause of the next events, with clear consequences — not a
  // generic beat that ignores or only weakly acknowledges the choice.
  const prompt = buildContinuePrompt({
    theme,
    recentNarrative: 'The beacon flickered.',
    userChoice: 'I sneak past the sleeping guards',
  })
  // The exact action is still echoed verbatim so the model anchors on it.
  assert.match(prompt, /I sneak past the sleeping guards/)
  // It must genuinely DRIVE the story and be ENACTED (the hero actually does that exact action).
  assert.match(prompt, /drive what happens next/i)
  assert.match(prompt, /\bENACT\b/)
  assert.match(prompt, /actually do that exact action/i)
  // It must be the direct CAUSE and show specific CONSEQUENCES of that choice.
  assert.match(prompt, /direct cause/i)
  assert.match(prompt, /consequence/i)
  // It must NOT be ignored, only vaguely acknowledged, or swapped for a generic action.
  assert.match(prompt, /do not ignore it/i)
  assert.match(prompt, /vaguely acknowledge/i)
  assert.match(prompt, /generic action/i)
  // And the enacted choice must carry forward into later beats (consistency thread).
  assert.match(prompt, /carries forward/i)
})

test('buildContinuePrompt keeps the steer-back guardrail for empty / unsafe choices', () => {
  // When the controller/adapter hands an empty (rejected) choice, the prompt must NOT act it out;
  // it must steer back safely instead of enacting nothing/garbage.
  const prompt = buildContinuePrompt({ theme, recentNarrative: 'The beacon flickered.', userChoice: '' })
  assert.match(prompt, /do not act it out/i)
  assert.match(prompt, /steer back|safe continuation/i)
  // The enact-the-choice instruction is still present (it is gated on a safe, non-empty choice).
  assert.match(prompt, /\bENACT\b/)
})

test('buildSegmentPrompt keeps later beats consistent with the reader\'s latest choice', () => {
  // Carry-forward: the next checkpoint beat is generated from the continuation text, so it must
  // continue logically from the hero's recent action/choice rather than resetting the thread.
  const segment = buildSegmentPrompt({
    theme,
    recentNarrative: 'You crept into the dark cave and found a glowing map.',
    questionsSolved: 10,
  })
  assert.match(segment, /continue naturally and logically/i)
  assert.match(segment, /choice the reader just made/i)
  assert.match(segment, /do not reset, contradict, or forget/i)
})

test('buildSegmentPrompt and buildStartStoryPrompt and buildSummarizePrompt are well-formed', () => {
  const segment = buildSegmentPrompt({ theme, recentNarrative: 'Mira fixed the lens.', questionsSolved: 10 })
  assert.match(segment, /Mira the beacon-keeper/)
  assert.match(segment, /Mira fixed the lens\./)

  const start = buildStartStoryPrompt(theme)
  assert.match(start, /premise/i)
  assert.match(start, /protagonist/i)
  assert.match(start, /opening/i)

  const summary = buildSummarizePrompt({ narrative: 'A long adventure across the stars.' })
  assert.match(summary, /A long adventure across the stars\./)
  assert.match(summary, /\b\d+\b/) // includes a word cap number
})

// --- call-to-action / decision-point requirement -----------------------------

test('CALL_TO_ACTION_RULE sets up an in-story choice but defers the meta-question to the app', () => {
  // Not a soft suggestion: it must demand the beat END on a decision the reader can type.
  assert.match(CALL_TO_ACTION_RULE, /REQUIRED/)
  assert.match(CALL_TO_ACTION_RULE, /MUST/)
  assert.match(CALL_TO_ACTION_RULE, /call to action/i)
  assert.match(CALL_TO_ACTION_RULE, /\bdecision\b/i)
  // The substance stays: it still sets up an in-story either/or the reader can react to.
  assert.match(CALL_TO_ACTION_RULE, /either\/or/i)
  // The choice has to be concrete/grounded, never a vague "what now?" with nothing to react to.
  assert.match(CALL_TO_ACTION_RULE, /concrete/i)
  assert.match(CALL_TO_ACTION_RULE, /grounded/i)
  // Still open-ended enough for the free-text box.
  assert.match(CALL_TO_ACTION_RULE, /free text/i)
  // FLIPPED: the literal "What do you do next?" is the UI's job now. The rule must explicitly tell
  // the model NOT to print that meta-question (it names the phrase ONLY to forbid tacking it on),
  // and must point out the app already shows it above the input box.
  assert.match(CALL_TO_ACTION_RULE, /do not write the meta-question/i)
  assert.match(CALL_TO_ACTION_RULE, /never tack/i)
  assert.match(CALL_TO_ACTION_RULE, /the app shows/i)
  assert.match(CALL_TO_ACTION_RULE, /input box/i)
})

test('the checkpoint-facing beat builders REQUIRE a CTA, but the outcome beat does NOT', () => {
  // The opening beat and each 5-question checkpoint beat are shown right above the app's
  // "What do you do next?" box, so each must hard-require an in-story decision while leaving the
  // meta-question itself to the UI.
  const segment = buildSegmentPrompt({ theme, recentNarrative: 'Mira fixed the lens.', questionsSolved: 10 })
  const start = buildStartStoryPrompt(theme)

  for (const prompt of [segment, start]) {
    assert.ok(prompt.includes(CALL_TO_ACTION_RULE), 'builder must embed the call-to-action rule')
    assert.match(prompt, /call to action/i)
    assert.match(prompt, /\bdecision\b/i)
    // FLIPPED: each beat must be told NOT to print the app's meta-question (the UI shows it).
    assert.match(prompt, /do not write the meta-question/i)
  }

  // The start prompt scopes the CTA to the JSON "opening" field (not premise/protagonist).
  assert.match(start, /"opening" field only/i)

  // The continue-after-input OUTCOME beat is shown on the outcome page (no choice box, then straight
  // to the next question), so it must NOT pose another choice — it carries the resolution rule.
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'I open the door' })
  assert.equal(cont.includes(CALL_TO_ACTION_RULE), false)
  assert.ok(cont.includes(OUTCOME_NO_CHOICE_RULE))
})

test('strengthening the CTA does not weaken existing math / safety / no-answer guardrails', () => {
  // SYSTEM_PREAMBLE still carries the math-preservation, no-answer, and teen-safety rules.
  assert.match(SYSTEM_PREAMBLE, /NEVER change any number/i)
  assert.match(SYSTEM_PREAMBLE, /NEVER reveal, hint at, or compute the answer/i)
  assert.match(SYSTEM_PREAMBLE, /age-appropriate/i)
  assert.match(SYSTEM_PREAMBLE, /JSON schema/i)

  // The re-theme builder still demands math is kept and the option/tile ids match exactly.
  const retheme = buildRethemePrompt({
    theme,
    recentNarrative: '',
    stepType: 'mcq',
    prompt: 'Solve for x.',
    options: [{ id: 'a', label: 'A' }],
  })
  assert.match(retheme, /Keep the math identical/i)
  assert.match(retheme, /same ids/i)
  assert.match(retheme, /Return JSON/i)
  // The re-theme call is NOT a story beat, so it must NOT get the "what do you do next?" CTA.
  assert.equal(retheme.includes(CALL_TO_ACTION_RULE), false)

  // The continue builder keeps the steer-back-to-safety guardrail alongside the new CTA.
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'I open the door' })
  assert.match(cont, /steer back|safe continuation/i)

  // Reading-level guidance survives in all three checkpoint-facing beats.
  for (const prompt of [
    buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 10 }),
    cont,
    buildStartStoryPrompt(theme),
  ]) {
    assert.match(prompt, /simple, everyday words/i)
    assert.match(prompt, /8th-grade reading level/i)
  }
})

// --- custom characters + main character + opening hook -----------------------

// A theme with a learner-chosen main character AND a custom supporting cast. The last entry has
// a blank name to prove blank cast members are dropped (never produce an empty "; ;" slot).
const themeWithCast: StoryTheme = {
  ...theme,
  mainCharacterSource: 'custom',
  mainCharacterName: 'Captain Nova',
  characters: [
    { id: 'c1', name: 'Maya', backstoryId: 'best-friend', personalityId: 'funny' },
    { id: 'c2', name: 'Rex', backstoryId: 'loyal-pet' },
    { id: 'c3', name: 'Pip', personalityId: 'curious' },
    { id: 'c4', name: '   ' },
  ],
}

test('HOOK_RULE demands an immediate, vivid opening that still grounds the scene', () => {
  // A hard requirement (not a suggestion) for a first-sentence hook.
  assert.match(HOOK_RULE, /REQUIRED/)
  assert.match(HOOK_RULE, /hook/i)
  assert.match(HOOK_RULE, /first sentence/i)
  // The hook must hand off to a grounded scene and stay age-appropriate + simple.
  assert.match(HOOK_RULE, /ground the scene/i)
  assert.match(HOOK_RULE, /age-appropriate/i)
  assert.match(HOOK_RULE, /8th-grade/i)
})

test('buildStartStoryPrompt opens the "opening" beat on a strong HOOK before the CTA', () => {
  const start = buildStartStoryPrompt(theme)
  assert.ok(start.includes(HOOK_RULE), 'start prompt must embed the HOOK_RULE')
  assert.match(start, /STARTS with a strong hook/i)
  // The hook is scoped to the JSON "opening" field, and the beat still ends on the CTA.
  assert.match(start, /"opening" field only/i)
  assert.ok(start.includes(CALL_TO_ACTION_RULE), 'opening must still close on the call to action')
})

test('OPENING_BACKGROUND_RULE requires real premise context (setting, situation, goal/stakes, characters)', () => {
  // A hard requirement (not a suggestion) that the opening explains what is going on.
  assert.match(OPENING_BACKGROUND_RULE, /REQUIRED/)
  assert.match(OPENING_BACKGROUND_RULE, /background/i)
  // It is anchored AFTER the hook (hook stays first).
  assert.match(OPENING_BACKGROUND_RULE, /after the hook/i)
  // It must establish the four kinds of context the reader needs to grasp the premise:
  assert.match(OPENING_BACKGROUND_RULE, /setting|world/i) // setting / world
  assert.match(OPENING_BACKGROUND_RULE, /situation|going on|conflict/i) // the situation / what's happening
  assert.match(OPENING_BACKGROUND_RULE, /goal|quest/i) // the hero's goal / quest
  assert.match(OPENING_BACKGROUND_RULE, /stakes/i) // the stakes
  assert.match(OPENING_BACKGROUND_RULE, /characters/i) // the key characters
  assert.match(OPENING_BACKGROUND_RULE, /\brole\b/i) // and their roles
  // The added richness must NOT weaken the simple, age-appropriate reading level.
  assert.match(OPENING_BACKGROUND_RULE, /8th-grade/i)
  assert.match(OPENING_BACKGROUND_RULE, /age-appropriate/i)
  // Background must stay tight (~2 short paragraphs), not balloon the opening.
  assert.match(OPENING_BACKGROUND_RULE, /2 short paragraphs/i)
  // It must NOT reintroduce the cast-free or meta-question regressions: it deliberately avoids the
  // "recurring cast" trigger phrase and never prints the app's "what do you do next?" question.
  assert.equal(/recurring cast/i.test(OPENING_BACKGROUND_RULE), false)
  assert.equal(/what do you do/i.test(OPENING_BACKGROUND_RULE), false)
})

test('buildStartStoryPrompt enriches the opening with background while keeping hook, CTA, no-meta-question, and JSON shape', () => {
  const start = buildStartStoryPrompt(theme)
  // The background rule is embedded and scoped to the JSON "opening" field only.
  assert.ok(start.includes(OPENING_BACKGROUND_RULE), 'start prompt must embed the OPENING_BACKGROUND_RULE')
  assert.match(start, /"opening" field only/i)
  // The opening field description itself now asks for premise-level background and is a bit longer.
  assert.match(start, /gives clear background/i)
  assert.match(start, /setting\/world/i)
  assert.match(start, /stakes/i)
  assert.match(start, /key characters are and their roles/i)
  assert.match(start, /2 short paragraphs/i)
  // Hook still comes first and is preserved verbatim.
  assert.ok(start.includes(HOOK_RULE))
  assert.match(start, /STARTS with a strong hook/i)
  // The CTA guardrail (and its no-meta-question rule) is preserved.
  assert.ok(start.includes(CALL_TO_ACTION_RULE))
  assert.match(start, /do not write the meta-question/i)
  // The JSON output shape is unchanged.
  assert.match(start, /Return JSON: \{ premise, protagonist, opening \}/)
  // Ordering inside the opening instructions must read hook -> background -> call to action.
  const hookIdx = start.indexOf(HOOK_RULE)
  const bgIdx = start.indexOf(OPENING_BACKGROUND_RULE)
  const ctaIdx = start.indexOf(CALL_TO_ACTION_RULE)
  assert.ok(hookIdx >= 0 && bgIdx >= 0 && ctaIdx >= 0)
  assert.ok(hookIdx < bgIdx && bgIdx < ctaIdx, 'opening must order hook -> background -> call to action')
})

test('the richer opening background does not leak into other builders or weaken cast-free behavior', () => {
  // The background rule is opening-only: the per-checkpoint and continue beats must NOT carry it.
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 10 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'I open the door' })
  assert.equal(segment.includes(OPENING_BACKGROUND_RULE), false)
  assert.equal(cont.includes(OPENING_BACKGROUND_RULE), false)
  // And with no custom cast, the enriched opening still adds no cast/safety lines.
  const start = buildStartStoryPrompt(theme)
  assert.equal(/recurring cast/i.test(start), false)
  assert.equal(start.includes(UNTRUSTED_CHARACTER_NOTE), false)
})

test('narrative builders weave the custom cast in as recurring friends/family', () => {
  const start = buildStartStoryPrompt(themeWithCast)
  const segment = buildSegmentPrompt({ theme: themeWithCast, recentNarrative: '', questionsSolved: 10 })
  const cont = buildContinuePrompt({ theme: themeWithCast, recentNarrative: '', userChoice: 'I open the door' })

  for (const prompt of [start, segment, cont]) {
    assert.match(prompt, /recurring cast/i)
    assert.match(prompt, /friends and family/i)
    // Every named cast member appears.
    assert.match(prompt, /Maya/)
    assert.match(prompt, /Rex/)
    assert.match(prompt, /Pip/)
    // Preset ids are rendered as human labels (lowercased for in-line reading).
    assert.match(prompt, /your best friend/)
    assert.match(prompt, /funny/)
    assert.match(prompt, /a loyal pet/)
    assert.match(prompt, /curious/)
  }
})

test('the custom cast line is well-formed and drops blank-named members', () => {
  const segment = buildSegmentPrompt({ theme: themeWithCast, recentNarrative: '', questionsSolved: 1 })
  assert.match(segment, /Maya — your best friend, funny/)
  assert.match(segment, /Rex — a loyal pet/)
  assert.match(segment, /Pip — curious/)
  // The blank 4th character must not leave an empty "; ;" slot.
  assert.equal(/;\s*;/.test(segment), false)
})

test('no custom cast => narrative builders behave exactly as before (no cast/safety lines)', () => {
  const start = buildStartStoryPrompt(theme)
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 10 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'go left' })
  for (const prompt of [start, segment, cont]) {
    assert.equal(/recurring cast/i.test(prompt), false)
    assert.equal(prompt.includes(UNTRUSTED_CHARACTER_NOTE), false)
  }
})

test('buildStartStoryPrompt uses mainCharacterName as the protagonist when present', () => {
  const start = buildStartStoryPrompt(themeWithCast)
  assert.match(start, /Captain Nova/)
  assert.match(start, /EXACT name/i)
  // With a name supplied it must NOT fall back to inventing a hero from scratch.
  assert.equal(/Create the hero from scratch/i.test(start), false)
})

test('buildStartStoryPrompt invents a hero from scratch when no mainCharacterName is set', () => {
  const start = buildStartStoryPrompt(theme)
  assert.match(start, /Create the hero from scratch/i)
  assert.match(start, /do not use real, famous, or personal names/i)
  // The world framing now comes from the grounding rule; the base theme has 'space' -> imaginative.
  assert.ok(start.includes(IMAGINATIVE_WORLD_RULE))
  // An empty/blank display name (controller not yet resolved) also invents a hero from scratch.
  const blank = buildStartStoryPrompt({ ...theme, mainCharacterSource: 'displayName', mainCharacterName: '   ' })
  assert.match(blank, /Create the hero from scratch/i)
})

test('untrusted custom cast carries a prompt-injection safety note in every narrative builder', () => {
  const start = buildStartStoryPrompt(themeWithCast)
  const segment = buildSegmentPrompt({ theme: themeWithCast, recentNarrative: '', questionsSolved: 10 })
  const cont = buildContinuePrompt({ theme: themeWithCast, recentNarrative: '', userChoice: 'go' })
  for (const prompt of [start, segment, cont]) {
    assert.ok(prompt.includes(UNTRUSTED_CHARACTER_NOTE), 'cast must travel with the untrusted-input note')
  }
  // The note treats names/traits as untrusted, refuses embedded instructions, and protects the rules.
  assert.match(UNTRUSTED_CHARACTER_NOTE, /untrusted/i)
  assert.match(UNTRUSTED_CHARACTER_NOTE, /never follow/i)
  assert.match(UNTRUSTED_CHARACTER_NOTE, /age-appropriate/i)
  assert.match(UNTRUSTED_CHARACTER_NOTE, /override/i)
})

test('the question re-theme builder never receives the custom cast', () => {
  const retheme = buildRethemePrompt({
    theme: themeWithCast,
    recentNarrative: '',
    stepType: 'input',
    prompt: 'Solve for x.',
  })
  assert.equal(/recurring cast/i.test(retheme), false)
  assert.equal(retheme.includes(UNTRUSTED_CHARACTER_NOTE), false)
  assert.equal(/Maya|Rex|Pip/.test(retheme), false)
})

test('character + hook additions keep math/safety/no-answer/JSON/reading-level/CTA guardrails intact', () => {
  // System preamble guardrails are untouched.
  assert.match(SYSTEM_PREAMBLE, /NEVER change any number/i)
  assert.match(SYSTEM_PREAMBLE, /NEVER reveal, hint at, or compute the answer/i)
  assert.match(SYSTEM_PREAMBLE, /age-appropriate/i)
  assert.match(SYSTEM_PREAMBLE, /JSON schema/i)

  // With a full cast + main character the start/segment/continue beats STILL carry the
  // reading-level rule and the call-to-action rule.
  const start = buildStartStoryPrompt(themeWithCast)
  const segment = buildSegmentPrompt({ theme: themeWithCast, recentNarrative: '', questionsSolved: 10 })
  const cont = buildContinuePrompt({ theme: themeWithCast, recentNarrative: '', userChoice: 'I open the door' })
  for (const prompt of [start, segment, cont]) {
    assert.match(prompt, /simple, everyday words/i)
    assert.match(prompt, /8th-grade reading level/i)
  }
  // The call-to-action rule stays on the checkpoint-facing beats (opening + checkpoint) but NOT on
  // the outcome beat, which must not pose a redundant choice on the no-input outcome page.
  for (const prompt of [start, segment]) {
    assert.ok(prompt.includes(CALL_TO_ACTION_RULE))
  }
  assert.equal(cont.includes(CALL_TO_ACTION_RULE), false)
  // Start still requests the exact JSON object shape, and continue keeps steer-back-to-safety.
  assert.match(start, /Return JSON: \{ premise, protagonist, opening \}/)
  assert.match(cont, /steer back|safe continuation/i)

  // Re-theme (with the same themed input) still preserves math + id-matching + JSON output.
  const retheme = buildRethemePrompt({
    theme: themeWithCast,
    recentNarrative: '',
    stepType: 'mcq',
    prompt: 'Solve for x.',
    options: [{ id: 'a', label: 'A' }],
  })
  assert.match(retheme, /Keep the math identical/i)
  assert.match(retheme, /same ids/i)
  assert.match(retheme, /Return JSON/i)
})

// --- second-person narration when the learner stars AS THEMSELVES ('displayName') -------------

// "Use my name": the controller resolves the signed-in learner's name and pins it as the
// protagonist. This is the ONLY case that should switch narration to the second person ("you").
const selfTheme: StoryTheme = {
  ...theme,
  mainCharacterSource: 'displayName',
  mainCharacterName: 'Maya',
  protagonist: 'Maya',
}
// "Surprise me" and "Custom name": the hero is referred to in the third person by their name.
const randomTheme: StoryTheme = { ...theme, mainCharacterSource: 'random' }
const customNameTheme: StoryTheme = {
  ...theme,
  mainCharacterSource: 'custom',
  mainCharacterName: 'Captain Nova',
  protagonist: 'Captain Nova',
}

// Build each per-turn prompt for a given theme so a single theme can be checked across the whole
// session (opening, every question re-theme, each checkpoint beat, and each continue-from-input).
const startOf = (t: StoryTheme): string => buildStartStoryPrompt(t)
const rethemeOf = (t: StoryTheme): string =>
  buildRethemePrompt({ theme: t, recentNarrative: 'You found a locked door.', stepType: 'input', prompt: 'Solve for x.' })
const segmentOf = (t: StoryTheme): string => buildSegmentPrompt({ theme: t, recentNarrative: '', questionsSolved: 5 })
const continueOf = (t: StoryTheme): string => buildContinuePrompt({ theme: t, recentNarrative: '', userChoice: 'go left' })

test('SECOND_PERSON_RULE is a hard second-person ("you") instruction for the hero only', () => {
  assert.match(SECOND_PERSON_RULE, /PERSPECTIVE/)
  assert.match(SECOND_PERSON_RULE, /second person/i)
  assert.match(SECOND_PERSON_RULE, /\byou\b/i)
  // It explicitly forbids third-person-by-name narration of the hero...
  assert.match(SECOND_PERSON_RULE, /never in the third person/i)
  // ...while leaving other characters referred to normally.
  assert.match(SECOND_PERSON_RULE, /only to the main character/i)
})

test("'displayName' (playing as yourself) puts the second-person rule into EVERY per-turn build", () => {
  for (const prompt of [startOf(selfTheme), rethemeOf(selfTheme), segmentOf(selfTheme), continueOf(selfTheme)]) {
    assert.ok(prompt.includes(SECOND_PERSON_RULE), 'every per-turn build must carry the second-person rule')
  }
})

test("'custom' and 'random' main characters keep third-person narration (no second-person rule)", () => {
  for (const t of [customNameTheme, randomTheme]) {
    for (const prompt of [startOf(t), rethemeOf(t), segmentOf(t), continueOf(t)]) {
      assert.equal(prompt.includes(SECOND_PERSON_RULE), false)
    }
  }
  // An unset source (the legacy default) is treated as random too — never second person.
  for (const prompt of [startOf(theme), rethemeOf(theme), segmentOf(theme), continueOf(theme)]) {
    assert.equal(prompt.includes(SECOND_PERSON_RULE), false)
  }
})

test('the displayName start prompt makes the reader the hero while still pinning their name', () => {
  const start = startOf(selfTheme)
  // The hero is reframed AS the reader and addressed as "you"...
  assert.match(start, /the hero is the READER/i)
  assert.ok(start.includes(SECOND_PERSON_RULE))
  // ...but the chosen name is still pinned so the session's protagonist stays the learner's name.
  assert.match(start, /Maya/)
  assert.match(start, /EXACT name/i)
})

test('switching to second person does not weaken the re-theme math / id / JSON guardrails', () => {
  const retheme = rethemeOf(selfTheme)
  assert.match(retheme, /Keep the math identical/i)
  assert.match(retheme, /Return JSON/i)
  // The question itself is now asked in second person, on this and every later question.
  assert.ok(retheme.includes(SECOND_PERSON_RULE))
  // The hard math/no-answer system rules are untouched.
  assert.match(SYSTEM_PREAMBLE, /NEVER change any number/i)
  assert.match(SYSTEM_PREAMBLE, /NEVER reveal, hint at, or compute the answer/i)
})

test('displayName still narrates in second person even when the name was unusable (invented hero)', () => {
  // The controller drops an unusable display name, so the model invents a nameless hero — but the
  // learner is still the "you" of the story.
  const blankSelf = buildStartStoryPrompt({ ...theme, mainCharacterSource: 'displayName', mainCharacterName: '   ' })
  assert.match(blankSelf, /Create the hero from scratch/i)
  assert.ok(blankSelf.includes(SECOND_PERSON_RULE))
})

// --- committing to the chosen branch (never narrating the road not taken) ---------------------

test('COMMITTED_PATH_RULE locks onto the chosen path and forbids narrating the unchosen branch', () => {
  assert.match(COMMITTED_PATH_RULE, /COMMITTED/)
  assert.match(COMMITTED_PATH_RULE, /only the path the reader chose/i)
  // It binds to the recorded-choice marker the recap actually threads in.
  assert.match(COMMITTED_PATH_RULE, /The reader chose to/)
  // It must forbid playing out / revisiting the option(s) the reader did NOT pick...
  assert.match(COMMITTED_PATH_RULE, /did NOT pick|unchosen/)
  assert.match(COMMITTED_PATH_RULE, /did not happen/i)
  assert.match(COMMITTED_PATH_RULE, /do NOT narrate/)
})

test('every continuation/segment/question builder commits to the chosen branch', () => {
  // The bug surfaced on the outcome narration AND on later beats/questions, so all three of the
  // post-choice builders must carry the rule (the start-of-story builder has no prior choice).
  const prompts = [
    buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'cross the bridge' }),
    buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 5 }),
    buildRethemePrompt({ theme, recentNarrative: '', stepType: 'input', prompt: 'Solve for x.' }),
  ]
  for (const prompt of prompts) {
    assert.ok(prompt.includes(COMMITTED_PATH_RULE), 'post-choice builds must commit to the chosen path')
  }
  assert.equal(buildStartStoryPrompt(theme).includes(COMMITTED_PATH_RULE), false)
})

test('after a branch choice the chosen branch + commit rule reach the next narration AND the next question', () => {
  const choice = 'cross the rope bridge'
  // The recap mirrors what the controller threads in: the either/or beat plus the recorded choice.
  const recap = `You reach a split: cross the rope bridge or push through the dark forest.\n\nThe reader chose to: "${choice}"`
  const cont = buildContinuePrompt({ theme, recentNarrative: recap, userChoice: choice })
  const retheme = buildRethemePrompt({ theme, recentNarrative: recap, stepType: 'input', prompt: 'Solve for x.' })
  for (const prompt of [cont, retheme]) {
    // The chosen branch text is present in the prompt context...
    assert.match(prompt, /cross the rope bridge/)
    // ...and the model is told to commit to it (and thus not also narrate the unchosen forest).
    assert.ok(prompt.includes(COMMITTED_PATH_RULE))
  }
})

test('the committed-path rule composes with second person (does not regress it) for displayName', () => {
  // `selfTheme` (mainCharacterSource: 'displayName') is defined with the second-person tests above.
  const cont = buildContinuePrompt({ theme: selfTheme, recentNarrative: '', userChoice: 'climb the tower' })
  assert.ok(cont.includes(COMMITTED_PATH_RULE))
  assert.ok(cont.includes(SECOND_PERSON_RULE))
})

test('adding the committed-path rule keeps the re-theme math / id / JSON guardrails intact', () => {
  const retheme = buildRethemePrompt({
    theme,
    recentNarrative: 'The reader chose to: "take the left tunnel"',
    stepType: 'mcq',
    prompt: 'Solve for x.',
    options: [{ id: 'a', label: 'A' }],
  })
  assert.ok(retheme.includes(COMMITTED_PATH_RULE))
  assert.match(retheme, /Keep the math identical/i)
  assert.match(retheme, /same ids/i)
  assert.match(retheme, /Return JSON/i)
  // The re-theme is still NOT a story beat, so it must not pick up the checkpoint CTA.
  assert.equal(retheme.includes(CALL_TO_ACTION_RULE), false)
})

// --- the "what happens next" OUTCOME beat must not pose a redundant choice -------------------

test('OUTCOME_NO_CHOICE_RULE forbids posing another choice on the outcome ("what happens next") beat', () => {
  assert.match(OUTCOME_NO_CHOICE_RULE, /RESOLUTION/)
  assert.match(OUTCOME_NO_CHOICE_RULE, /result of the choice/i)
  // It must explicitly forbid a fresh decision / new choice / options on this beat.
  assert.match(OUTCOME_NO_CHOICE_RULE, /do NOT end on a new decision/)
  assert.match(OUTCOME_NO_CHOICE_RULE, /do not ask the reader what they do next/i)
  assert.match(OUTCOME_NO_CHOICE_RULE, /either\/or/i)
})

test('the outcome beat resolves the choice WITHOUT asking for a new one, while the checkpoint choice keeps its CTA', () => {
  const cont = buildContinuePrompt({ theme, recentNarrative: 'You chose the bridge.', userChoice: 'cross the bridge' })
  // No call-to-action / new-choice prompt on the outcome beat...
  assert.equal(cont.includes(CALL_TO_ACTION_RULE), false)
  assert.ok(cont.includes(OUTCOME_NO_CHOICE_RULE))
  // ...while the LEGITIMATE checkpoint branching choice (and the opening) still ends on a CTA.
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 5 })
  const start = buildStartStoryPrompt(theme)
  assert.ok(segment.includes(CALL_TO_ACTION_RULE))
  assert.ok(start.includes(CALL_TO_ACTION_RULE))
  // The enact-the-choice + committed-path behaviors are preserved on the outcome beat (no regression).
  assert.match(cont, /ENACT IT/)
  assert.ok(cont.includes(COMMITTED_PATH_RULE))
})

// --- single coherent question thread (no "different options in different questions") ---------

test('SINGLE_THREAD_RULE makes each question continue the SAME thread, not a fresh scenario', () => {
  assert.match(SINGLE_THREAD_RULE, /ONE STORYLINE/)
  assert.match(SINGLE_THREAD_RULE, /next step of the SAME ongoing scene/i)
  // It binds to the previous question's scene that rethemeNarrative threads into the context.
  assert.match(SINGLE_THREAD_RULE, /THE PREVIOUS CHALLENGE/)
  // It explicitly forbids inventing a disconnected set of options per question.
  assert.match(SINGLE_THREAD_RULE, /disconnected set of options/i)
})

test('buildRethemePrompt threads the previous-challenge context AND all three continuity rules', () => {
  // A recap shaped like the one the controller now builds (rethemeNarrative): committed choice +
  // outcome + the previous question's scene.
  const recap =
    'The reader chose to: "open the vault"\n\nYou cracked the first lock.\n\nTHE PREVIOUS CHALLENGE in this same storyline (...): the second rune glows.'
  const retheme = buildRethemePrompt({ theme, recentNarrative: recap, stepType: 'input', prompt: 'Solve for x.' })

  // All three continuity rules ride along so each question stays on the one thread + committed path.
  assert.ok(retheme.includes(RETHEME_CONTINUITY_RULE))
  assert.ok(retheme.includes(SINGLE_THREAD_RULE))
  assert.ok(retheme.includes(COMMITTED_PATH_RULE))
  // The previous-challenge / choice / outcome context flows through into STORY SO FAR.
  assert.match(retheme, /THE PREVIOUS CHALLENGE/)
  assert.match(retheme, /open the vault/)
  assert.match(retheme, /cracked the first lock/)
  // Math / JSON guardrails are untouched, and a question is never given the checkpoint CTA.
  assert.match(retheme, /Keep the math identical/i)
  assert.match(retheme, /Return JSON/i)
  assert.equal(retheme.includes(CALL_TO_ACTION_RULE), false)
})

// --- consistent narration length (~2 short paragraphs, not 1-2 sentences) --------------------

test('NARRATION_LENGTH_RULE pins a concrete ~2-short-paragraph target and forbids under/over-writing', () => {
  assert.match(NARRATION_LENGTH_RULE, /LENGTH/)
  // A concrete target (about 2 short paragraphs, roughly 4-6 sentences) so length stops swinging.
  assert.match(NARRATION_LENGTH_RULE, /2 short paragraphs/i)
  assert.match(NARRATION_LENGTH_RULE, /4 to 6 sentences/i)
  // Explicitly rules out the "very short" 1-sentence output the user reported...
  assert.match(NARRATION_LENGTH_RULE, /do NOT stop after a single sentence/i)
  // ...and the opposite failure of ballooning into a wall of text.
  assert.match(NARRATION_LENGTH_RULE, /do NOT balloon/i)
})

test('the length rule is wired into the three prose beats (opening, checkpoint segment, outcome)', () => {
  const start = buildStartStoryPrompt(theme)
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 10 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'open the door' })
  for (const prompt of [start, segment, cont]) {
    assert.ok(prompt.includes(NARRATION_LENGTH_RULE), 'every prose beat must carry the length target')
  }
})

test('the question re-theme is NOT given the ~2-paragraph rule, only a tight scene floor', () => {
  const retheme = buildRethemePrompt({ theme, recentNarrative: '', stepType: 'input', prompt: 'Solve for x.' })
  // The full 2-paragraph narration rule would bloat a question, so it must NOT be here...
  assert.equal(retheme.includes(NARRATION_LENGTH_RULE), false)
  // ...but it still gets a brief floor so the scene isn't a single bare sentence (and isn't padded).
  assert.match(retheme, /1 to 2 short sentences/i)
  assert.match(retheme, /do not pad it into a long passage/i)
})

// --- theme fidelity: stay strictly within the chosen interest(s), no genre-mixing -----------

test('THEME_FIDELITY_RULE makes the chosen interest the governing frame and forbids unchosen genres', () => {
  assert.match(THEME_FIDELITY_RULE, /INTEREST FIDELITY/)
  assert.match(THEME_FIDELITY_RULE, /chosen interests/i)
  // The chosen interest must dominate; other genres/worlds/settings must not be blended in.
  assert.match(THEME_FIDELITY_RULE, /dominant/i)
  assert.match(THEME_FIDELITY_RULE, /do NOT add, blend in, or drift/i)
  // The user's exact failure: "sports" must stay a real-world sports story, not fantasy/sci-fi sports.
  assert.match(THEME_FIDELITY_RULE, /sports/i)
  assert.match(THEME_FIDELITY_RULE, /real-world sports story/i)
})

test('the theme-fidelity rule is wired into the opening AND every per-beat builder', () => {
  const start = buildStartStoryPrompt(theme)
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'go' })
  const retheme = buildRethemePrompt({ theme, recentNarrative: '', stepType: 'input', prompt: 'Solve for x.' })
  for (const prompt of [start, segment, cont, retheme]) {
    assert.ok(prompt.includes(THEME_FIDELITY_RULE), 'every story builder must carry the theme-fidelity rule')
  }
})

test('every story builder names the chosen interests so the fidelity rule has a concrete anchor', () => {
  // The base theme has interestIds ['space','fashion'] + freeformInterest 'lighthouses'. "fashion"
  // and "lighthouses" appear in NO rule text, so finding them proves the chosen interests are
  // actually threaded into each builder (not just implied by the rule's example list).
  const start = buildStartStoryPrompt(theme)
  const segment = buildSegmentPrompt({ theme, recentNarrative: '', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme, recentNarrative: '', userChoice: 'go' })
  const retheme = buildRethemePrompt({ theme, recentNarrative: '', stepType: 'input', prompt: 'Solve for x.' })
  for (const prompt of [start, segment, cont, retheme]) {
    assert.match(prompt, /fashion/)
    assert.match(prompt, /lighthouses/)
  }
})

// --- world groundedness: grounded interests stay real-world; imaginative ones may invent worlds --

const sportsTheme: StoryTheme = {
  interestIds: ['sports'],
  premise: 'A scrappy team chases the championship.',
  protagonist: 'Coach Lee',
}
const fantasyTheme: StoryTheme = {
  interestIds: ['fantasy'],
  premise: 'A young mage hunts the lost rune.',
  protagonist: 'Wren',
}
const groundedMultiTheme: StoryTheme = {
  interestIds: ['sports', 'cooking', 'mystery'],
  premise: 'A food-truck crew solves a contest mix-up.',
  protagonist: 'Sam',
}
const mixedTheme: StoryTheme = {
  interestIds: ['sports', 'space'],
  premise: 'A zero-g league plays for the crown.',
  protagonist: 'Nova',
}

test('interest groundedness classification: fantasy/space imaginative, the rest grounded', () => {
  assert.equal(isImaginativeInterest('fantasy'), true)
  assert.equal(isImaginativeInterest('space'), true)
  for (const id of ['sports', 'mystery', 'cooking', 'animals', 'pirates', 'fashion'] as const) {
    assert.equal(isImaginativeInterest(id), false, `${id} should be grounded`)
  }
  // A set is grounded only when it contains NO imaginative interest; freeform text doesn't flip it.
  assert.equal(isGroundedInterestSet(['sports']), true)
  assert.equal(isGroundedInterestSet(['sports', 'cooking', 'mystery']), true)
  assert.equal(isGroundedInterestSet(['sports', 'space']), false)
  assert.equal(isGroundedInterestSet(['fantasy']), false)
  assert.equal(isGroundedInterestSet([]), true)
})

test('GROUNDED_WORLD_RULE forbids invented fantastical worlds (the "Sportania" bug)', () => {
  assert.match(GROUNDED_WORLD_RULE, /REAL-WORLD SETTING/)
  assert.match(GROUNDED_WORLD_RULE, /do NOT invent a fantastical or made-up world/i)
  assert.match(GROUNDED_WORLD_RULE, /Sportania/) // the exact made-up-world example to avoid
  assert.match(GROUNDED_WORLD_RULE, /No magic/i)
})

test('IMAGINATIVE_WORLD_RULE allows an invented fictional world for imaginative interests', () => {
  assert.match(IMAGINATIVE_WORLD_RULE, /IMAGINATIVE WORLD/)
  assert.match(IMAGINATIVE_WORLD_RULE, /MAY invent a fictional, imaginative world/i)
})

test('a grounded-only set (sports) gets the real-world rule in EVERY builder, not the imaginative one', () => {
  const start = buildStartStoryPrompt(sportsTheme)
  const segment = buildSegmentPrompt({ theme: sportsTheme, recentNarrative: '', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme: sportsTheme, recentNarrative: '', userChoice: 'go' })
  const retheme = buildRethemePrompt({ theme: sportsTheme, recentNarrative: '', stepType: 'input', prompt: 'Solve for x.' })
  for (const prompt of [start, segment, cont, retheme]) {
    assert.ok(prompt.includes(GROUNDED_WORLD_RULE), 'grounded set must get the real-world rule')
    assert.equal(prompt.includes(IMAGINATIVE_WORLD_RULE), false)
  }
  // The opening no longer blanket-invents a fictional world for a grounded interest.
  assert.equal(/Invent a fictional world/i.test(start), false)
})

test('a multi-interest grounded set (sports + cooking + mystery) is still grounded', () => {
  const start = buildStartStoryPrompt(groundedMultiTheme)
  assert.ok(start.includes(GROUNDED_WORLD_RULE))
  assert.equal(start.includes(IMAGINATIVE_WORLD_RULE), false)
})

test('an imaginative set (fantasy) gets the fictional-world allowance in EVERY builder', () => {
  const start = buildStartStoryPrompt(fantasyTheme)
  const segment = buildSegmentPrompt({ theme: fantasyTheme, recentNarrative: '', questionsSolved: 5 })
  const cont = buildContinuePrompt({ theme: fantasyTheme, recentNarrative: '', userChoice: 'go' })
  const retheme = buildRethemePrompt({ theme: fantasyTheme, recentNarrative: '', stepType: 'input', prompt: 'Solve for x.' })
  for (const prompt of [start, segment, cont, retheme]) {
    assert.ok(prompt.includes(IMAGINATIVE_WORLD_RULE), 'imaginative set may invent a world')
    assert.equal(prompt.includes(GROUNDED_WORLD_RULE), false)
  }
})

test('a mixed set with ANY imaginative interest leans imaginative (sports + space)', () => {
  const start = buildStartStoryPrompt(mixedTheme)
  assert.ok(start.includes(IMAGINATIVE_WORLD_RULE))
  assert.equal(start.includes(GROUNDED_WORLD_RULE), false)
})
