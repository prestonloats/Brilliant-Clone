# Balance — Project State Report

_Last updated: 2026-06-23 · Branch: `cursor/project-state-report-ea4c` · Generated from a full codebase + document review._

> **Balance** is a learn-by-doing algebra app modeled on Brilliant. It teaches one
> course — **Algebra Foundations** — through interactive, hands-on steps anchored by a
> manipulable **balance scale**, with instant authored feedback and a mastery-aware path.
> See `Brilliant Practice PRD.md` for the full product spec and `README.md` for run steps.

---

## 1. Executive Summary

The project is a **healthy, well-built local MVP** of the learn-by-doing core. The build,
lint, and full test suite all pass cleanly, the flagship balance-scale interaction is
implemented well, and **all six lessons of the Algebra Foundations path are fully
authored** (not stubs). Code quality is high: typed content model, a pure client-side
answer-checking engine, defensive input validation, and solid accessibility attention.

The **central gap** is that the entire hosted backend is deferred. The app runs only
against a browser-local backend (`localStorage`), so a cluster of PRD **P0** requirements
for the MVP gate are not met in a production sense: real email **+ password** auth,
cross-device persistence, enforced security rules, a public deployment, and
concurrent-user readiness. This deferral is deliberate and documented, but it is the main
thing standing between the current build and the PRD's stated Phase 1 acceptance bar.

The secondary theme is **documentation drift**: several docs still describe lessons 4–6 as
unbuilt "shells" and describe mastery as an "EWMA" — neither matches the current code.

| Area | Status |
| --- | --- |
| Build (`npm run build`) | Passing — single bundle 279.7 kB (84.2 kB gzip), CSS 20.5 kB |
| Lint (`npm run lint`) | Passing — no errors/warnings |
| Tests (`npm test`) | Passing — 62/62 (engine + backend logic only) |
| Learn-by-doing core | Strong — 6 authored lessons, flagship balance scale works |
| Hosted backend (Firebase) | **Not wired** — local-only; `firebase` provider fails closed |
| Production auth (password) | **Missing** — email + display name only, no password |
| Deployment | **None** — `firebase.json` configured but nothing deployed |
| Automated UI / E2E tests | **None** — only pure-logic unit tests |
| CI | **None** — no `.github` workflows |

---

## 2. Tech Stack & Architecture (as built)

- **Frontend:** React 19 + Vite 8 + TypeScript ~6.0, single-page app. `StrictMode` enabled.
- **Tests:** Node's built-in test runner (`node --test`) over compiled TS; no React testing lib.
- **Lint:** ESLint 10 (flat config) with `typescript-eslint`, react-hooks, react-refresh.
- **Backend (current):** `LocalBackend` in `src/backend.ts` — profiles/progress/mastery/attempts
  in `window.localStorage`, active session in tab-scoped `sessionStorage`.
- **Backend (planned):** Firebase Auth + Firestore + Hosting. SDK is installed and
  `firestore.rules` / `firebase.json` exist, but the adapter is not implemented.

**Module map (`src/`):**

| File | Lines | Role |
| --- | --- | --- |
| `domain.ts` | ~1680 | Typed content model + all lesson/skill/course data |
| `App.tsx` | ~1805 | Entire UI: every screen, step renderer, and balance-scale interaction |
| `engine.ts` | ~563 | Pure client-side checking, scoring, mastery thresholds, path/recommendation logic |
| `backend.ts` | ~487 | `Backend` contract + `LocalBackend` + provider factory (firebase throws) |
| `firebaseConfig*.ts` | ~100 | Env parsing / provider selection / fail-closed logic |
| `firebaseServices.ts` | ~29 | Firebase SDK init — **currently dead code (imported nowhere)** |

**Architecture is sound:** answer checking is a pure function over each step's spec
(`check(step, answer) -> { correct, feedback, reveal?, retryGuidance? }`), matching the PRD's
client-side-checking thesis (R24/N2). React components depend only on the app-owned `Backend`
interface, which is the right seam for swapping in Firebase later.

---

## 3. What Is Working (Current State)

- **Six fully authored lessons** with progressive skills:
  1. Balancing Equations · 2. One-Step Equations · 3. Two-Step Equations ·
  4. Like Terms & Variables on Both Sides · 5. Coordinate Plane · 6. Graphing Lines.
  Each has concept cards, assessed interactive steps, and a summary; all verified by tests.
- **Flagship balance scale (PRD R13/R19/R20):** pointer-drag with `setPointerCapture`,
  tap-to-place fallback, apply-operation buttons, live tilt + totals, `aria-live` change
  narration, and per-misconception hints. This is the strongest part of the app.
- **Six step types:** `concept`, `mcq`, `input`, `operation-choice`, `sequence`, `balance`.
- **Authored, escalating feedback (R9/R22/R23):** hint → explanation → reveal across attempts
  for input/operation-choice/sequence/balance; numeric equivalence checking accepts `3`,
  `x = 3`, `6/2` (R18) while rejecting unsafe expressions.
