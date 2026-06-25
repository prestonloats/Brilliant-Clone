import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_LEGACY_PASSWORD,
  hashPassword,
  sha256Hex,
  verifyPassword,
  type PasswordCredential,
} from '../src/auth/passwordCredential'

test('sha256Hex matches the canonical NIST known-answer vectors', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('hashPassword is deterministic for a fixed salt', () => {
  assert.equal(
    hashPassword('hunter2', 'aabbccdd').hash,
    hashPassword('hunter2', 'aabbccdd').hash,
  )
})

test('omitting the salt yields differing salts and differing hashes across calls', () => {
  const first = hashPassword('hunter2')
  const second = hashPassword('hunter2')
  assert.notEqual(first.salt, second.salt)
  assert.notEqual(first.hash, second.hash)
})

test('an auto-generated salt is at least 16 hex characters', () => {
  const { salt } = hashPassword('hunter2')
  assert.ok(salt.length >= 16, `expected >=16 hex chars, got ${salt.length}`)
  assert.match(salt, /^[0-9a-f]+$/)
})

test('verifyPassword accepts the correct password and rejects a wrong one', () => {
  const credential = hashPassword('hunter2')
  assert.equal(verifyPassword('hunter2', credential), true)
  assert.equal(verifyPassword('not-the-password', credential), false)
})

test('verifyPassword round-trips the default legacy password', () => {
  assert.equal(verifyPassword(DEFAULT_LEGACY_PASSWORD, hashPassword(DEFAULT_LEGACY_PASSWORD)), true)
  assert.equal(verifyPassword('wrong', hashPassword(DEFAULT_LEGACY_PASSWORD)), false)
})

test('DEFAULT_LEGACY_PASSWORD is the documented legacy default', () => {
  assert.equal(DEFAULT_LEGACY_PASSWORD, '123456')
})

test('credentials never leak the plaintext password', () => {
  const cred: PasswordCredential = hashPassword('hunter2')
  assert.equal(cred.hash.includes('hunter2'), false)
  assert.equal(cred.salt.includes('hunter2'), false)
  assert.doesNotMatch(JSON.stringify(cred), /hunter2/)
})

test('verifyPassword never throws on malformed credentials', () => {
  assert.equal(verifyPassword('hunter2', { hash: '', salt: '' }), false)
  assert.equal(
    verifyPassword('hunter2', undefined as unknown as PasswordCredential),
    false,
  )
})
