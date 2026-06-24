# Balance

Balance is a local MVP for a Brilliant-style algebra path built around a balance-scale model. Learners work through short interactive steps, test algebra moves, get feedback when an answer is wrong, and build profile/mastery progress as they complete the first three authored lessons, with shell lessons reserving the rest of the six-part path.

The app is local-first by default, with an optional Firebase backend adapter for Auth and Firestore when project config is supplied.

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

## Accounts: Log in & Create account

The auth screen has two modes, **Log in** and **Create account**. What they ask for depends on the active backend provider (`VITE_BACKEND_PROVIDER`):

- **Firebase mode (`firebase`) is the real credential provider.** Create account collects display name, email, password, and confirm password; Log in collects email and password. These map to Firebase Authentication email/password. New accounts must verify their email (via the "Verify your email" screen) before any learning progress is saved.
- **Local mode (`local`, the default) is an intentionally passwordless on-device demo.** Create account needs only a display name and email; Log in resumes an account previously created in the same browser by its email. No password is collected or stored, so local mode never reintroduces plaintext password storage. To get real, password-protected accounts that sync across devices, configure Firebase and set `VITE_BACKEND_PROVIDER=firebase`.

The app never silently falls back from Firebase to local: if Firebase mode is selected with incomplete config, startup fails closed with a setup error.

## MVP Smoke Test Checklist

Use this checklist after local changes to confirm the core learning loop still works:

- Use **Create account** (display name + email) or **Log in** (email) on the local-mode auth screen. Do not use real credentials in local mode; it is passwordless by design.
- Start `Balancing Equations`, complete it end to end, and confirm `One-Step Equations` unlocks.
- Complete `One-Step Equations`, confirm `Two-Step Equations` unlocks, then complete it and confirm the Lesson 4 shell unlocks.
- Confirm the path shows all six Algebra Foundations parts, with Lessons 4-6 kept as lightweight content shells.
- Submit an incorrect answer and confirm the app gives feedback and allows retry.
- Refresh the browser during or after each lesson and confirm progress resumes locally.
- Open the profile/mastery view and confirm completed work is reflected there.

## Local Demo Backend Limitations

The MVP backend is browser-local only. Local demo profiles and learning progress are stored for the current browser environment rather than in a shared remote service.

Local demo mode is not production authentication:

- It does not collect, store, or verify passwords. The auth screen hides the password fields entirely in local mode.
- Log in (resume) is email-only and is intended for a single-device demo.
- The active session is kept in tab-scoped browser session storage, so closing the browser can sign the learner out.
- Progress remains in browser local storage until that storage is cleared.
- Sign out before sharing a device or browser profile.

Current local backend limitations:

- No cross-device sync.
- No shared account state across browsers or machines.
- Browser storage resets or private browsing sessions can remove local progress.
- Firebase mode requires a configured Firebase project and `.env.local`; do not use local demo auth for production credentials.

See `BACKEND_ADAPTERS.md` for the planned adapter direction.

## Firebase Mode

Firebase is available as an optional backend target, but the app still defaults to `LocalBackend`. If `VITE_BACKEND_PROVIDER=firebase` is selected before Firebase config is complete or services cannot initialize, the app fails closed with a clear setup error instead of falling back to local demo mode.

Safe setup steps:

1. Copy `.env.example` to `.env.local` and fill the `VITE_FIREBASE_*` values from Firebase Console. Do not commit `.env.local`.
2. In Firebase Console, enable Email/Password under Authentication, create Firestore, and enable Hosting.
3. Select the Firebase project for this repo with `firebase use --add`.
4. Set `VITE_BACKEND_PROVIDER=firebase` in `.env.local` only after the Firebase web config is present.
5. Run `npm run lint`, `npm test`, and `npm run build` locally before a hosted deploy.
6. Deploy later with `firebase deploy --only firestore:rules,hosting` only when you explicitly want to publish rules and hosting.

### Email Verification

Firebase email/password sign-up verifies email ownership before any course data is saved:

