# Backend Adapter Notes

The app currently uses `LocalBackend` in `src/backend.ts`. It persists auth, progress,
mastery, and attempt events in browser storage so the MVP can run without Firebase.

The important rule: React components should only use the app-owned `Backend`
contract. Firebase, Supabase, or any other SDK should stay inside an adapter.

## Current Local Backend

- `auth`: local sign up, sign in, sign out, current user
- `progress`: exact lesson step resume
- `mastery`: per-skill EWMA score
- `attempts`: per-attempt event log

## Phase 1 QA Boundary

Phase 1 final sign-off is limited to local MVP behavior while Firebase/Supabase is unavailable. Lesson 1, Lesson 2, wrong-answer recovery, local resume, profile/mastery, and mobile/touch basics should pass against `LocalBackend`.

Hosted checks are expected to fail or remain unchecked until a real adapter is available: cross-device sync, hosted auth/password reset, Firebase Security Rules or Supabase RLS, public HTTPS deploy, monitoring, and hosted concurrent-user testing. These items are deferred because of current backend availability, not removed from the backend plan.

## Firebase Mapping

- `AuthRepository` -> Firebase Auth
- `users` -> `users/{uid}`
- `progress` -> `progress/{uid}/lessons/{lessonId}`
- `mastery` -> `mastery/{uid}/skills/{skillId}`
- `attempts` -> `attempts/{uid}/events/{eventId}`
- Security Rules: per-user read/write; lesson content read-only

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
