# Balance

Balance is a local MVP for a Brilliant-style algebra path built around a balance-scale model. Learners work through short interactive steps, test algebra moves, get feedback when an answer is wrong, and build profile/mastery progress as they complete the first two lessons.

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

- Create or use a local demo account in the browser.
- Start `Balancing Equations`, complete it end to end, and confirm `One-Step Equations` unlocks.
- Complete `One-Step Equations` and confirm `Two-Step Equations` remains coming soon.
- Submit an incorrect answer and confirm the app gives feedback and allows retry.
- Refresh the browser during or after each lesson and confirm progress resumes locally.
- Open the profile/mastery view and confirm completed work is reflected there.

## Local Backend Limitations

The MVP backend is browser-local only. Authentication, profile state, lesson progress, and mastery data are stored for the current browser environment rather than in a shared remote service.

Current limitations:

- No cross-device sync.
- No shared account state across browsers or machines.
- Browser storage resets or private browsing sessions can remove local progress.
- Firebase and Supabase backend adapters are deferred until the lesson MVP is stable.

See `BACKEND_ADAPTERS.md` for the planned adapter direction.

## Phase 1 Final Sign-Off Notes

Use `PHASE1_QA_CHECKLIST.md` for final local smoke-test records. The sign-off should capture browser, viewport, date, tester, and pass/fail notes for the local MVP path.

The checks expected to pass now are Lesson 1, Lesson 2, wrong-answer recovery, local resume, profile/mastery updates, and mobile/touch basics. Hosted items are intentionally deferred while Firebase/Supabase is unavailable: cross-device sync, hosted auth/password reset, security rules/RLS, public HTTPS deploy, monitoring, and hosted concurrent-user testing.

## Important Files

- `src/domain.ts` defines the domain model for lessons, steps, profiles, progress, and mastery.
- `src/App.tsx` contains the main React application, screens, and learner flow.
- `src/engine.ts` runs lesson progression, answer checks, and mastery updates.
- `src/backend.ts` provides the current local backend abstraction for auth and progress persistence.
- `BACKEND_ADAPTERS.md` documents the deferred hosted backend adapter plan.

## Next Priorities

The next phase should favor quality over quantity:

- Tighten the existing lesson experience before adding many new lessons.
- Improve feedback clarity for wrong answers and retries.
- Strengthen resume/profile/mastery behavior around edge cases.
- Add focused tests around the engine and local backend contracts.
- Keep backend adapter work scoped to a clean interface so Firebase or Supabase can be added without rewriting the lesson flow.
