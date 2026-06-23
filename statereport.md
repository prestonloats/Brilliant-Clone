# Balance — Project State Report

- **Project:** Balance (repo `brilliant-clone`) — a Brilliant-style, learn-by-doing **Algebra Foundations** web app.
- **Report date:** 2026-06-23
- **Branch:** `cursor/project-state-report-5918` · **Base:** `main` · **Latest commit:** `f438be9 Harden local auth and prepare Firebase`
- **Reviewed:** full source (`src/`), tests (`tests/`), PRD, BrainLift, README, QA checklist, backend-adapter notes, Firebase/Vite/TS/ESLint config.

> This report describes the current state of the project, what is working, what is missing relative to the PRD, current and potential issues, and prioritized recommendations. It is intended to be re-generated/updated over time.

---

## 1. Executive Summary

Balance is a **healthy, well-structured Phase 1 MVP** that runs entirely browser-local (no AI, no server), exactly as the PRD's Phase 1 hard gate intends. The core learn-by-doing loop is real and complete: an authored lesson catalog, a directly-manipulated balance scale, instant per-answer authored feedback with hint → explanation → reveal escalation, mastery-gated path unlocking, exact-step resume, and a profile/mastery view.

**Health checks (all green) — run during this review:**

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Pass (0 problems) |
| Tests | `npm run test` | Pass — **62/62** |
| Build | `npm run build` | Pass — `dist` ~280 KB JS (**84 KB gzip**), 20 KB CSS |

**Most important takeaways:**

1. **The documentation understates the product.** The README and QA checklist repeatedly describe Lessons 4–6 as "lightweight shells" / "coming soon." In reality **all six lessons are fully authored and tested** in `src/domain.ts`. The docs are stale and should be corrected.
2. **The biggest real gap is the hosted backend.** Auth/persistence are browser-local only. Firebase is scaffolded (config, rules, hosting) but **not wired** — there is no `FirebaseBackend` adapter, no deploy, no cross-device sync. This is a deliberate, documented deferral, but it blocks PRD P0 items N5/N9/N11/N13 and R1/R2.
3. **A few concrete bugs/quality issues exist** — most notably an **accessibility gap on the flagship drag step** (no keyboard/tap fallback) and **per-skill mastery that conflates skills** within multi-skill lessons.
4. **Later lessons (5–6) don't use the PRD's signature interactions** (interactive coordinate grid, live slider graph, drag-terms). They are taught with tap/order/multiple-choice steps instead, which is a partial retreat from the "touch the idea" thesis for those concepts.

---

## 2. What the Project Is

A client-heavy SPA that teaches one subject deeply — algebra — for one persona (Maya, a new-to-algebra 8th grader), modeled on Brilliant's learn-by-doing pedagogy. A lesson is a structured, typed sequence of interactive steps rendered by a generic player; answer checking is a pure client-side function; progress and mastery drive an unlock/recommend path.

**Stack (as built):**

- **Frontend:** React 19 + Vite 8 + TypeScript ~6.0 (single-page app, `useState`-driven view switching, no router).
- **Backend (current):** `LocalBackend` over `localStorage` (data) + `sessionStorage` (active session). No network calls at runtime.
- **Backend (planned, scaffolded only):** Firebase Auth + Firestore + Hosting; `firestore.rules` and `firebase.json` exist; `firebaseConfig*.ts` / `firebaseServices.ts` initialize the SDK only when env is present.
- **Tests:** `node:test` over compiled TS (`engine` + `backend` suites).

---

## 3. Architecture Overview

The separation of concerns is clean and is the project's biggest strength:

| Layer | File | Lines | Responsibility |
| --- | --- | --- | --- |
| Domain / content | `src/domain.ts` | ~1680 | Types + the full authored lesson catalog, skills, and course path (data, not code). |
| Engine (pure logic) | `src/engine.ts` | ~560 | Answer checking, scoring, mastery thresholds, recommendations, unlock rules. No I/O. |
| Persistence | `src/backend.ts` | ~490 | `Backend` contract + `LocalBackend`; strong validation/normalization of persisted data; fails-closed Firebase. |
| UI | `src/App.tsx` | ~1805 | All screens + the balance-scale drag interaction, in one file. |
| Firebase config | `src/firebaseConfig*.ts`, `firebaseServices.ts` | ~125 | Env parsing, provider selection, lazy SDK init (currently unused at runtime). |

