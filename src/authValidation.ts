// Provider-neutral auth form validation.
//
// These helpers are pure (no React, Firebase, or browser APIs) so the auth UI and the
// unit tests can share one source of truth for email/password rules without needing a
// live Firebase project. The minimum password length matches the Firebase Auth adapter
// guard in `firebaseBackend.ts`.

export const PASSWORD_MIN_LENGTH = 6

export type AuthMode = 'login' | 'signup'

export type AuthFormValues = {
  displayName: string
  email: string
  password: string
  confirmPassword: string
}

type AuthFormContext = {
  mode: AuthMode
  // Firebase authenticates with a password. Local demo mode is intentionally passwordless,
  // so password rules are skipped to avoid implying a credential that is never stored.
  requiresPassword: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim())

// Returns the first user-facing validation error, or `null` when the form is ready to submit.
export const validateAuthForm = (
  values: AuthFormValues,
  { mode, requiresPassword }: AuthFormContext,
): string | null => {
  if (!values.email.trim()) {
    return 'Enter your email address.'
  }
  if (!isValidEmail(values.email)) {
    return 'Enter a valid email address.'
  }
  if (mode === 'signup' && !values.displayName.trim()) {
    return 'Enter a display name.'
  }

  if (requiresPassword) {
    if (!values.password) {
      return 'Enter your password.'
    }
    if (values.password.length < PASSWORD_MIN_LENGTH) {
      return `Use a password with at least ${PASSWORD_MIN_LENGTH} characters.`
    }
    if (mode === 'signup' && values.password !== values.confirmPassword) {
      return 'Passwords do not match.'
    }
  }

  return null
}
