# Balance

Balance is a local MVP for a Brilliant-style algebra path built around a balance-scale model. Learners work through short interactive steps, test algebra moves, get feedback when an answer is wrong, and build profile/mastery progress as they complete the first three authored lessons, with shell lessons reserving the rest of the six-part path.

The current app is intentionally local-first so the lesson flow, interaction model, and progress shape can be validated before adding a hosted backend.

## Run Locally

Install dependencies if this is your first run or if `node_modules` is missing:

```sh
npm install
```

Start the Vite development server:

```sh
npm run dev
```

Vite prints the local URL in the terminal, usually `http://localhost:5173/`. If that port is already in use, Vite will choose the next available port and show the correct URL to open.

## MVP Smoke Test Checklist

Use this checklist after local changes to confirm the core learning loop still works:

- Create or resume a local demo profile in the browser. Do not use real credentials.
- Start `Balancing Equations`, complete it end to end, and confirm `One-Step Equations` unlocks.
- Complete `One-Step Equations`, confirm `Two-Step Equations` unlocks, then complete it and confirm the Lesson 4 shell unlocks.
- Confirm the path shows all six Algebra Foundations parts, with Lessons 4-6 kept as lightweight content shells.
- Submit an incorrect answer and confirm the app gives feedback and allows retry.
- Refresh the browser during or after each lesson and confirm progress resumes locally.
- Open the profile/mastery view and confirm completed work is reflected there.

## Local Demo Backend Limitations

The MVP backend is browser-local only. Local demo profiles and learning progress are stored for the current browser environment rather than in a shared remote service.

Local demo mode is not production authentication:

- It does not collect, store, or verify passwords.
- Local profile resume is email-only and is intended for a single-device demo.
- The active session is kept in tab-scoped browser session storage, so closing the browser can sign the learner out.
- Progress remains in browser local storage until that storage is cleared.
- Sign out before sharing a device or browser profile.

Current backend limitations:

- No cross-device sync.
- No shared account state across browsers or machines.
- Browser storage resets or private browsing sessions can remove local progress.
- Firebase and Supabase backend adapters are not wired into the runtime yet. Use Firebase Auth or another hosted auth provider before accepting production credentials.

See `BACKEND_ADAPTERS.md` for the planned adapter direction.

## Firebase Readiness

Firebase is prepared as an optional backend target, but the app still defaults to `LocalBackend`. If `VITE_BACKEND_PROVIDER=firebase` is selected before Firebase config and the adapter are complete, the app fails closed with a clear setup error instead of falling back to local demo mode.

Safe setup steps:

1. Copy `.env.example` to `.env.local` and fill the `VITE_FIREBASE_*` values from Firebase Console. Do not commit `.env.local`.
2. In Firebase Console, enable Email/Password under Authentication, create Firestore, and enable Hosting.
3. Select the Firebase project for this repo with `firebase use --add`.
4. Keep `VITE_BACKEND_PROVIDER=local` until the Firebase adapter is complete. Switch it to `firebase` only when adapter parity, rules, and migration checks are ready.
5. Deploy later with `npm run build` followed by `firebase deploy --only firestore:rules,hosting`.

Current Firebase files:

- `firebase.json` configures Vite `dist` hosting and Firestore rules/indexes.
- `firestore.rules` restricts user-owned data to `request.auth.uid` and keeps future content read-only.
- `src/firebaseConfig.ts` and `src/firebaseServices.ts` initialize Firebase only when all required env values are present.

## Phase 1 Final Sign-Off Notes

Use `PHASE1_QA_CHECKLIST.md` for final local smoke-test records. The sign-off should capture browser, viewport, date, tester, and pass/fail notes for the local MVP path.

The checks expected to pass now are Lessons 1-3, six-part path visibility, wrong-answer recovery, local resume, profile/mastery updates, and mobile/touch basics. Hosted items are intentionally deferred until a Firebase/Supabase adapter is wired: cross-device sync, hosted auth/password reset, security rules/RLS, public HTTPS deploy, monitoring, and hosted concurrent-user testing.

## Important Files

- `src/domain.ts` defines the domain model for lessons, steps, profiles, progress, and mastery.
- `src/App.tsx` contains the main React application, screens, and learner flow.
- `src/engine.ts` runs lesson progression, answer checks, and mastery updates.
- `src/backend.ts` provides the current local backend abstraction for auth and progress persistence.
- `BACKEND_ADAPTERS.md` documents the deferred hosted backend adapter plan.

## Next Priorities

The next phase should favor quality over quantity:

- Fill the Lesson 4-6 shells with focused interactive puzzles.
- Tighten the existing lesson experience before adding many new lessons.
- Improve feedback clarity for wrong answers and retries.
- Strengthen resume/profile/mastery behavior around edge cases.
- Add focused tests around the engine and local backend contracts.
- Keep backend adapter work scoped to a clean interface so Firebase or Supabase can be added without rewriting the lesson flow.