Key architectural decisions that match the PRD well:
- **Content-as-data:** lessons are typed step arrays interpreted by `StepRenderer`; adding a lesson is (mostly) authoring data.
- **Client-side checking:** `check*` functions are synchronous pure functions → instant feedback, offline-capable, zero per-answer server cost.
- **App-owned `Backend` interface:** React only talks to the contract, so a Firebase/Supabase adapter can slot in behind it (per `BACKEND_ADAPTERS.md`).

---

## 4. Current State — What Works

### 4.1 Content (exceeds the P0 bar)
All six Algebra Foundations lessons are authored, wired into the path, and covered by content-integrity tests:

1. **Balancing Equations** (flagship) — concept → predict (MCQ) → **drag-to-level balance scale** → unknown box → numeric input → apply-to-both-sides → operation-choice → sequence → summary.
2. **One-Step Equations** — inverse operations incl. ×/÷, with balance, operation-choice, sequence, and input steps.
3. **Two-Step Equations** — reverse-order solving, misconception spotting.
4. **Like Terms & Variables on Both Sides** — classify/combine terms, gather variables.
5. **Coordinate Plane** — ordered pairs, quadrants.
6. **Graphing Lines** — slope-intercept matching, point generation, tables.

Step types implemented: `concept`, `mcq`, `input`, `balance`, `operation-choice`, `sequence`.

### 4.2 Learning loop
- **Directly-manipulated balance scale** with real-time tilt, pointer drag (touch + mouse via Pointer Events), `elementFromPoint` drop detection, and animated pan bounce.
- **Authored feedback everywhere** — per-option (MCQ/operation-choice), per-answer (`hintsByAnswer`), per-tile (`hintsByTile`), and balance hint states — with **escalation** (hint → explanation → reveal on the 3rd miss) implemented in `buildWrongResult`.
- **Exact-step resume** via `currentStepIndex`, persisted per `userId:lessonId`.
- **Mastery-gated path**: `isLessonUnlocked` enforces prerequisites; `getRecommendedPathLessonId` prefers in-progress → next-available → last-completed; completion screen recommends the next lesson or a review.
- **Scoring & retake**: first-try score, best score, completion history; retake preserves history.
- **Profile/mastery view**: per-skill score, attempts, and a recorded attempt-event count.

### 4.3 Robustness & safety
- `LocalBackend` **sanitizes corrupt/malformed `localStorage`** (bad JSON, invalid records, out-of-range step indices, malformed scores) without crashing — well tested.
- **No passwords persisted** in local demo mode; active session is tab-scoped.
- **Firebase fails closed**: selecting `VITE_BACKEND_PROVIDER=firebase` before the adapter exists throws a clear startup error instead of silently using local storage.
- `firestore.rules` enforce per-user read/write and read-only content with a default-deny catch-all.

### 4.4 Accessibility & mobile (partial, mostly good)
- 44px min touch targets, `@media (max-width: 720px)` responsive layout, `prefers-reduced-motion` disables animations, ARIA labels on the scale/progress/forms, `aria-live` change notes. (One important exception — see Issue 6.1.)

---

## 5. Requirements Coverage vs PRD

Status legend: ✅ done · 🟡 partial · ❌ not implemented · ⏸️ intentionally deferred.

### P0 (MVP gate)

