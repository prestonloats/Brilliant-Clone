# Backend Adapter Notes

The app currently uses `LocalBackend` in `src/backend.ts`. It persists demo profiles,
progress, mastery, and attempt events in browser storage so the MVP can run without Firebase.

The important rule: React components should only use the app-owned `Backend`
contract. Firebase, Supabase, or any other SDK should stay inside an adapter.

## Current Local Demo Backend

- `auth`: local demo profile create/resume, sign out, current user
- `progress`: exact lesson step resume
- `mastery`: per-skill EWMA score
- `attempts`: per-attempt event log

Local demo auth deliberately does not collect or persist passwords. It resumes profiles by
email in the same browser profile and keeps the active user in tab-scoped session storage
to reduce shared-browser persistence risk. Repository methods guard user-owned reads and
writes by the active local user, but this remains client-side demo storage and is not a
production security boundary.

## Phase 1 QA Boundary

Phase 1 final sign-off is limited to local MVP behavior while Firebase/Supabase adapters are not wired into the runtime. Lesson 1, Lesson 2, wrong-answer recovery, local resume, profile/mastery, and mobile/touch basics should pass against `LocalBackend`.

Hosted checks are expected to fail or remain unchecked until a real adapter is available: cross-device sync, hosted auth/password reset, Firebase Security Rules or Supabase RLS, public HTTPS deploy, monitoring, and hosted concurrent-user testing. These items are deferred because of current backend availability, not removed from the backend plan.

If `VITE_BACKEND_PROVIDER=firebase` is selected before the adapter is complete, startup must
fail closed with a clear error. It must not silently use local demo storage.

## Firebase Mapping

- `AuthRepository` -> Firebase Auth
- `users` -> `users/{uid}`
- `progress` -> `progress/{uid}/lessons/{lessonId}`
- `mastery` -> `mastery/{uid}/skills/{skillId}`
- `attempts` -> `attempts/{uid}/events/{eventId}`
- Security Rules: per-user read/write; lesson content read-only

## Firebase Integration Path

The current `Backend` contract is synchronous because `LocalBackend` reads and writes browser storage directly. Firebase Auth and Firestore are async, so the production adapter should update the app-owned repository contract to async methods before replacing local calls in React.

Recommended order:

1. Keep `LocalBackend` as the default implementation while introducing an async provider factory.
2. Add `FirebaseBackend` behind the same app-owned interfaces, using `src/firebaseServices.ts` for SDK initialization.
3. Implement Firebase Auth email/password sign up, sign in, sign out, and display name profile updates.
4. Store user profiles at `users/{uid}` and use the Firebase `uid` as `UserProfile.id`.
5. Store lesson progress, skill mastery, and attempts under per-user collection paths that match `firestore.rules`.
6. Migrate React state flows to await repository calls and handle loading/error states.
7. Enable `VITE_BACKEND_PROVIDER=firebase` only after local parity tests and hosted rules checks pass.

Required env variables are listed in `.env.example`. Real values belong in `.env.local` or the hosting environment, never in committed files. Before testing Firebase mode, run `firebase use --add`, enable Email/Password Auth, create Firestore, and enable Hosting in Firebase Console.

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