- **Progress & resume (R25, local):** exact-step resume persists across refresh in the same
  browser; per-lesson progress, completion history, latest/best scores.
- **Mastery + path (R26/R27/R30):** per-skill scores, prerequisite locking/unlocking,
  recommended-next-lesson, and "review suggested" when mastery is below threshold.
- **Profile/mastery screen (R4):** display name, per-skill mastery, attempt counts.
- **Accessibility (N8):** ARIA labels/roles, keyboard tap alternative to drag,
  non-color feedback text, and a `prefers-reduced-motion` rule in CSS.
- **Fail-closed Firebase guard:** selecting `VITE_BACKEND_PROVIDER=firebase` before the
  adapter exists shows a clear setup error instead of silently using local storage.

---

## 4. What Needs To Be Done (Gaps vs. PRD)

Prioritized against the PRD's requirement IDs. **P0 = MVP gate**, **P1 = fast-follow**, **P2 = later**.

### 4.1 P0 — blocks the stated MVP gate (all tied to the deferred backend)

- **Real auth with password (R1, R2, N12).** Current sign-in matches on email existence with
  **no password**. Needs Firebase Auth email/password with persistent sessions.
- **Cross-device persistence / sync (R25 cross-device, N5).** Progress lives in `localStorage`,
  so it does not survive a device/browser change. Needs Firestore-backed progress/mastery/attempts.
- **Enforced security rules (N11).** `firestore.rules` look correct (per-user access, read-only
  content) but are inert because nothing is deployed and no client reads/writes Firestore.
- **Deployed & public (N13).** `firebase.json` targets `dist` hosting, but there is no deploy.
- **Concurrent-user readiness (N9).** Cannot be demonstrated without a hosted deploy.

> These are explicitly deferred in `README.md`, `BACKEND_ADAPTERS.md`, and
> `PHASE1_QA_CHECKLIST.md` (reframed as a "local MVP"), but the PRD still lists them as P0
> for the Phase 1 gate. Closing them requires building **`FirebaseBackend`** and converting
> the synchronous `Backend` contract to async (see `BACKEND_ADAPTERS.md` integration path).

### 4.2 P1 — richer "touch-the-idea" interactions still missing

The PRD frames direct manipulation as the product's core. Only the **balance scale** is a true
manipulative; lessons 4–6 use `sequence`/`operation-choice`/`mcq`/`input` instead of the
specified rich interactions:

- **Drag-terms across `=` with sign flip / like-term bins (R14).**
- **Interactive coordinate grid — tap/drag to plot points & lines (R15).** Currently order-the-steps tiles, not a grid.
- **Slope/intercept sliders driving a live line (R16, R20).** Currently MCQ/sequence, no live graph.
- **Free-experiment sandbox mode (R21).**
- **Escalation polish for MCQ (R23)** — see issue in §5.

### 4.3 P1/P2 — measurement, observability, and platform

- **No analytics / performance monitoring / App Check / Crashlytics** (PRD "Measurement & Tuning").
- **No offline-sync queueing (N6, N10)** beyond local storage's incidental offline behavior.
- **Anonymous-first-lesson** decision (PRD open question) is unimplemented — a profile is
  required before any lesson.

---

## 5. Current Issues (active problems / drift)