| ID | Requirement | Status | Notes |
| --- | --- | --- | --- |
| R6 | Structured content model (typed steps) | ✅ | Tagged-union steps in `domain.ts`. |
| R7 | One fully built interactive lesson | ✅ | All six built; flagship is complete. |
| R8 | Frontend renders any lesson from the model | ✅ | `StepRenderer` maps type→component. |
| R9 | Authored right/wrong feedback (no bare ✗) | ✅ | Per-option/answer/tile + escalation. |
| R10 | Course with ordered path + prerequisites | ✅ | `algebraCourse` + `prerequisites`. |
| R13 | Balance-scale direct manipulation | ✅ | Pointer drag + apply-to-both-sides. |
| R19 | Real-time responsive visual | 🟡 | Scale only; Lessons 5–6 lack live visuals. |
| R22 | Instant feedback w/ short why | ✅ | Client-side, synchronous. |
| R24 | Client-side feedback < 100ms | ✅ | Pure functions, no network. |
| R25 | Resume at exact step | 🟡 | Same-browser only (no cross-device). |
| R26 | Per-skill mastery tracking | 🟡 | Skills conflated in multi-skill lessons (Issue 6.2). |
| R27 | Unlock/recommend next by mastery+prereq | ✅ | Rule-based, tested. |
| R30 | Sensible recommended next step | ✅ | Completion screen + path. |
| R1/R2 | Email+password account, persistent auth | 🟡/⏸️ | Local demo (email-only, no password); not real auth. |
| N1 | First interaction < 2s (code-split) | 🟡 | Small bundle, but **single chunk**, no lazy-load. |
| N2 | Feedback < 100ms | ✅ | Client-side. |
| N3 | 60 FPS interaction | 🟡 | Likely met (CSS transforms/RAF); not measured. |
| N5 | Persist across sessions **and devices** | 🟡 | Sessions yes; **devices no** (local only). |
| N7 | Works on phone w/ touch, one-thumb | 🟡 | Yes, except drag step keyboard gap (Issue 6.1). |
| N9 | Many concurrent learners | ⏸️ | No deploy/backend yet. |
| N11 | Per-user security rules | ⏸️ | Rules written but **not active** (no live Firebase). |
| N12 | Hashed creds, HTTPS, COPPA-aware | ⏸️ | Deferred to hosted auth. |
| N13 | Deployed & public | ❌/⏸️ | Not deployed. |

### P1 / P2 (selected)

| ID | Requirement | Status | Notes |
| --- | --- | --- | --- |
| R11 | MCQ per-option feedback | ✅ | Implemented. |
| R14 | Drag-terms across `=` | ❌ | Not built; like-terms uses tap/sequence. |
| R15 | Interactive coordinate grid | ❌ | Coordinate-plane uses sequence/MCQ/input, no grid. |
| R16 | Sliders driving a live graph | ❌ | Graphing-lines uses MCQ/sequence/input, no slider/line. |
| R18 | Numeric/expression equivalence | 🟡 | Accepts plain number + single fraction only; rejects `1+2`. |
| R23 | Escalating hints | ✅ | hint → explanation → reveal. |
| R28 | Repair/review before advancing | 🟡 | Soft "Review suggested" label only; not enforced. |
| R29 | Per-attempt signals captured | ✅ | `AttemptEvent` log (stepId, correct, count, msToAnswer). |
| N6 | Graceful offline/sync | 🟡 | Works offline (local); no sync layer. |
| N8 | Reduced motion, contrast, non-color feedback | ✅ | Implemented. |

---

## 6. Current Issues (concrete, actionable)

### 6.1 Flagship drag step has no keyboard/tap fallback (accessibility bug) — High
The only drag-and-drop step in the app is `drag-to-level` (Balancing Equations), which uses `layout: 'physical-drag'`. In `BalanceStepView`, the "Place on left/right pan" buttons that serve as the non-pointer fallback are rendered only when **not** physical-drag:

```1346:1355:src/App.tsx
              {!isPhysicalDrag && (
                <>
                  <button type="button" disabled={correct} onClick={() => quickDrop(item, 'left')}>
                    Place {item.label} on left pan
                  </button>
                  <button type="button" disabled={correct} onClick={() => quickDrop(item, 'right')}>
                    Place {item.label} on right pan
                  </button>
                </>
              )}
```

Because the bank tile button only wires `onPointerDown` (no `onClick`/key handler), **keyboard-only users cannot complete the flagship step**, and there is no tap alternative. This directly contradicts the QA checklist's claim ("balance tile placement can be completed without pointer dragging by using the Left and Right buttons") and PRD N7/N8. Fix: render the tap fallback for physical-drag too (or add key handlers to the tile).

### 6.2 Per-skill mastery conflates skills within a lesson — High
On every assessed step, `completeStep` updates **all** of the lesson's skills with the same correctness:

```146:150:src/App.tsx
    if (shouldRecordAttempt) {
      activeLesson.skillIds.forEach((skillId) =>
        backend.mastery.updateSkillMastery(user.id, skillId, correct),
      )
    }
```

Steps carry no skill tag, so for multi-skill lessons (`balancing-equations` → `equality` + `inverse-operations`; `like-terms-variables-both-sides` → `like-terms` + `variables-on-both-sides`) the two skills always receive identical scores. This undermines the granularity R26 promises and any future per-skill adaptivity/repair (R28). Fix: tag steps with the skill(s) they exercise and update only those.