- On sign-up the app calls `sendEmailVerification` for the new account.
- Until the email is verified, Firebase users land on a "Verify your email" screen with a resend action and an "I verified my email" button that reloads the live verification state.
- Learning-data writes (progress, mastery, attempts) are blocked for unverified accounts both client-side (a clear in-app error) and in `firestore.rules` (`request.auth.token.email_verified == true`). Profile bootstrap (`users/{uid}`) and all reads, including lesson content, remain allowed so a new account can be created and the app stays usable.
- Local demo mode is unaffected: local accounts have no password and are always treated as verified, so they never see the verification gate.

Current Firebase files:

- `firebase.json` configures Vite `dist` hosting, Firestore rules/indexes, and baseline security response headers (see Security Headers below).
- `firestore.rules` restricts user-owned data to `request.auth.uid`, requires stored user IDs to match the authenticated UID, requires a verified email for user-scoped learning-data writes, keeps attempts append-only, and keeps bundled/future content read-only.
- `src/firebaseConfig.ts` and `src/firebaseServices.ts` initialize Firebase only when all required env values are present.
- `src/firebaseBackend.ts` maps Firebase Auth and Firestore to the app-owned backend contract, including email verification send/resend/reload and verified-email write guards.

### Security Headers

`firebase.json` ships a conservative baseline set of Firebase Hosting headers: a Content-Security-Policy compatible with Firebase Auth/Firestore, plus HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, and a restrictive `Permissions-Policy`. These apply only to a Firebase Hosting deploy and do not affect local `npm run dev`.

TODO before relying on the CSP in production (requires a live deploy to validate; not done here):

- Verify Firebase Auth email/password and Firestore traffic against the CSP on a real deploy and tighten `connect-src`/`frame-src` to the exact domains your project uses.
- Replace `style-src 'unsafe-inline'` with hashes/nonces once inline styles are audited.
- Consider HSTS `preload` only after confirming the apex domain and all subdomains are HTTPS-only.

### Remaining User / Ops Tasks (not performed here)

These require a live Firebase project or console access and are intentionally left to the operator:

- `firebase use --add` / project selection.
- Enabling Email/Password Auth and creating Firestore in the console.
- Deploying rules and hosting (`firebase deploy --only firestore:rules,hosting`).
- Enabling Firebase App Check.
- Restricting the web API key by HTTP referrer in Google Cloud Console.
- Validating and tightening the hosting CSP against the live app.

## Phase 1 Final Sign-Off Notes

Use `PHASE1_QA_CHECKLIST.md` for final local smoke-test records. The sign-off should capture browser, viewport, date, tester, and pass/fail notes for the local MVP path.

The checks expected to pass now are the full six-lesson path, wrong-answer recovery, local resume, profile/mastery updates, and mobile/touch basics. Hosted Firebase checks require a real project configuration: cross-device sync, hosted auth/password reset, public HTTPS deploy, monitoring, and hosted concurrent-user testing.

## Important Files

- `src/domain.ts` defines the domain model for lessons, steps, profiles, progress, and mastery.
- `src/App.tsx` contains the main React application, screens, and learner flow (including the Log in / Create account auth screen).
- `src/authValidation.ts` holds the provider-neutral, pure email/password form validation shared by the auth UI and tests.
- `src/engine.ts` runs lesson progression, answer checks, and mastery updates.
- `src/backend.ts` provides the provider-neutral backend contract and local implementation.
- `src/firebaseBackend.ts` provides the Firebase Auth and Firestore implementation.
- `BACKEND_ADAPTERS.md` documents backend setup and extension notes.

## Next Priorities

The next phase should favor quality over quantity:

- Fill the Lesson 4-6 shells with focused interactive puzzles.
- Tighten the existing lesson experience before adding many new lessons.
- Improve feedback clarity for wrong answers and retries.
- Strengthen resume/profile/mastery behavior around edge cases.
- Add focused tests around the engine and local backend contracts.
- Keep backend adapter work scoped to a clean interface so Firebase or Supabase can be added without rewriting the lesson flow.
