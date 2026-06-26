// Story Mode chapter-beats persistence proof.
//
// Each chapter's OPENING narrative is persisted as a `ChapterBeat` so it survives `segments`
// compaction and stays reviewable. The beats are an OPTIONAL, back-compatible additive field on
// `StorySession` (like `currentQuestion`), so these tests drive the REAL `normalizeStorySession`
// and prove: a session WITH beats round-trips (valid entries kept, a bad/unknown `sceneId`
// dropped while the beat survives, malformed entries filtered out), and a session WITHOUT beats
// normalizes to an object that has NO `chapterBeats` key (omitted -> round-trip identity for
// legacy sessions). Mirrors `story-architecture-persistence.test.ts`.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeStorySession } from '../src/backend'

const base = { id: 'story-beats', userId: 'user-1' }

test('a session WITH chapterBeats round-trips: valid kept, bad sceneId dropped, malformed filtered', () => {
  const session = normalizeStorySession({
    ...base,
    chapterBeats: [
      { chapter: 1, text: 'Chapter 1 opens', sceneId: 'outer-space' }, // fully valid -> kept as-is
      { chapter: 2, text: 'Chapter 2 bridge', sceneId: 'not-a-real-scene' }, // bad sceneId dropped, beat kept
      { chapter: 'x', text: 'bad chapter type' }, // non-number chapter -> filtered out
      { chapter: 1.5, text: 'non-integer chapter' }, // non-integer chapter -> filtered out
      { chapter: 0, text: 'chapter below 1' }, // chapter < 1 -> filtered out
      { chapter: 3 }, // missing text -> filtered out
      'not even a record', // not a record -> filtered out
    ],
  })

  assert.ok(session, 'session should normalize')
  assert.deepEqual(session.chapterBeats, [
    { chapter: 1, text: 'Chapter 1 opens', sceneId: 'outer-space' },
    { chapter: 2, text: 'Chapter 2 bridge' }, // sceneId omitted (unknown id dropped)
  ])
  // The dropped sceneId leaves no key behind (Firestore rejects undefined).
  assert.equal('sceneId' in (session.chapterBeats?.[1] ?? {}), false)
})

test('a chapterBeat keeps a KNOWN sceneId and omits it when absent', () => {
  const session = normalizeStorySession({
    ...base,
    chapterBeats: [
      { chapter: 1, text: 'no scene here' },
      { chapter: 2, text: 'has a scene', sceneId: 'pirate-cove' },
    ],
  })
  assert.ok(session)
  assert.equal('sceneId' in (session.chapterBeats?.[0] ?? {}), false)
  assert.equal(session.chapterBeats?.[1]?.sceneId, 'pirate-cove')
})

test('a chapterBeat round-trips the learner choice + outcome (and drops bad outcome fields)', () => {
  const session = normalizeStorySession({
    ...base,
    chapterBeats: [
      {
        chapter: 1,
        text: 'Ch1 opening',
        sceneId: 'outer-space',
        userChoice: 'Sneak past the guard',
        outcomeText: 'You slip by unseen.',
        outcomeSceneId: 'pirate-cove',
      },
      {
        chapter: 2,
        text: 'Ch2 bridge',
        userChoice: 42, // non-string -> dropped
        outcomeText: 'Outcome ok',
        outcomeSceneId: 'not-a-real-scene', // unknown id -> dropped
      },
    ],
  })
  assert.ok(session)
  assert.deepEqual(session.chapterBeats, [
    {
      chapter: 1,
      text: 'Ch1 opening',
      sceneId: 'outer-space',
      userChoice: 'Sneak past the guard',
      outcomeText: 'You slip by unseen.',
      outcomeSceneId: 'pirate-cove',
    },
    { chapter: 2, text: 'Ch2 bridge', outcomeText: 'Outcome ok' },
  ])
  // The dropped non-string choice + unknown outcome scene leave no keys behind.
  const second = session.chapterBeats?.[1] ?? {}
  assert.equal('userChoice' in second, false)
  assert.equal('outcomeSceneId' in second, false)
})

test('a session WITHOUT chapterBeats omits the key entirely (legacy round-trip identity)', () => {
  const session = normalizeStorySession({ ...base })
  assert.ok(session)
  assert.equal('chapterBeats' in session, false)
})

test('an empty or all-invalid chapterBeats array omits the key (so it stays absent)', () => {
  const empty = normalizeStorySession({ ...base, chapterBeats: [] })
  assert.ok(empty)
  assert.equal('chapterBeats' in empty, false)

  const allBad = normalizeStorySession({
    ...base,
    chapterBeats: [{ chapter: 0, text: 'x' }, 'nope', 42, { chapter: 1 }],
  })
  assert.ok(allBad)
  assert.equal('chapterBeats' in allBad, false)
})

test('a non-array chapterBeats value is ignored (key omitted)', () => {
  const session = normalizeStorySession({ ...base, chapterBeats: 'nope' })
  assert.ok(session)
  assert.equal('chapterBeats' in session, false)
})