### 6.3 Mastery model is a cumulative ratio, not EWMA — Medium
`updateSkillMastery` computes `score = correct / attempts` cumulatively:

```383:391:src/backend.ts
        const attempts = existing.attempts + 1
        const correctAttempts = existing.correct + (correct ? 1 : 0)
        const updated: SkillMastery = {
          ...existing,
          score: Math.round((correctAttempts / attempts) * 100) / 100,
          ...
        }
```

The PRD suggests an **EWMA** of correctness. A lifetime ratio (a) never lets a learner fully recover from early misses and (b) ignores recency. Combined with the fact that **every retry on a step records another attempt** (3 wrong tries + 1 right = 4 attempts, 1 correct), a struggling-but-improving learner can get stuck below the 0.65 ready threshold. Consider an EWMA or windowed estimate.

### 6.4 Documentation contradicts the code (Lessons 4–6 "shells") — Medium
README ("first three authored lessons, with shell lessons reserving the rest"; "Next Priorities: Fill the Lesson 4–6 shells") and `PHASE1_QA_CHECKLIST.md` ("unlocks as a lightweight shell") describe Lessons 4–6 as unbuilt. They are fully authored and tested. Update README, the QA checklist, and the "Next Priorities" section to reflect reality.

### 6.5 PRD references a `vite/` scaffold directory that doesn't exist — Low
The PRD's Tech Stack and "Resolved Decisions" sections refer to a scaffold "in `vite/`." The app actually lives at the repo root. Minor, but worth fixing to avoid confusion.

### 6.6 Dead/misleading content-status fields — Low
`CourseLessonNode.status` (`'available' | 'locked' | 'coming-soon'`) is hardcoded in `algebraCourse.lessons` but **ignored** at runtime — `getPathStatus` recomputes status from live progress/mastery. The `'coming-soon'` branch (`lesson.steps.length === 0`) is effectively unreachable since all lessons have steps. Either drive the UI from these fields or remove them.

---

## 7. Potential Issues / Risks

- **`App.tsx` is an 1805-line monolith.** All screens, helpers, and the entire drag interaction live in one file. This hurts readability, testability, code-splitting, and merge safety. Splitting into `components/`, `hooks/` (e.g. `useBalanceDrag`), and `screens/` would pay off quickly.
- **Zero UI/interaction tests.** Tests cover pure logic (engine/backend) thoroughly, but there are **no React render/interaction tests**. The most complex, bug-prone code (drag, pointer capture, `elementFromPoint`, view transitions) is verified only by a **manual** QA checklist. The drag a11y bug (6.1) is exactly the kind a render test would catch.
- **Drag relies on global pointer listeners + `document.elementFromPoint` + `[data-pan-side]`.** Functional but brittle to DOM/layout changes and untested; also not resilient to nested/overlapping elements or scroll offsets.
- **No routing / URL state.** View is `useState`; refresh recomputes the screen from progress (works) but there's no deep-linking, no back-button semantics, and "complete" view isn't directly addressable.
- **Backend contract is synchronous.** `LocalBackend` reads/writes storage inline. Firebase is async, so introducing it requires converting the `Backend` interface to async and threading loading/error states through React — a non-trivial refactor flagged in `BACKEND_ADAPTERS.md`.
- **Firestore rules are untested and inactive.** They look correct (per-user, content read-only, default deny) but there are no emulator tests, and the `content/**` path is aspirational (content currently ships in-bundle, not Firestore).
- **No analytics, performance monitoring, error reporting, or App Check.** PRD's measurement plan (Firebase Performance/Analytics/Crashlytics/Remote Config) is entirely future work; N1/N3 are unmeasured.
- **Single bundle / no lazy-loading.** Currently fine (84 KB gzip), but the Firebase SDK (~hundreds of KB) is in `dependencies` and will need to be code-split/lazy-loaded behind the adapter to keep N1 once it's wired. (Verified it is **not** in the current bundle because `firebaseServices.ts` is unimported at runtime.)

---

## 8. What Needs to Be Done (prioritized)

### P0 — to actually meet the PRD's Phase 1 gate
1. **Wire a hosted backend (Firebase).** Implement `FirebaseBackend` behind the `Backend` contract; convert the contract to async; migrate React flows to await + loading/error states. Unblocks R1/R2 (real auth + display name), R25/N5 (cross-device), N9 (concurrency), N11/N12 (rules + secure transport).
2. **Deploy publicly (N13).** `npm run build` + `firebase deploy` to a stable HTTPS URL; smoke-test concurrent users.
3. **Fix the drag-step accessibility gap (Issue 6.1).** Provide a keyboard/tap path for `drag-to-level`.

