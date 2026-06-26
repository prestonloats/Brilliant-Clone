import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DISPLAY_NAME_MAX_LENGTH,
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  validateAuthForm,
  validateDisplayName,
  type AuthFormValues,
} from '../src/authValidation'

const values = (overrides: Partial<AuthFormValues> = {}): AuthFormValues => ({
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
  ...overrides,
})

test('isValidEmail accepts well-formed addresses and trims whitespace', () => {
  assert.equal(isValidEmail(' learner@example.com '), true)
  assert.equal(isValidEmail('a@b.co'), true)
  assert.equal(isValidEmail('learner'), false)
  assert.equal(isValidEmail('learner@example'), false)
  assert.equal(isValidEmail('learner @example.com'), false)
  assert.equal(isValidEmail(''), false)
})

test('validateAuthForm requires a valid email in every mode', () => {
  assert.match(
    validateAuthForm(values({ displayName: 'Maya' }), { mode: 'signup', requiresPassword: false }) ?? '',
    /email address/i,
  )
  assert.match(
    validateAuthForm(values({ email: 'not-an-email' }), { mode: 'login', requiresPassword: false }) ?? '',
    /valid email/i,
  )
})

test('validateAuthForm requires a display name only when creating an account', () => {
  assert.match(
    validateAuthForm(values({ email: 'learner@example.com' }), {
      mode: 'signup',
      requiresPassword: false,
    }) ?? '',
    /display name/i,
  )
  assert.equal(
    validateAuthForm(values({ email: 'learner@example.com' }), {
      mode: 'login',
      requiresPassword: false,
    }),
    null,
  )
})

test('local (passwordless) auth never requires or validates a password', () => {
  assert.equal(
    validateAuthForm(values({ displayName: 'Maya', email: 'learner@example.com' }), {
      mode: 'signup',
      requiresPassword: false,
    }),
    null,
  )
  assert.equal(
    validateAuthForm(values({ email: 'learner@example.com' }), {
      mode: 'login',
      requiresPassword: false,
    }),
    null,
  )
  // A stray password value must not change local-mode validation: local mode never stores it.
  assert.equal(
    validateAuthForm(values({ displayName: 'Maya', email: 'learner@example.com', password: 'x' }), {
      mode: 'signup',
      requiresPassword: false,
    }),
    null,
  )
})

test('firebase auth enforces password presence and minimum length', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6)

  assert.match(
    validateAuthForm(values({ email: 'learner@example.com' }), {
      mode: 'login',
      requiresPassword: true,
    }) ?? '',
    /enter your password/i,
  )
  assert.match(
    validateAuthForm(values({ email: 'learner@example.com', password: 'short' }), {
      mode: 'login',
      requiresPassword: true,
    }) ?? '',
    /at least 6 characters/i,
  )
  assert.equal(
    validateAuthForm(values({ email: 'learner@example.com', password: 'longenough' }), {
      mode: 'login',
      requiresPassword: true,
    }),
    null,
  )
})

test('validateDisplayName accepts trimmed non-empty names within the length cap', () => {
  assert.equal(validateDisplayName('Maya'), null)
  assert.equal(validateDisplayName('  Maya  '), null)
  assert.equal(validateDisplayName('A'.repeat(DISPLAY_NAME_MAX_LENGTH)), null)
})

test('validateDisplayName rejects empty / whitespace-only names', () => {
  assert.match(validateDisplayName('') ?? '', /display name/i)
  assert.match(validateDisplayName('   ') ?? '', /display name/i)
  assert.match(validateDisplayName('\t\n') ?? '', /display name/i)
})

test('validateDisplayName rejects names longer than the cap (counting trimmed length)', () => {
  assert.equal(DISPLAY_NAME_MAX_LENGTH, 40)
  assert.match(
    validateDisplayName('A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)) ?? '',
    /40 characters or fewer/i,
  )
  // Surrounding whitespace is trimmed before the length is measured, so a padded name that fits
  // once trimmed is still accepted.
  assert.equal(validateDisplayName(`  ${'A'.repeat(DISPLAY_NAME_MAX_LENGTH)}  `), null)
})

test('validateAuthForm enforces the shared display-name cap when creating an account', () => {
  assert.match(
    validateAuthForm(
      values({ email: 'learner@example.com', displayName: 'A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) }),
      { mode: 'signup', requiresPassword: false },
    ) ?? '',
    /40 characters or fewer/i,
  )
  // Login never inspects the display name, so an over-long value is irrelevant there.
  assert.equal(
    validateAuthForm(
      values({ email: 'learner@example.com', displayName: 'A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1) }),
      { mode: 'login', requiresPassword: false },
    ),
    null,
  )
})

test('firebase account creation confirms matching passwords', () => {
  assert.match(
    validateAuthForm(
      values({
        displayName: 'Maya',
        email: 'learner@example.com',
        password: 'longenough',
        confirmPassword: 'different',
      }),
      { mode: 'signup', requiresPassword: true },
    ) ?? '',
    /do not match/i,
  )
  assert.equal(
    validateAuthForm(
      values({
        displayName: 'Maya',
        email: 'learner@example.com',
        password: 'longenough',
        confirmPassword: 'longenough',
      }),
      { mode: 'signup', requiresPassword: true },
    ),
    null,
  )
})
