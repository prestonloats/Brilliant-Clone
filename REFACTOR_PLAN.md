# Balance — Refactor Plan

> **Status:** Planning document. No application code is changed by this file.
> **Generated:** 2026-06-29 from a full-repository audit.
> **Scope:** Identifies poorly written code, AI slop, dead code, oversized files, and refactor
> candidates across the whole repo, then proposes a prioritized, sequenced plan to fix them.

This plan is meant to be executed in small, independently shippable slices. Every item cites
`file:line` evidence so it can be picked up without re-discovering the problem. Tackle tiers
top‑down (P0 → P3); within a tier, items are ordered to minimize merge conflicts.

---

## 1. Baseline (verified this run)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **clean** |
| Typecheck | `npm run typecheck` | **clean** |
| Tests | `npm test` | **876 pass / 0 fail** |
| Build | `npm run build` | OK (per CI; `tsc -b && vite build`) |

**Size of the codebase:** 179 `src` files, 76 test files, 5 worker files.

**The repo is healthy.** This plan is about *maintainability, correctness guarantees, and
removing accumulated cruft* — not about fixing a broken build. Every workstream below must keep
the baseline green (`npm run test:ci && npm run build`).

### What is already good (do **not** re-do these)

Recent refactors have already landed and should be preserved as the template for the rest:

- `engine.ts` was split into `src/engine/{checkers,practice/*,storyMode/*}`.
- `backend.ts` was split into `src/backend/{validation,LocalBackend,types,factory}`.
- `App.tsx` was split into `src/app/{LearningApp,startup,dataLoaders}` + extracted screens.
- `numberVariants.ts` (was ~926 lines) was split into `src/engine/storyMode/numberVariants/*`.
- Mastery math is centralized in `src/engine/practice/applyMasteryOutcome.ts` — both
  `LocalBackend.ts:188` and `firebaseBackend.ts:224` delegate to it (no formula duplication).
- Drag steps share `usePointerDrag.ts`; all graded steps share `useCheckableStep.ts` +
  `StepFeedback.tsx`; the dev proxy reuses `src/story/openAiProxyProtocol.ts`.
- Story-unlock gating is a pure, tested function (`src/story/storyUnlock.ts`).

---

## 2. Priorities at a glance

| Tier | Theme | Items | Effort | Risk |
|---|---|---|---|---|
| **P0** | Correctness, safety, and "wrong on its face" | Docs that misstate security; CI typecheck gap; MCQ grading untested in engine; dead assets/exports | Low | Low |
| **P1** | Architecture boundaries & worst monolith | SceneId single source of truth; backend→story layering inversion; worker/protocol parity; decompose `useStorySession`; CSS tokens + `story.css` split | Med | Med |
| **P2** | Duplication & remaining oversized files | AI adapter factory; scene-selection cascade; plot-grid component; DnD helpers; decompose `storyPrompts`/`scenery`/`validation`/`variantGenerators`/`LearningApp`/`checkers`; shared `createPrefixedId`; test fixtures | Med | Med |
| **P3** | Cleanup & polish | AI-slop comment purge; per-lib vendor chunks; archive process-artifact docs; small dedups | Low | Low |

---

## 3. Findings by category (evidence)

### 3.1 Oversized files (split candidates)