### P1 — quality and fidelity to the thesis
4. **Fix per-skill mastery conflation (6.2)** by tagging steps with skills.
5. **Build the signature interactions for Lessons 5–6:** interactive coordinate grid (R15) and live `m`/`b` slider graph (R16); consider drag-terms (R14). These concepts currently use tap/order/MCQ, which is the weakest fit to the product thesis.
6. **Enforce repair/review before advancing (R28)** rather than only labeling it.
7. **Reconsider the mastery model (6.3)** (EWMA/windowed; decide whether repeated same-step retries should each count).
8. **Add UI/interaction tests** (e.g. React Testing Library) for the lesson player, drag, and resume.

### P2 — hygiene & docs
9. **Update stale docs (6.4, 6.5):** README, QA checklist, PRD `vite/` references, "Next Priorities."
10. **Refactor `App.tsx`** into components/hooks/screens.
11. **Remove or actually use** the dead `CourseLessonNode.status` / `coming-soon` path (6.6).
12. **Add measurement/monitoring** (perf, analytics, error reporting) once hosted.

---

## 9. Ways to Improve (engineering quality)

- **Code-split for N1**: lazy-load heavier step components and (eventually) the Firebase SDK so the course map + first lesson load first; add `manualChunks`/`React.lazy`.
- **Introduce routing** (e.g. a tiny router or URL-driven view state) for deep-linking and predictable refresh/back behavior.
- **Extract a `useBalanceDrag` hook** and unit-test the drop math independent of the DOM; reduce reliance on `elementFromPoint`.
- **Type the content with a runtime validator** (e.g. a small schema/`zod`-style guard) so authored lessons are validated in dev and at the future Firestore boundary, paving the way for R12 (author lessons as data) and Phase-2 AI-generated content.
- **Expand expression equivalence (R18)** so common equivalent inputs (`1+2`, `2*2`) are accepted, with safe parsing.
- **CI**: add a workflow running `lint` + `test` + `build` on PRs (none present).
- **Firestore emulator tests** for the security rules before they go live.

---

## 10. Verification Evidence (this review)

```
npm install   → 235 packages, 0 vulnerabilities
npm run lint  → eslint . — no problems
npm run test  → tests 62 | pass 62 | fail 0
npm run build → dist/index.js 279.73 kB (gzip 84.20 kB), index.css 20.48 kB — built OK
```

Confirmed by inspection: the Firebase SDK is **not** in the production bundle (no `firestore`/`initializeApp` references), because `src/firebaseServices.ts` is not imported by the runtime entry path.

---

## 11. File / Test Inventory

- **Source:** `domain.ts` (content+types), `engine.ts` (logic), `backend.ts` (local persistence), `App.tsx` (UI), `firebaseConfig.ts` / `firebaseConfigCore.ts` / `firebaseServices.ts` (Firebase scaffold), `main.tsx`, `App.css` (~1480 lines), `index.css`.
- **Tests (62):** `tests/engine.test.ts` (checking/scoring/recommendations/path/content-integrity), `tests/backend.test.ts` (auth/progress/mastery/attempts + storage sanitization + Firebase config validation).
- **Config:** `vite.config.ts` (bare React), `tsconfig.*` (app/node/test split), `eslint.config.js`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` (empty), `.env.example`.
- **Docs:** `README.md`, `Brilliant Practice PRD.md`, `Brilliant Backend BrainLift.md`, `BACKEND_ADAPTERS.md`, `PHASE1_QA_CHECKLIST.md`, this `statereport.md`.

---

## 12. Bottom Line

Phase 1's **learn-by-doing core is genuinely done and solid** — clean architecture, strong pure-logic test coverage, authored escalating feedback, a real manipulable scale, and a mastery-gated six-lesson path that builds correctly. The project is **further along than its own docs admit** (all six lessons exist). To clear the PRD's stated Phase 1 gate it still needs the **hosted backend + public deploy** (the one large, known piece of work), and it should fix the **drag-step accessibility gap** and **mastery skill-conflation** soon. Lessons 5–6 would benefit from the PRD's signature plotting/slider interactions to stay true to the "touch the idea" thesis.