1. **Stale "shells" documentation (high-confidence drift).** `README.md` ("Next Priorities:
   Fill the Lesson 4-6 shells") and `PHASE1_QA_CHECKLIST.md` describe lessons 4–6 as
   lightweight shells, but `domain.ts` contains **full content** for all six lessons, and the
   tests assert complete assessed steps + summaries for each. The docs should be updated to
   reflect that the depth target is already met.

2. **Mastery is not an EWMA, despite docs.** `BACKEND_ADAPTERS.md` says "per-skill **EWMA**
   score," but `backend.ts` computes a **cumulative** ratio `correct / attempts`
   (rounded to 2 dp). This is a correctness/expectation mismatch and has a UX consequence
   (see §6.1).

3. **Dead/misleading `status` data in the course model.** `CourseLessonNode.status` is
   hardcoded in `domain.ts` (`'available'` / five `'locked'`), but the UI computes
   lock state dynamically via `isLessonUnlocked(...)` and never reads `status`. The
   `'coming-soon'` value and the `comingSoon = lesson.steps.length === 0` branch in `App.tsx`
   are now unreachable (no lesson has zero steps). This is dead, misleading state.

4. **MCQ checking bypasses the engine.** There is no `checkMcqStep` in `engine.ts`; the
   prediction step's correctness + hint-escalation logic is hand-rolled inline inside the
   `MultipleChoiceStep` component in `App.tsx`. Every other step type is checked by a tested
   engine function. This MCQ path is therefore **uncentralized and untested**.

5. **`firebaseServices.ts` is dead code.** It is the only module importing the real Firebase
   SDK, and nothing imports it, so it is tree-shaken out of the bundle. Harmless today, but it
   gives a false impression that Firebase is "partly wired."

6. **No CI.** There is no `.github/workflows`, so the passing lint/test/build are not enforced
   on push/PR. Regressions in untested UI code could land silently.

_No `TODO`/`FIXME`/`HACK` markers were found in `src/`, and there are no failing tests._

---

## 6. Potential Issues / Risks

1. **"Review suggested" can get stuck (mastery design).** Mastery is a cumulative success ratio
   with a fixed `MASTERY_READY_THRESHOLD = 0.65`, and **every** wrong attempt (including repeated
   misses on one step) counts against the skill. A learner who struggles early can be pinned
   below 0.65 with no recency-based recovery, so the path may keep nagging "Review suggested"
   even after they improve. An EWMA (as the docs intend) or counting only first-attempt-per-step
   would behave more fairly.

2. **Sync/async refactor risk.** The `Backend` contract is synchronous because `LocalBackend`
   touches storage directly. Firebase is async, so wiring it in requires threading promises and
   loading/error states through the React flows in `App.tsx`. This is non-trivial and touches the
   largest file.

3. **Maintainability of `App.tsx` (1805 lines) and `App.css` (1483 lines).** All screens, the
   step renderer, and the entire balance-scale interaction live in one component file with no
   component-level tests. As lessons 5–6 grow into real manipulatives, this file will be a
   regression hotspot.

4. **Local "auth" is a non-boundary.** Resuming by email with no password is fine for a single-
   device demo (and clearly labeled), but it must never reach production. The risk is shipping it
   by accident before the Firebase adapter lands.

5. **Single bundle / no code-splitting (N1).** Acceptable today (84 kB gzip), but the PRD calls
   for code-splitting and lazy-loading; adding canvas/SVG graph interactions for lessons 5–6 will
   inflate the main chunk unless splitting is introduced.

6. **Unresolved COPPA / age-gating (N12).** The audience is teens (Maya, 13). The sign-up path
   collects minimal PII, but there is no age gate or guardian-consent stance yet — a compliance
   risk once real accounts exist.

---

## 7. Recommended Next Steps (highest leverage first)

1. **Build the `FirebaseBackend` adapter** behind the existing `Backend` interface, converting the
   contract to async. This single workstream unlocks the entire stuck P0 cluster: password auth
   (R1/R2), cross-device persistence (R25/N5), active security rules (N11), deploy (N13), and
   concurrency (N9). Follow the staged plan already written in `BACKEND_ADAPTERS.md`.
2. **Deploy to Firebase Hosting** as soon as the adapter reaches local parity, to satisfy N13 and
   enable a real concurrent-user smoke test.
3. **Reconcile docs with code:** update `README.md` and `PHASE1_QA_CHECKLIST.md` to stop calling
   lessons 4–6 "shells," and either implement EWMA or fix the "EWMA" wording in
   `BACKEND_ADAPTERS.md`.
4. **Improve the mastery model:** move to EWMA or first-attempt-weighted scoring, and re-tune the
   0.65 threshold so "review suggested" can clear after sustained success.
5. **Centralize + test MCQ checking:** add `checkMcqStep` to `engine.ts` and unit-test it like the
   other step types; remove the inline logic from `App.tsx`.
6. **Add a test + CI safety net:** introduce React Testing Library component tests and one
   Playwright E2E for the core loop (sign in → complete Lesson 1 → resume), plus a GitHub Actions
   workflow running `lint`, `test`, and `build` on every PR.
7. **Deliver the missing manipulatives (R15/R16):** a real coordinate-grid plotter for Lesson 5 and
   slope/intercept sliders with a live line for Lesson 6, to meet the "touch-the-idea" bar.
8. **Refactor for scale:** split `App.tsx` into per-screen/per-step components (and split CSS), and
   add code-splitting/lazy-loading ahead of the heavier graph interactions.
9. **Clean up dead state:** remove or wire up `CourseLessonNode.status` and the unreachable
   `coming-soon` branch; remove `firebaseServices.ts` or connect it via the adapter.
10. **Decide the COPPA/age-gating and anonymous-first-lesson questions** before real accounts ship.

---

## 8. Verification Notes

All health claims in this report were verified on the current branch by running:

- `npm install` — 235 packages, 0 vulnerabilities.
- `npm run lint` — clean, exit 0.
- `npm test` — `tests 62 / pass 62 / fail 0`.
- `npm run build` — succeeds; `dist/assets/index-*.js` = 279.7 kB (84.2 kB gzip),
  `index-*.css` = 20.5 kB.

Code-level findings (dead `firebaseServices.ts`, inline MCQ checking, cumulative-ratio mastery,
hardcoded course `status`, full lesson 4–6 content) were confirmed by direct reading of
`src/` and `tests/`. Requirement IDs (R#/N#) reference `Brilliant Practice PRD.md`.
