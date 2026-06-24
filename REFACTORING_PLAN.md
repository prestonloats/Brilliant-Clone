# Refactoring Plan — Balance (Brilliant-style algebra app)

> Status: proposal / planning artifact. No application behavior is changed by this
> document. It is a sequenced, low-risk plan to reduce file size, remove duplication,
> and separate concerns while keeping the existing test suite green at every step.

## How to use this document

1. Read **Baseline & guardrails** so every change is verified against the same safety net.
2. Skim **Findings** for the evidence (each item cites `file:line`).
3. Execute **Phased plan** top to bottom. Each phase is independently shippable, ends with
   `lint + test + build` green, and is small enough to review in isolation.

---

## Baseline & guardrails

Current state on this branch (verified locally):

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | clean |
| Tests | `npm test` | **161 / 161 pass** |
| Build | `npm run build` | succeeds; warns vendor chunk **1,015 kB** > 500 kB |
| Security | `npm ci` | 0 vulnerabilities |

**Guardrails for every phase (non-negotiable):**

- The 161-test suite must stay green after each phase. Tests are the contract; do not edit a
  test to make a refactor pass unless the test asserts an implementation detail that is
  intentionally being moved (note it in the PR).
- No behavior change. These are pure structural moves (extract module, extract component,
  rename, dedupe). Feature changes are out of scope.
- Keep public import paths working via **barrel files** (`index.ts`) so consumers and tests do
  not churn. e.g. `./engine`, `./backend`, `./domain` keep resolving.
