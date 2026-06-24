# Backend Adapter Notes

The app defaults to `LocalBackend` in `src/backend.ts`. It persists demo profiles,
progress, mastery, and attempt events in browser storage so the MVP can run without Firebase.
`FirebaseBackend` in `src/firebaseBackend.ts` implements the same app-owned contract with
Firebase Auth and Firestore when `VITE_BACKEND_PROVIDER=firebase` is configured.

The important rule: React components should only use the app-owned `Backend`
contract. Firebase, Supabase, or any other SDK should stay inside an adapter.

## Auth UI: Log in & Create account

The auth screen (`AuthScreen` in `src/App.tsx`) presents two modes, **Log in** and **Create
account**, and adapts its fields to the active provider:

- Firebase mode renders email + password (and display name + confirm password on Create
  account) and calls Firebase Auth. It is the real credential provider.
- Local mode renders only display name + email (Create account) or email (Log in) and stays
  passwordless.

Form validation is centralized in `src/authValidation.ts` (`validateAuthForm`, `isValidEmail`,
`PASSWORD_MIN_LENGTH`). These helpers are pure (no React/Firebase/browser APIs) so the UI and
the unit tests in `tests/authValidation.test.ts` share one source of truth, and the Firebase
password minimum stays in sync with `firebaseBackend.ts`.

## Current Local Demo Backend

- `auth`: local account create/resume (passwordless), sign out, current user
- `progress`: exact lesson step resume
- `mastery`: per-skill EWMA score
- `attempts`: per-attempt event log

Local demo auth deliberately does not collect or persist passwords, even though the shared
`SignUpInput` type carries an optional `password` (used only by Firebase). The local adapter
ignores any password value, so plaintext passwords are never written to browser storage. It
resumes accounts by email in the same browser profile and keeps the active user in tab-scoped
session storage to reduce shared-browser persistence risk. Repository methods guard user-owned
reads and writes by the active local user, but this remains client-side demo storage and is not
a production security boundary. Use Firebase mode for real, password-protected accounts.

## Runtime Selection

Provider selection is controlled by `VITE_BACKEND_PROVIDER=local|firebase`.

- `local` is the safe default and never asks for passwords.
- `firebase` initializes Firebase Auth and Firestore from the `VITE_FIREBASE_*` web config.
- If Firebase config is incomplete or the adapter cannot initialize, startup fails closed and does not fall back to local storage.

Live Firebase checks still require user-owned project setup: `firebase use --add`, `.env.local`,
Email/Password Auth enabled, Firestore created, and any Hosting setup desired for deployment.

## Firebase Mapping

- `AuthRepository` -> Firebase Auth
- `users` -> `users/{uid}`
- `progress` -> `progress/{uid}/lessons/{lessonId}`
- `mastery` -> `mastery/{uid}/skills/{skillId}`
- `attempts` -> `attempts/{uid}/events/{eventId}`
- Security Rules: per-user read/write; lesson content read-only

## Firebase Integration

The app-owned `Backend` contract is async-capable so React awaits repository calls while
`LocalBackend` remains synchronous internally.

Implemented mapping:

- Firebase Auth email/password sign up, sign in, sign out, and display name update.
- Email ownership verification: `sendEmailVerification` on sign-up, plus `resendEmailVerification` and `reloadCurrentUser` on the `AuthRepository` contract for the verify-email UX.
- `users/{uid}` stores public user profile data with Firebase `uid` as `UserProfile.id`.
- `progress/{uid}/lessons/{lessonId}` stores lesson resume and score history.
- `mastery/{uid}/skills/{skillId}` stores per-skill mastery counters.
- `attempts/{uid}/events/{eventId}` stores append-only attempt events.
- Lesson content stays bundled in `src/domain.ts`; clients do not write lesson content to Firestore.

Security invariants:

- Adapter methods derive Firestore paths from the authenticated Firebase `uid`.
- Repository calls reject cross-user `userId` requests instead of writing another user's data.
- Firestore serializers overwrite user-scoped payload IDs with the authenticated `uid`.
- `firestore.rules` require stored `id` or `userId` fields to match `request.auth.uid`.
- Attempt writes are create-only in rules and transaction-checked by the adapter.
- User-scoped learning-data writes (`progress`, `mastery`, `attempts`) require a verified email both client-side (`assertVerifiedEmailForWrite`) and in `firestore.rules` (`request.auth.token.email_verified == true`). Reads and `users/{uid}` profile bootstrap stay allowed so sign-up works and lesson content remains readable.
- `UserProfile.emailVerified` is never persisted to Firestore; it is always derived from the live Firebase Auth user so it cannot go stale. Local demo profiles report `emailVerified: true` so local mode is never gated.
- Pure, live-Firebase-free helpers (`isEmailVerificationRequired`, `assertVerifiedEmailForWrite`) live in `src/firebaseBackendCore.ts` and are unit tested in `tests/backend.test.ts`.

Hosting hardening:

- `firebase.json` sets baseline Firebase Hosting security headers (CSP compatible with Firebase Auth/Firestore, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`). The CSP is intentionally conservative; validate and tighten it against a live deploy (TODO documented in `README.md`).

Required env variables are listed in `.env.example`. Real values belong in `.env.local` or the hosting environment, never in committed files. Before testing Firebase mode, run `firebase use --add`, enable Email/Password Auth, create Firestore, and enable Hosting in Firebase Console if you plan to deploy. App Check enablement and HTTP-referrer API key restrictions remain operator tasks.

## Supabase Mapping

- `AuthRepository` -> Supabase Auth
- `users` -> `profiles`
- `progress` -> `lesson_progress`
- `mastery` -> `skill_mastery`
- `attempts` -> `attempt_events`
- Row Level Security: users can read/write their own rows; content is read-only

## Swap Checklist

1. Add `FirebaseBackend` or `SupabaseBackend` implementing `Backend`.
2. Keep provider SDK return types inside the adapter.
3. Convert adapter records into `UserProfile`, `LessonProgress`, `SkillMastery`,
   and `AttemptEvent`.
4. Replace `localBackend` usage with a provider factory or context.
5. Add environment variables and deployment config for the selected provider.