| File | Lines | Why it's too big | Natural seams |
|---|---|---|---|
| `src/styles/story.css` | ~1875 | 18 unrelated sections (layout, interests, library, performance, motion) in one file | Split by section markers (`:5,792,1144,1485,1683`) into `story-layout/-interests/-screens/-library/-performance/-motion.css` |
| `src/story/useStorySession.ts` | 1152 | God hook: 25+ `useCallback`s, 40+ field return type (`:129-192`), persistence + AI + prefetch + library CRUD + beats + review | `storyQuestionPipeline`, `storySessionPersistence`, `storyBeatFlow`, `storyReviewControls` (see WS‑D1) |
| `src/story/storyPrompts.ts` | 902 | Prompt rules + ~120 lines of fallback prose + builders + network infra (`withTimeout`/backoff) all mixed | `storyPromptRules`, `storyFallbackBeats`, `storyPromptBuilders`, `storyAiInfra` |
| `src/engine/storyMode/numberVariants/variantGenerators.ts` | 714 | Legacy multi-path engine: input + sequence + operation-choice recognizers in one module | Split at `:207,:282,:457,:535` into per-kind files + `recognizers.ts` |
| `src/backend/validation.ts` | 682 | Generic guards **plus** ~370 lines of Story-session normalization (`:256-633`) | `validation/{core,progress,storySession,database}.ts` (see WS‑C2) |
| `src/story/scenery.ts` | 676 | ~430 lines of catalog data interleaved with scoring/lookup logic | `sceneryCatalog` (data) + `sceneryScoring` + `scenery` (lookups) |
| `src/styles/course-path.css` | 672 | Path graph + nodes + mastery celebration styles | `course-path` + `mastery-celebration.css` |
| `src/content/storyTypes.ts` | 645 | 424 lines (66%) are the hand-typed `SceneId` union (`:33-457`) | Derive `SceneId` from catalog (WS‑B1); leaves a ~190-line types file |
| `src/story/InterestSelectionScreen.tsx` | 584 | Two-step form + 3 near-identical gate screens, 14 `useState` (`:56-70`) | `StoryGateScreen`, `InterestPickerStep`, `CastBuilderStep` |
| `src/app/LearningApp.tsx` | 567 | God component: bootstrap + auth + lesson flow + 12-view router + story prop-drilling | `useLearnerSession`, `AppRouter`, `useLessonFlow`, thin shell (see WS‑D2) |
| `src/story/storySessionReducer.ts` | 485 | Core counters + narrative + review pointer + chapter beats | `storySessionCore`, `storyReviewReducer`, `storyChapterBeats` |
| `src/engine/checkers.ts` | 475 | 8 step checkers + `buildWrongResult` escalation + hint helpers | `checkers/{mcq,balance,plot}.ts` + shared `escalation.ts` |
| `src/firebaseBackend.ts` | 422 | Auth + 6 repositories + legacy migration in one file | Per-repo modules mirroring the `LocalBackend` split |
| `tests/story-safety.test.ts` | 1110 | One file for content/prompt/input safety | Split by concern; move under `tests/story/` |
| `tests/backend.test.ts` | 699 | Broad backend behavior in one file | Split by repository area |

### 3.2 Duplication (extract a shared abstraction)