- One concern per PR. Never mix "split engine" with "split CSS".
- Preserve the existing port/adapter and "Firebase is lazy-loaded" properties (see "What is
  already good").

---

## Repository size snapshot (the problem in one table)

| File | Lines | Issue |
|------|------:|-------|
| `src/App.tsx` | **4162** | ~50 components + helpers + state container + drag logic in one file |
| `src/App.css` | **2931** | single monolithic stylesheet (428 rules, 19 `@keyframes`) |
| `tests/engine.test.ts` | **1494** | one giant test file spanning every engine concern |
| `src/engine.ts` | **1013** | 4 distinct domains (checkers / balance / progress / course-path) |
| `tests/backend.test.ts` | **665** | mirrors backend.ts monolith |
| `src/backend.ts` | **557** | contract + normalization + local impl + validation in one file |
| `src/content/types.ts` | **394** | IDs + 10 step schemas + domain models + course types |
| `src/content/lessons/two-step-equations.ts` | 361 | heavy authoring boilerplate |
| `src/content/lessons/like-terms.ts` | 321 | heavy authoring boilerplate |
| `src/content/lessons/one-step-equations.ts` | 282 | heavy authoring boilerplate |
| `src/firebaseBackend.ts` | 281 | duplicates local mastery/id logic |
| `src/content/lessons/balancing-equations.ts` | 277 | heavy authoring boilerplate |

`src` totals ~8.7k lines of TS/TSX; `App.tsx` alone is **48%** of it.

---

## Findings

### A. `src/App.tsx` — the monolith (highest priority)

One 4162-line file holds the entire UI plus several non-UI helpers. Logical clusters
(verified line ranges):

| Cluster | Symbols (with line) | Notes |
|---------|--------------------|-------|
| Bootstrap | `initializeBackend` (71), `App` (122) | backend selection + top-level routing |
| **State container** | `LearningApp` (150) | ~330 lines; **9 `useState`** + all data orchestration + all handlers (`completeStep`, `launchLesson`, `retakeLesson`, `handleSignedIn`, …). A "god component". |
| Session helpers | `getInitialLessonSession` (592), `getProgressForUser` (613), `getProgressByLesson` (622) | pure async data orchestration; not React |
| Status screens | `LoadingScreen` (480), `BackendConfigurationError` (492), `VerifyEmailScreen` (522) | |
| Auth | `AuthScreen` (643) | ~180 lines, self-contained |
| Course map | `CourseMap` (835), `CoursePathGraph` (933), `StageConnector` (980), `CoursePathNode` (1020) | |
| **Pure selectors** | `formatList` (1094), `getLessonProgressPercent` (1100), `getLessonProgressLabel` (1106), `getPathStatus` (1118), `getReviewSuggestedLessonId` (1148), `getCompletionState` (1155), `getAverageLessonMastery` (1165), `isCleanCompletion` (1176), `getLessonScoreText` (1186), `getScoreSummaryText` (1192), `getLessonScoreDetail` (1203) | **pure functions, no JSX** — trivially movable and unit-testable |
| Lesson player | `LessonPlayer` (1230), `StepRenderer` (1270) | dispatch by `step.type` |
| Step views | `ConceptCard` (1323), `MultipleChoiceStep` (1337), `NumericInputStep` (1455), `OperationChoiceStepView` (1526), `SequenceStepView` (1597), `ManipulativeStepView` (1736), `ManipulativeBuildView` (1978), `PlotStepView` (2228), `SliderStepView` (2563), `DragTermsStepView` (2799), `BalanceStepView` (3151) | the bulk of the file; each is its own feature |
| Step-view helpers | `PredictionScaleVisual`/`PredictScaleCard` (1417/1427), plot consts+helpers (2199–2226), slider helpers (2510–2561), term helpers (2774–2796), balance subviews `PhysicalScaleStage`/`PhysicalPan`/`Pan`/`BalanceTile` (3524/3589/3636/3682), `DragPreview` (3124) | |
| Shared primitives | `FeedbackPanel` (3711), `RetryPrompt` (3721), `ProgressBar` (3742), `MiniScale` (4006) | reused across many step views |
| Shared hooks | `usePrefersReducedMotion` (3766), `useCountUp` (3787) | |
| Result screens | `CompleteScreen` (3828), `getCompletionCopy` (3913), `ProfileScreen` (3955) | |
| **Misplaced domain logic** | `cloneBalanceState` (4018), `reconstructSolvedBalanceState` (4032), `formatSide` (4083) | non-React balance math living in the UI file |

Specific problems:

- **God component.** `LearningApp` (150) owns nine `useState` slices and every async handler,
  so all data flow is tangled in one render function. Hard to test, easy to break.
- **Duplicated drag-and-drop.** Pointer-drag logic (pointer down/move/up, zone hit-testing,
  drag-ghost state) is re-implemented three times: `ManipulativeStepView` (1736),
  `DragTermsStepView` (2799), `BalanceStepView` (3151). ~20 inline pointer handlers total.
- **Misplaced pure logic.** The selector cluster (1094–1209) and balance math (4018–4081)
  are not React and belong in `lib/`/`engine`, where they can be unit-tested directly.
- **Hardcoded content copy in UI.** `getCompletionCopy` (3913) hardcodes per-lesson
  congratulation text by `lesson.id` — content that belongs in the content layer.

### B. `src/engine.ts` (1013 lines) — four domains in one module

Distinct responsibilities that share only `domain` types:

- Step checkers: `checkInputStep`, `checkOperationChoiceStep`, `checkSequenceStep`,
  `checkManipulativeStep`, `checkPlotStep`, `checkSliderStep`, `checkDragTermsStep`.
- Balance mechanics: `sideTotal`, `isLevel`, `applyBalanceOperation`, `checkBalanceStep`,
  `cloneBalanceState` (544), `applyAmount`, `createWeightId`.
- Progress & scoring: `createInitialProgress`, `calculateLessonScore`, `getLatestLessonScore`,
  `getBestLessonScore`, `restartLessonProgress`, `applyStepResult`.
- Course path: `getRecommendedNextLesson`, `isLessonUnlocked`, `buildLessonGraph`,
  `getRecommendedPathLessonId`, `getCourseProgressSummary`.

Problems:

- **Repeated hint/feedback scaffolding.** The `hintFor` + `wrong` closure pair is duplicated
  in four checkers (≈ lines 218, 299, 383, 431). `buildWrongResult` (51–121) duplicates its
  attempt-2/attempt-3 ladder across two branches.
- **Content coupling.** `nextLessonRecommendations` (≈ 812–837) hardcodes lesson titles/body
  copy inside the engine; this is content, not logic.
- **Magic numbers.** `MASTERY_READY_THRESHOLD = 0.65` (33), numeric tolerances `0.001` /
  `1e-9`, all undocumented and scattered.
- **Duplicate of UI.** `cloneBalanceState` (544) is private here and re-declared in `App.tsx`
  (4018).

### C. `src/backend.ts` (557) + Firebase adapter

- **Mixed concerns** in `backend.ts`: interface/contract (31–63), runtime normalization
  (~99–296), `LocalBackend` implementation (~338–520), factory + validation (522–556).
- **Duplicated mastery math.** `LocalBackend` mastery update (422–449) and
  `firebaseBackend.ts` `updateSkillMastery` (178–211) implement the identical formula and the
  same empty-`SkillMastery` seed.
- **Duplicated id generation.** `crypto.randomUUID()`-with-fallback exists as `createId`
  (backend.ts ~315) and `createWeightId` (engine.ts ~551).
- **Duplicated type.** `BackendProvider` (`'local' | 'firebase'`) is declared in both
  `backend.ts` (55) and `firebaseConfigCore.ts` (1) — drift risk.
- **Two validators, two message sets.** `authValidation.ts#validateAuthForm` and
  `backend.ts#validateSignUpInput` (298–313) both validate email/displayName with different
  strings.
- **Cross-layer coupling.** `firebaseBackend.ts` imports normalization helpers from
  `backend.ts`, so the Firebase adapter depends on the local-backend module rather than a
  neutral persistence module.

### D. Content / lesson-authoring layer

- `content/types.ts` (394) mixes id unions, ten step schemas, interactive domain models
  (`BalanceState`, `PlotPoint`, …), and course/catalog types.
- **Inconsistent feedback shapes.** `Feedback` base vs. `BalanceStep`'s bespoke `{correct,
  hints, reveal}` (no `incorrect`) vs. manipulative/plot/slider/dragTerms variants. Authors
  must remember four shapes.
- **Authoring boilerplate** repeated across the 6 lesson files: balance "isolate unknown"
  steps (~35 lines × 5), sequence "solve" steps (12+), input `accept` lists (15+), plot
  ranges `{min:-5,max:5}` (×4), slider ranges `{min:-6,max:6}` (×2), dragTerms bins (×3).
- **Title drift.** Lesson titles are duplicated in `course.ts` and each lesson file.
- **Dead reference file.** `content/examples/manipulative-example.ts` is copy/paste source,
  not imported — its hints are near-duplicated in real lessons.

### E. `src/App.css` (2931 lines)

- One monolithic stylesheet for the entire app: 428 rules, 19 `@keyframes`, 2 `@media`
  blocks, all global selectors. No design tokens (`:root` variables), no co-location with the
  components they style. Changing one step view risks unrelated selectors.

### F. Build / bundle

- `npm run build` warns: vendor chunk is **1,015 kB** (React + KaTeX + Firebase SDK). No
  manual chunking. KaTeX is loaded eagerly even though equations appear only inside lessons.

### G. Tests

- `tests/engine.test.ts` (1494) and `tests/backend.test.ts` (665) mirror the monoliths. After
  splitting source, split these to match the new module boundaries.
- `equationLatex.ts` (regex-heavy) has **no unit tests** — add characterization tests before
  touching it.

### Cross-cutting duplication (consolidated)

| Duplicated thing | Locations | Fix |
|------------------|-----------|-----|
| `cloneBalanceState` | `engine.ts:544`, `App.tsx:4018` | export from engine; delete UI copy |
| Mastery update formula | `backend.ts:422`, `firebaseBackend.ts:178` | `applyMasteryAttempt(existing, correct)` |
| UUID + fallback | `backend.ts` `createId`, `engine.ts` `createWeightId` | `lib/id.ts#createId(prefix?)` |
| `BackendProvider` type | `backend.ts:55`, `firebaseConfigCore.ts:1` | single source, re-export |
| Email/name validation | `authValidation.ts`, `backend.ts:298` | one shared validator |
| Hint/`wrong` closures | `engine.ts` ×4 | one generic `hintFor` helper |
| Pointer-drag logic | `App.tsx` ×3 step views | `usePointerDrag` hook |
| Lesson titles | `course.ts` + lesson files | derive catalog from lessons |

