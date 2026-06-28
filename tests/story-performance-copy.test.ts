import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ChapterPerformance, PerformanceBand } from '../src/domain'
import { performanceCopy } from '../src/story/performanceCopy'

// The pure copy that surfaces a chapter's performance on the checkpoint/outcome screens.

const make = (band: PerformanceBand, firstTryCorrect: number, answered: number): ChapterPerformance => ({
  band,
  firstTryCorrect,
  answered,
})

test('performanceCopy formats the first-try tally and passes the band through', () => {
  const copy = performanceCopy(make('strong', 4, 5))
  assert.equal(copy.band, 'strong')
  assert.equal(copy.tally, 'First try: 4 of 5')
  assert.ok(copy.headline.length > 0)
  assert.ok(copy.note.length > 0)
})

test('performanceCopy gives a distinct headline for every band', () => {
  const bands: PerformanceBand[] = ['flawless', 'strong', 'mixed', 'struggled']
  const headlines = new Set<string>()
  for (const band of bands) {
    const copy = performanceCopy(make(band, band === 'flawless' ? 5 : 2, 5))
    headlines.add(copy.headline)
    assert.equal(copy.band, band)
  }
  assert.equal(headlines.size, 4)
})

test('the struggled copy stays encouraging (a setback to overcome, not blame)', () => {
  const copy = performanceCopy(make('struggled', 1, 5))
  assert.match(copy.note, /way through/i)
})

test('performanceCopy reflects a short-chapter denominator', () => {
  const copy = performanceCopy(make('mixed', 1, 3))
  assert.equal(copy.tally, 'First try: 1 of 3')
})
