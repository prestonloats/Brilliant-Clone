import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  validateAuthForm,
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

test('a credential-free provider (requiresPassword: false) never requires or validates a password', () => {
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
  // A stray password value must not change validation when the provider does not require one.
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