### What is already good (preserve, do not "refactor" away)

- Pure engine with **no React/IO** — keep it that way.
- Provider-neutral **port/adapter** backend contract.
- **Firebase is dynamically imported** only in Firebase mode (`App.tsx` 89–92); never regress
  this into the default local bundle.
- **Data-driven content** model (one lesson per file + barrel catalog).
- `firebaseConfigCore` / `firebaseConfig` split (testable core + thin Vite binding).
- Strong test coverage enforcing structural invariants.

---

## Target directory structure (after)

```
src/
  app/
    App.tsx                 # thin: bootstrap + route by view
    useLearningSession.ts   # reducer + handlers extracted from LearningApp
    backendStartup.ts       # initializeBackend
    session.ts              # getInitialLessonSession / getProgressForUser / getProgressByLesson
  screens/
    AuthScreen.tsx
    VerifyEmailScreen.tsx
    CourseMap/ (CourseMap, CoursePathGraph, StageConnector, CoursePathNode)
    CompleteScreen.tsx
    ProfileScreen.tsx
    StatusScreens.tsx       # Loading + BackendConfigurationError
  components/
    steps/
      StepRenderer.tsx
      ConceptCard.tsx  MultipleChoiceStep.tsx  NumericInputStep.tsx
      OperationChoiceStep.tsx  SequenceStep.tsx
      ManipulativeStep.tsx  ManipulativeBuildView.tsx
      PlotStep.tsx  SliderStep.tsx  DragTermsStep.tsx  BalanceStep.tsx
    common/                 # FeedbackPanel, RetryPrompt, ProgressBar, MiniScale, DragPreview
  hooks/                    # usePrefersReducedMotion, useCountUp, usePointerDrag
  lib/
    lessonSelectors.ts      # the pure score/progress/mastery helpers from App.tsx
    id.ts                   # createId
    format.ts               # formatList, formatSide, formatLineEquation
  engine/
    index.ts feedback.ts checkers/* balance.ts progress.ts coursePath.ts types.ts
  backend/
    index.ts types.ts normalize.ts validation.ts masteryLogic.ts localBackend.ts factory.ts
  firebase/                 # firebaseBackend, *Core, services, config (grouped)
  content/
    types/ (ids, feedback, steps, balance, plot, slider, dragTerms, lesson)
    authoring/              # builders: balanceIsolateStep, sequenceSolve, acceptNumeric, ...
    lessons/* course.ts skills.ts
  styles/                   # tokens.css + per-feature css (split from App.css)
```