| # | Duplication | Locations | Extract to |
|---|---|---|---|
| D1 | **Story AI adapters** — Gemini/Firebase repeat identical safety settings + schemas + config maps; the two OpenAI adapters repeat `EmptyCompletionError`, `EMPTY_AWARE_RETRY`, `MAX_TOKENS`, `optsFor` | `geminiDeveloperStoryAi.ts:37-123`, `firebaseStoryAi.ts:31-118`, `openAiStoryAi.ts:42-159`, `openAiDeveloperStoryAi.ts:43-150` | `createGeminiTransport()` + `createOpenAiTransport()` feeding the existing `buildStoryAI()` |
| D2 | **Scene-selection cascade** — rule‑5 `suggestedPool` re-implements the primary→pair→single logic that rules 1–3 already own; `runMatcher` try/catch and uncommon fallback copied | `selectSuggestedPlusCustomScene.ts:37-72`, `selectCustomOnlyScene.ts:41-54`, vs `selectTripleScene.ts:30-49`, `selectPairScene.ts:41-45` | `buildSuggestedPool()` + `safeMatchScene()` in `sceneSelection.ts` |
| D3 | **SVG plot grid** copy-pasted 3× (axes, gridlines, tick labels) | `components/LineGraph.tsx:32-59`, `lesson/steps/PlotStepView.tsx:190-241`, `lesson/steps/SliderStepView.tsx:109-136` | `<PlotGrid>` component (+ `createPlotProjectors(range)` in `plotGeometry.ts`) |
| D4 | **Worker ⟷ proxy protocol** — `worker/worker.js` inlines a copy of validation/mapping/limits that `openAiProxyProtocol.ts` already exports (dev proxy imports it; worker doesn't) | `worker/worker.js:41-130,201-245` vs `src/story/openAiProxyProtocol.ts:53-191` | Bundle worker from the TS module, or add a worker↔protocol parity test (WS‑B3) |
| D5 | **ID minting** (`crypto.randomUUID()` + timestamp fallback) in 3 places | `LocalBackend.ts:25-33`, `validation.ts:482-486`, `storySessionReducer.ts:35-41` | `createPrefixedId(prefix)` in `src/lib/id.ts` |
| D6 | **DnD scaffolding residue** — zone hit-test (`elementFromPoint`+`closest`), drop-bounce `useEffect`, `startDrag` rect/offset boilerplate repeated across drag views | `balanceHelpers.ts:159-163`, `DragTermsStepView.tsx:18-22,72-76`, `ManipulativeStepView.tsx:21-27,62-66` | `getZoneAtPoint(selector,parse)` + `useDropBounce()` |
| D7 | **CSS values** — accent `rgba(37,99,235,…)` hardcoded 45×; success/warning/error colors never tokenized; drop-target ring + `180ms ease` bundles duplicated; easing `cubic-bezier(0.22,1,0.36,1)` 9× | `index.css:1-12` has tokens, but `manipulative.css:117-164` ≈ `drag-terms.css:101-131`, etc. | Add `--color-success/-warning/-error`, `--drop-target-ring`, `--ease-pop`; dedupe zone blocks |
| D8 | **`@keyframes`** scattered across 8 files with cross-file, import-order-dependent reuse (e.g. `balance.css` borrows `tile-drop`/`pan-bounce` from `drag-terms.css`, loaded later) | `App.css:4-18`, `story.css:1688-1689`, `balance.css:290-462`, `drag-terms.css:184-228` | `src/styles/motion.css`, imported before consumers |
| D9 | **`capitalizeFirst`** defined twice | exported `storyLibrary.ts:53` (6 importers) **and** private copy `storyPrompts.ts:88` | `storyPrompts.ts` should import from `storyLibrary` |
| D10 | **`cloneBalanceState`** duplicated | `engine/balance.ts:26-31` (private) and `lesson/balanceHelpers.ts:10-17` (exported) | Single export from `engine/balance.ts` |
| D11 | **`SceneSelection` type** declared twice | `sceneSelection.ts:15` and re-declared in `selectSceneForBeat.ts:32` | Import from `sceneSelection.ts` |
| D12 | **Dual linear-equation parsers** — a regex one-step parser and a multi-term slot parser coexist and are bridged at runtime | `randomizeQuestionNumbers.ts:55-121` vs `numberVariants/linearParser.ts:12-144`, bridged in `themedCoherence.ts:69-71` | Unify under `linearParser` with a one-step fallback internalized |
| D13 | **Equation/accept builders** repeated (`buildOneStep`, `formatEquation`, `buildAccept`, `coordinateAccept`) | `oneStepLinear.ts:21-29`, `inverseOperation.ts:61-73`, `randomizeQuestionNumbers.ts:199-218`, `variantGenerators.ts:71-80,225-226` | Shared `equationBuilder.ts`; reuse `numericAccept` from `architectureTypes.ts:101` |
| D14 | **Test fixtures** — `theme()`/`session()` factories copy-pasted across 10+ story tests; localStorage setup repeated | `story-library.test.ts:24-48` ≡ `story-stats.test.ts:9-41`, etc. | `tests/helpers/storyFixtures.ts`; `setupLocalBackend()` in `tests/helpers/localStorage.ts` |
| D15 | **MCQ escalation ≈ engine escalation** — MCQ re-implements `buildWrongResult({keepHint:true})` inline | `MultipleChoiceStep.tsx:37-63` vs `checkers.ts:32-58` | `checkMcqStep()` in the engine (WS‑A3) |

### 3.3 Dead / unused (safe to delete)

**Assets (zero references — verified):**

| Asset | Evidence |
|---|---|
| `src/assets/react.svg` | 0 refs in `src/` |
| `src/assets/vite.svg` | 0 refs in `src/` |
| `public/icons.svg` | 0 refs anywhere (`index.html` only uses `favicon.svg`) |

> Keep `src/assets/hero.png` and `public/favicon.svg` — both are referenced.
> All 424 `public/scenery/*.webp` are referenced by the catalog — **not** dead.

**Unnecessary `export`s (only used in their defining file — narrow the API, low risk):**

| Symbol | Location |
|---|---|
| `SceneEntry` | `scenery.ts:16` (only used inside `scenery.ts`) |
| `StoryEntryInput`, `StoryEntryState`, `StoryEntryAction` | `storyEntryState.ts:16-24` (`StoryEntryCard` imports `StoryEntryStatus`, not these) |
| `PerformanceCopy` | `performanceCopy.ts:8` |
| `StorySessionSummary` | `storyLibrary.ts:11` |
| `StoryInterestTally`, `StoryLongestAdventure` | `storyStats.ts:12,19` |
| `ModerationResult` | `safety.ts:19` |
| `ProxyRequest`, `ChatCompletionsBody`, `ReasoningEffort`, `ProxyValidationResult` | `openAiProxyProtocol.ts:36,45,60,141` |
| `normalizeLocalUser` | `validation.ts:135` (used only at `validation.ts:641`) |
| `ARCHITECTURE_BY_ID` | `questionBank/catalog.ts:41` (used only in `rebuild.ts`) |

**Stale comment references to removed code:**

- `pickRandomOffInterestScene` is referenced in comments at `scenery.ts:604,614` and
  `selectPairScene.ts:7` but **does not exist** (verified). Remove the comments.

> Note: the `storyMode/` question-bank tree has **no dead exports** — every symbol is reached
> through `catalog.ts` / `rebuild.ts` / tests. Don't delete there.

### 3.4 AI slop (comment cleanup)

Recurring noise that should be trimmed to a single "why" line (or deleted):

- **Plan/Wave/Phase archaeology** referencing planning docs not in the repo:
  `useStorySession.ts:1,13,119,…`, `storyPrompts.ts:1,15,21,…`, `storySessionReducer.ts:1,188`,
  `rehydrateQuestion.ts:1,7` ("WAVE 3b"), all 9 `questionBank/architectures/*.ts:1`
  ("WAVE 2"/"Phase 3"), `storyTypes.ts:615,624`, `engine/practice/{insights,mastery,scheduler,applyOutcome}.ts:1`,
  `content/types.ts:249,282,328` ("PRD R14/R15/R16"), `ProfileScreen.tsx:22-24`.
- **"PURE / deterministic / never throws" banners** restating guarantees the tests already
  enforce: every `select*Scene.ts` header, `sceneSelection.ts:1-5`, `textScanners.ts:3-16`,
  `randomizeQuestionNumbers.ts:1-21`, `themedCoherence.ts:1-37`, `passwordCredential.ts:1-5`,
  `openAiProxyProtocol.ts:1-7`.
- **Narrating-the-obvious blocks**: 20-line module header on `useStorySession.ts:1-19`;
  11-line comment over the 7-line `isAwaitingOutcomeAck` (`storySessionReducer.ts:167-177`);
  per-constant 4–8 line comments above each `*_RULE` in `storyPrompts.ts`; "previously
  inlined…/behavior-equivalent" migration notes in `usePointerDrag.ts:3-17`,
  `useCheckableStep.ts:5-17`, `StepFeedback.tsx:4-6`.

> Guardrail: this is the **lowest-risk** but **easiest-to-overdo** workstream. Do it per-file
> alongside that file's structural refactor, not as one giant comment-deletion PR. Keep comments
> that explain non-obvious *intent* (e.g. why `setPointerCapture` is needed).

### 3.5 Refactor candidates (structure)

- **MCQ grading lives in the view and is untested by the engine** — `MultipleChoiceStep.tsx:36-63`
  grades on click; there is no `checkMcqStep` in `engine/checkers.ts` (verified absent). MCQ is the
  only graded step that bypasses an engine checker.
- **`SceneId` triple-sync (fragile):** the type union (`storyTypes.ts:33-457`, 424 members), the
  runtime catalog (`scenery.ts:26-451`, 424 entries), and `SCENE_PRIMARY_INTERESTS`
  (`sceneCategories.ts:59-225`) are maintained by hand. A union member without a catalog entry does
  **not** fail typecheck, and there is no test asserting `Set(union) === Set(catalog)`. Adding one
  scene is a 4-file edit.
- **Backend → Story layering inversion:** `backend/validation.ts:32-33` imports `../story/scenery`
  and `../story/storySessionReducer`; ~370 lines of story normalization live in the backend layer.
- **`LearningApp.tsx` god component:** 10 `useState` (`:42-65`), bootstrap + auth + `completeStep`
  (`:178-229`, records attempts+mastery+progress) + a 12-string view router + heavy prop drilling
  (e.g. `StoryQuestionScreen` receives ~24 props at `:475-501`).
- **`reconstructSolvedBalanceState`** does a brute-force `2^N` assignment search inside a *view-layer*
  helper (`balanceHelpers.ts:33-84`); belongs in the engine with tests.
- **Duplicated weighted selector:** `selectArchitecture.ts:56-218` re-implements weighting/anti-repeat/
  spaced-repetition referencing a `selectNextQuestion` module that does not exist; extract a generic
  `selectWeightedCandidate<T>()` before a second consumer appears.
- **Sign-up validation gap:** backend `validateSignUpInput` (`validation.ts:655-669`) skips the
  display-name length cap that the UI enforces (`authValidation.ts`), so a direct backend call bypasses it.

### 3.6 Docs / config / CI (stale or wrong — verified)

| Problem | Evidence | Risk if left |
|---|---|---|
| **CI never typechecks tests** — runs `npm test`, not `npm run test:ci` | `.github/workflows/ci.yml:41` | Type errors in ~876 tests merge silently |
| **SECURITY.md says local mode "does not collect, store, or verify passwords"** | `SECURITY.md:54-57` vs `passwordCredential.ts:7-22` (salted-hash creds; `DEFAULT_LEGACY_PASSWORD='123456'`) | **Security doc actively wrong** |
| **SECURITY.md says Firebase "not wired into runtime"** & "npm audit: 0 vulns" | `SECURITY.md:62-65,80` vs `firebaseBackend.ts`; `statereport.md:328` lists 5 moderate dev advisories | Misleading posture |
| **README says lessons 4–6 are "shells"** | `README.md:3,39,135` vs `content/lessons/index.ts:22-28` (all 6 authored; `coordinate-plane.ts` 188, `like-terms.ts` 309, `graphing-lines.ts` 240) | New contributors misled |
| **`.env.example` / `PHASE1_QA_CHECKLIST.md` / `BACKEND_ADAPTERS.md` claim passwordless local** | `.env.example:6-7`, `PHASE1_QA_CHECKLIST.md:19,84`, `BACKEND_ADAPTERS.md:50` (contradicts its own `:18-20`) | Contradictory onboarding |
| **`statereport.md` claims 203 tests / 17 files; references deleted `engine.test.ts`** | `statereport.md:29,169` vs current 876 tests / 76 files | Stale snapshot |
| **`BACKEND_ADAPTERS.md` says AuthScreen is in `src/App.tsx`; mastery is "EWMA"** | `BACKEND_ADAPTERS.md:13,31` vs `src/auth/AuthScreen.tsx` and `applyMasteryOutcome.ts` (cumulative ratio) | Wrong architecture map |
| **`vite.config.ts` lumps all deps into one `vendor` chunk** | `vite.config.ts:33-37` (React+Firebase+KaTeX+OpenAI together) | Large eager bundle |
| **Process-artifact docs kept as if live** | `STORY_MODE_IMPLEMENTATION_PLAN.md` (~978 lines, feature shipped), `statereport.md` (~364) | Confuses repo readers |

---

## 4. Workstreams (the plan)

Each workstream is independently shippable and keeps `npm run test:ci && npm run build` green.

### P0 — Correctness, safety, "wrong on its face"

**WS‑A1 · Fix wrong/contradictory docs.** Update `SECURITY.md` (password handling, Firebase wiring,
audit status), `README.md` (lessons 4–6 are authored, not shells), `.env.example`,
`PHASE1_QA_CHECKLIST.md`, `BACKEND_ADAPTERS.md` (auth location, mastery formula, password
contradiction). *Risk: none (docs).* *Verify: read-through; grep for "shell"/"passwordless".*

**WS‑A2 · Close the CI typecheck gap.** Change `.github/workflows/ci.yml:41` from `npm test` to
`npm run test:ci` (typecheck + test). *Risk: low — may surface latent test type errors (fix them).*
*Verify: `npm run test:ci` locally first.*

**WS‑A3 · Move MCQ grading into the engine.** Add `checkMcqStep(step, choiceId, attemptNumber)` in
`engine/checkers.ts` reusing `buildWrongResult({keepHint:true})`; make `MultipleChoiceStep.tsx`
call `submit(checkMcqStep(...))` like `OperationChoiceStepView.tsx:24-26`; add engine tests
mirroring `tests/engine-checkers.test.ts`. *Risk: low-med (behavior must match current inline
logic).* *Verify: new engine test + existing MCQ tests.*

**WS‑A4 · Delete dead assets + stale comments.** Remove `src/assets/react.svg`,
`src/assets/vite.svg`, `public/icons.svg`; delete `pickRandomOffInterestScene` comment references
(`scenery.ts:604,614`, `selectPairScene.ts:7`). Optionally drop the unnecessary `export`s listed in
§3.3. *Risk: none.* *Verify: `npm run build` + grep.*

### P1 — Architecture boundaries & the worst monolith

**WS‑B1 · `SceneId` single source of truth.** Make `SCENERY_CATALOG` the authority and derive
`export type SceneId = (typeof SCENERY_CATALOG)[number]['id']`; re-export `SceneId` from
`storyTypes.ts` for persistence types. Until/if the type is fully derived, add a test asserting
`Set(SceneId members) === Set(SCENE_IDS)` so the three surfaces can't silently drift. *Risk: med
(touches a core type used widely).* *Verify: typecheck + new equality test + full suite.*

**WS‑B2 · Fix backend→story layering inversion.** Move story-session normalization
(`validation.ts:256-633`) into `src/story/persistence/` (or `content/storyTypes`); keep
`backend/validation.ts` to generic guards + DB shell. Remove the `../story/*` imports from backend.
*Risk: med.* *Verify: `tests/backend.test.ts`, `tests/story-backend.test.ts`.*

**WS‑B3 · Worker/protocol parity.** Either bundle `worker/worker.js` from
`src/story/openAiProxyProtocol.ts` (preferred) or add a parity test that feeds the same inputs to
the worker logic and the TS protocol and asserts equal output. Fix the known drift (`worker.js:87`
always sets `json`). *Risk: med (touches deployed worker).* *Verify: new parity test.*

**WS‑D1 · Decompose `useStorySession.ts` (1152 → thin).** Extract pure/async orchestrators:
`storyQuestionPipeline` (`:388-521`), `storySessionPersistence` (`:349-695`), `storyBeatFlow`
(`:699-1019`), `storyReviewControls`. Collapse the 7× busy-flag guard into a `withStoryBusy()`
wrapper. The checkpoint vs outcome handlers (`:808-985`) share one pipeline — unify it. *Risk:
high (central orchestrator) — do in small steps, each behind the full story test suite.* *Verify:
all `tests/story-*` green after each extraction.*

**WS‑E1 · CSS tokens + `motion.css` + split `story.css`.** Add success/warning/error + ring +
easing tokens to `:root`; create `src/styles/motion.css` for shared `@keyframes` and import it
before consumers in `App.css`; split `story.css` and `course-path.css` along their section markers.
*Risk: low-med (visual regressions) — verify in browser.* *Verify: manual visual smoke; build.*

### P2 — Duplication & remaining oversized files

**WS‑C1 · Story AI adapter factory.** Introduce `createGeminiTransport()` and
`createOpenAiTransport()`; collapse the 4 adapters onto them via the existing `buildStoryAI()`.
(D1.) *Verify: `tests/story-*ai*`/adapter tests.*

**WS‑C2 · Split `backend/validation.ts`** into `validation/{core,progress,storySession,database}.ts`
(pairs with WS‑B2). *Verify: backend tests.*

**WS‑C3 · Extract `<PlotGrid>`** + `createPlotProjectors(range)`; thin `LineGraph`/`PlotStepView`/
`SliderStepView`. (D3.) *Verify: plot/slider step tests + visual.*

**WS‑C4 · Scene-selection dedup** — `buildSuggestedPool()` + `safeMatchScene()` in
`sceneSelection.ts`; consolidate `SceneSelection` type (D11). (D2.) *Verify: `story-select-*` tests.*

**WS‑C5 · Shared `createPrefixedId`** in `src/lib/id.ts`; replace the 3 copies (D5).

**WS‑C6 · DnD helpers** — `getZoneAtPoint()` + `useDropBounce()`; adopt in the 3 drag views (D6).

**WS‑C7 · Decompose the remaining big modules** as their seams come up:
`storyPrompts.ts`, `scenery.ts`, `variantGenerators.ts`, `checkers.ts`, `storySessionReducer.ts`,
`InterestSelectionScreen.tsx`, `firebaseBackend.ts`. Also move `reconstructSolvedBalanceState` into
the engine with tests.

**WS‑D2 · Decompose `LearningApp.tsx`** — `useLearnerSession` hook, an `AppRouter`/route map for the
12 views, `useLessonFlow` (wrap `completeStep`), thin layout shell; reduce story prop-drilling via a
screen-level hook/context. *Risk: med-high.* *Verify: full suite + manual click-through.*

**WS‑C8 · Test fixtures & layout** — `tests/helpers/storyFixtures.ts` for `theme()`/`session()`;
`setupLocalBackend()`; group the 43 `story-*` tests under `tests/story/`; fold the 8 `story-select-*`
files into a table-driven suite; split `story-safety.test.ts` (1110) by concern. (D14.)

### P3 — Cleanup & polish

**WS‑F1 · AI-slop comment purge** — per §3.4, done file-by-file alongside structural work (not as a
single mega-PR).

**WS‑F2 · Per-lib vendor chunks** — replace the catch-all `manualChunks` (`vite.config.ts:33-37`)
with `firebase`/`katex`/`openai`/`vendor` splits. *Verify: `npm run build` chunk sizes.*

**WS‑F3 · Archive process artifacts** — move `STORY_MODE_IMPLEMENTATION_PLAN.md` and `statereport.md`
to a `docs/archive/` (or delete), or regenerate `statereport.md` accurately.

**WS‑F4 · Small dedups** — `capitalizeFirst` (D9), `cloneBalanceState` (D10), unify dual linear
parsers (D12), shared equation builders (D13), generic weighted selector for `selectArchitecture`.

---

## 5. Suggested sequencing

```
P0:  WS-A1 (docs)  WS-A4 (dead)  →  WS-A2 (CI)  →  WS-A3 (MCQ engine)
P1:  WS-B1 (SceneId) ∥ WS-E1 (CSS)  →  WS-B2 (+WS-C2 backend split)  →  WS-B3 (worker)  →  WS-D1 (useStorySession, iterative)
P2:  WS-C1 (AI factory) ∥ WS-C3 (PlotGrid) ∥ WS-C5 (id) ∥ WS-C6 (DnD)  →  WS-C4 (scene dedup)  →  WS-C7 (big modules)  →  WS-D2 (LearningApp)  →  WS-C8 (tests)
P3:  WS-F2 (chunks)  WS-F3 (docs archive)  WS-F4 (small dedups)  +  WS-F1 (comments, rolling)
```

Rationale: ship the zero-risk truth-fixes and the CI guard **first** (so every later PR is
typechecked). Do `SceneId` and CSS tokens early because later modules depend on the stable type and
shared tokens. Save the two god-objects (`useStorySession`, `LearningApp`) for when the supporting
extractions exist, and always behind the full suite.

---

## 6. Guardrails

- **Behavior-preserving only.** No feature/UX changes; this is structural. Each PR keeps
  `npm run test:ci && npm run build` green.
- **Small slices.** One workstream (often one seam) per PR for reviewable diffs and easy revert.
- **Tests move with code.** When a module splits, its tests split/move alongside it.
- **Verify before trusting "dead".** Re-grep all of `/workspace` before deleting any symbol; the
  `storyMode/` tree in particular has *no* dead exports despite appearances.
- **Visual checks for CSS/UI** workstreams (WS‑E1, WS‑C3, WS‑D2) — run the app and click through the
  lesson loop and a story.

---

## 7. Appendix — largest files (this run)

```
src/styles/story.css                                  1875
src/story/useStorySession.ts                          1152
src/story/storyPrompts.ts                              902
src/engine/storyMode/numberVariants/variantGenerators.ts  714
src/backend/validation.ts                              682
src/story/scenery.ts                                   676
src/styles/course-path.css                             672
src/content/storyTypes.ts                              645
src/story/InterestSelectionScreen.tsx                  584
src/app/LearningApp.tsx                                567
src/styles/balance.css                                 517
src/story/storySessionReducer.ts                       485
src/engine/checkers.ts                                 475
src/firebaseBackend.ts                                 422
tests/story-safety.test.ts                            1110
tests/backend.test.ts                                  699
tests/story-number-variation.test.ts                   572
```