Existing import specifiers (`./engine`, `./backend`, `./domain`) keep resolving via barrels.

---

## Phased plan

Phases are ordered by **safety and leverage**: pure-logic extractions first (lowest risk,
immediately testable), then UI decomposition, then deeper module splits.

### Phase 0 — Guardrails (no source moves)

- **Goal:** make later phases safe to verify.
- **Steps:**
  - Add characterization tests for untested risky code: `equationLatex.ts`
    (`equationToLatex`, `equationToAriaLabel`).
  - Record the bundle baseline (vendor 1015 kB) in the PR so Phase 6 can prove improvement.
- **Acceptance:** new tests pass; total test count increases; no source files moved.

### Phase 1 — Extract pure logic out of `App.tsx`

- **Goal:** delete the non-React code from the UI file with zero risk.
- **Scope / steps:**
  1. Move the selector cluster (`App.tsx` 1094–1209) to `src/lib/lessonSelectors.ts`; import
     back into `App.tsx`. Add direct unit tests for each (they were previously only tested
     through the UI).
  2. Move `cloneBalanceState` / `reconstructSolvedBalanceState` / `formatSide`
     (4018–4081+) into `engine` (balance module) and **export** the canonical
     `cloneBalanceState`; delete the duplicate (kills finding G #1).
  3. Move `formatList`/`formatLineEquation` to `lib/format.ts`.
- **Risk:** very low — pure functions, behavior identical, now unit-tested.
- **Acceptance:** `App.tsx` shrinks by ~250 lines; new unit tests; 161 + new tests green.

### Phase 2 — Extract shared UI primitives, hooks, and the drag hook

- **Goal:** stop re-implementing the same widgets and pointer logic.
- **Steps:**
  1. Move `FeedbackPanel`, `RetryPrompt`, `ProgressBar`, `MiniScale`, `DragPreview` to
     `components/common/`.
  2. Move `usePrefersReducedMotion`, `useCountUp` to `hooks/`.
  3. Introduce `hooks/usePointerDrag.ts` capturing the shared pointer-down/move/up + ghost
     state, and refactor `ManipulativeStepView`, `DragTermsStepView`, `BalanceStepView` to use
     it (kills finding G #7). Do this as one focused PR with manual drag testing.
- **Risk:** medium for the drag hook (interaction behavior). Mitigate with a screen-recorded
  manual test of each draggable step and reduced-motion mode.
- **Acceptance:** three step views share one drag implementation; tests green.

### Phase 3 — Split each step view into its own module

- **Goal:** make the bulk of `App.tsx` reviewable.
- **Steps:** move each step view + its private helpers into `components/steps/*` (one file per
  step type), keep `StepRenderer` as the dispatch. Co-locate step-specific helpers
  (plot/slider/term/balance subcomponents) with their step.
- **Risk:** low (mechanical moves) but high churn — do one step type per PR.
- **Acceptance:** `App.tsx` no longer contains step-view bodies; tests green.

### Phase 4 — Extract screens and the state container

- **Goal:** reduce `App.tsx`/`LearningApp` to composition + routing.
- **Steps:**
  1. Move `AuthScreen`, `VerifyEmailScreen`, `CourseMap` (+ graph parts), `CompleteScreen`,
     `ProfileScreen`, status screens to `screens/`.
  2. Move session helpers (592–636) to `app/session.ts` and `initializeBackend` to
     `app/backendStartup.ts`.
  3. Extract `LearningApp`'s state into `app/useLearningSession.ts` using `useReducer`
     (actions: `signedIn`, `signedOut`, `lessonLoaded`, `stepCompleted`, `error`, …). `App`
     becomes a thin router over `view`.
- **Risk:** medium — the reducer migration touches app data flow. Keep reducer transitions
  1:1 with current `setState` calls; no behavior change.
- **Acceptance:** `App.tsx` < ~200 lines; `LearningApp` replaced by a hook; tests green.

### Phase 5 — Split `engine.ts`

- **Goal:** one module per engine domain.
- **Steps:** create `engine/{feedback,balance,progress,coursePath,types}.ts` and
  `engine/checkers/*`; re-export everything from `engine/index.ts` so `./engine` imports are
  unchanged. Extract one generic `hintFor` helper (kills G #6). Move
  `nextLessonRecommendations` copy into the content layer.
- **Risk:** low (pure functions, strong tests). Split `tests/engine.test.ts` to mirror.
- **Acceptance:** no file > ~300 lines in `engine/`; 161 tests pass (relocated).

### Phase 6 — Split `backend.ts` + de-duplicate the adapters

- **Goal:** separate contract from implementation; share logic with Firebase.
- **Steps:**
  1. `backend/types.ts` (contract), `backend/normalize.ts`, `backend/validation.ts`,
     `backend/localBackend.ts`, `backend/factory.ts`, barrel `backend/index.ts`.
  2. `backend/masteryLogic.ts#applyMasteryAttempt` used by both `LocalBackend` and
     `FirebaseBackend` (kills G #2).
  3. `lib/id.ts#createId` shared by backend + engine (kills G #3).
  4. Single `BackendProvider` source, re-exported (kills G #4).
  5. Point `firebaseBackend` at `backend/normalize` instead of `backend.ts`.
- **Risk:** low–medium; covered by `backend.test.ts` (split it to match).
- **Acceptance:** no backend file > ~250 lines; mastery math defined once; tests green.

### Phase 7 — Content authoring helpers + `types.ts` split

- **Goal:** cut lesson boilerplate and normalize schemas.
- **Steps:**
  1. Split `content/types.ts` by concern (`ids`, `feedback`, `steps`, per-interaction models,
     `lesson`) with a re-export barrel.
  2. Add `content/authoring/` builders: `balanceIsolateStep`, `sequenceSolve`,
     `acceptNumericAnswer`, `acceptCoordinate`, `DEFAULT_PLOT_RANGE`, `DEFAULT_SLIDER_RANGE`,
     standard hint templates. Migrate lessons one file per PR; lesson tests must stay green.
  3. Derive the `course.ts` catalog titles from the lesson objects (kills title drift).
  4. Decide the fate of `examples/manipulative-example.ts` (delete or convert to a builder).
- **Risk:** low; lesson tests assert step ids/structure and will catch mistakes.
- **Acceptance:** lesson files materially smaller; feedback shapes unified; tests green.

### Phase 8 — CSS decomposition (independent track)

- **Goal:** make styles maintainable and co-located.
- **Steps:** extract a `styles/tokens.css` (`:root` design tokens), then split `App.css` into
  per-feature stylesheets imported by their components (e.g. `BalanceStep.css`,
  `coursePath.css`, `complete.css`). Keep class names initially to avoid visual regressions;
  optionally adopt CSS Modules per component afterward.
- **Risk:** medium (visual). Mitigate with before/after screenshots of each screen.
- **Acceptance:** no single CSS file > ~500 lines; visual parity confirmed.

### Phase 9 — Bundle splitting (independent track)

- **Goal:** clear the >500 kB warning.
- **Steps:** configure manual chunks (`react`/`react-dom`, `katex`, `firebase`) in
  `vite.config.ts`; consider lazy-loading KaTeX/`MathText` so equations load on demand.
  Preserve the existing Firebase dynamic-import behavior.
- **Acceptance:** vendor chunk meaningfully reduced; build warning resolved; default
  (local-mode) bundle does not include Firebase.

---

## Sequencing & dependencies

```
Phase 0 (guardrails)
   └─> Phase 1 (pure logic) ─> Phase 2 (primitives+drag) ─> Phase 3 (step views) ─> Phase 4 (screens+state)
Phase 5 (engine split)      ── independent of UI, can run in parallel after Phase 1
Phase 6 (backend split)     ── independent, after Phase 1 (needs lib/id)
Phase 7 (content)           ── independent
Phase 8 (CSS)               ── fully independent track
Phase 9 (bundle)            ── fully independent track
```

`lib/id.ts` (Phase 1/6) is the only shared prerequisite; everything else can proceed in
parallel by area as long as each PR ends green.

## Risk register / do-not-break list

- Do not regress Firebase lazy-loading into the default bundle.
- Do not change `firestore.rules`-related behavior or auth/verification flow during structural
  moves.
- Do not alter scoring/mastery numbers (`MASTERY_READY_THRESHOLD`, tolerances) — extract as
  named constants only.
- Keep barrels so `./engine`, `./backend`, `./domain` import paths remain stable.
- Drag interactions (Phase 2/3) and CSS (Phase 8) are the only changes needing manual/visual
  verification beyond the unit suite.

## Effort vs. impact (technical, not calendar)

| Phase | Files touched | Invasiveness | Risk | Payoff |
|-------|---------------|--------------|------|--------|
| 0 Guardrails | +1 test | trivial | none | enables the rest |
| 1 Pure logic | `App.tsx`, +`lib/*`, engine | low | low | −250 lines from App; new unit tests |
| 2 Primitives + drag hook | `App.tsx`, +`hooks/`, `components/common/` | medium | medium | kills 3× drag duplication |
| 3 Step views | `App.tsx` → `components/steps/*` | high churn | low | App becomes navigable |
| 4 Screens + reducer | `App.tsx` → `screens/`, `app/*` | medium | medium | removes the god component |
| 5 Engine split | `engine.ts` → `engine/*` | medium | low | 4 domains separated |
| 6 Backend split | `backend.ts` → `backend/*` | medium | low–med | de-dupes adapters |
| 7 Content | `types.ts`, lessons, `authoring/` | medium | low | smaller lessons, unified schema |
| 8 CSS | `App.css` → `styles/*` | high churn | medium | maintainable styles |
| 9 Bundle | `vite.config.ts` | low | low | resolves build warning |
