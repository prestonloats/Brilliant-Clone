# Refactor Plan — Balance (Brilliant Clone)

_Generated: 2026-06-27 · Branch: `cursor/code-refactoring-plan-dcec` · Scope: whole repository_

This is a **planning document**, not a code change. It inventories poorly written code, AI
"slop", dead code, oversized files, and refactoring opportunities found in a full-repository
review, then lays out a prioritized, behavior-preserving plan to address them.

Every finding below is anchored to concrete `path:line` evidence so each item can be picked up
independently. Nothing here changes runtime behavior; the goal is a codebase that is smaller,
flatter, less duplicated, and easier to extend (especially Story Mode).

---

## 0. Baseline health (verified this run)

The tree is **green** before any refactor — this is our regression contract:

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | clean |
| Typecheck | `npm run typecheck` (`tsc -p tsconfig.test.json --noEmit`) | clean |
| Tests | `npm test` | **750 pass / 0 fail** |
| Build | `npm run build` | succeeds |

Repository size: **161 source files**, **65 test files** (~40k LOC across `src` + `tests`).
The dominant, fastest-growing subsystem is **Story Mode** (`src/story/**`,
`src/engine/storyMode/**`, `src/styles/story.css`), which is where most of the technical debt now
lives.

**Guardrail for every task in this plan:** `npm run lint && npm run typecheck && npm test &&
npm run build` must stay green, with the test count at **≥ 750** (splits/moves should not delete
coverage). Pure refactors should not change test _assertions_, only their location.

---

## 1. Executive summary

The architecture is fundamentally sound — clean barrels (`domain.ts`, `engine.ts`,
`backend.ts`), a pure/`*Core` split for env-dependent modules, a well-tested pure engine, and a
deterministic question bank. The debt is concentrated in a few recurring shapes:

1. **Oversized files.** ~15 files exceed 450 lines; the worst are `story.css` (1471),
   `tests/engine.test.ts` (1492), `tests/story-safety.test.ts` (1238), `useStorySession.ts`
   (1138), `numberVariants.ts` (926), `backend.test.ts` (812), `storyPrompts.ts` (721),
   `scenery.ts` (684), `course-path.css` (672), `storyTypes.ts` (609), `InterestSelectionScreen.tsx`
   (608), `validation.ts` (601), `LearningApp.tsx` (552).
2. **Copy-paste duplication.** Scene-selection rules, Story AI provider adapters, lesson
   drag/drop pointer logic, SVG plot grids, mastery-update math, ID generators, and CSS
   color/animation recipes are each duplicated 3–7 times.
3. **A few "single source of truth" violations.** `SceneId` is hand-synced across 3 files; MCQ
   grading lives in a React component instead of the engine; recommendation/completion copy is
   split from content; backend validation depends "upward" on story UI modules.
4. **Dead code & stale docs.** Dead exports (`pickRandomOffInterestScene`, `CANNED_BRIDGE_SEGMENT`,
   `StoryAI.pickScene`/`buildScenePrompt`, a duplicate reducer review API), dead assets
   (`react.svg`, `vite.svg`, `public/icons.svg`), a stale generated `statereport.md`, and several
   docs that describe a "passwordless local mode" / "lessons 4-6 are shells" that no longer match
   the code.
5. **AI slop.** Heavy narrating comment blocks (entire 21-line headers explaining 50 lines of
   code), plan-section references (`plan 5.4`, `WAVE 2`), and repeated `PURE + deterministic +
   never throws` banners that add noise without explaining intent.
6. **CI / config gaps.** CI runs `npm test` (no typecheck); `manualChunks` bundles the Firebase
   SDK + OpenAI SDK + KaTeX + React into one **1,516 kB (407 kB gzip)** eager `vendor` chunk,
   defeating the lazy Firebase import.

The plan is organized into **priority tiers P0–P3** and **workstreams**. P0/P1 items are
high-impact and low-risk; P2/P3 are larger structural splits best taken incrementally.

---

## 2. How to read this plan

Each item has: **Problem**, **Evidence** (`path:line`), **Proposed change**, **Risk**, and
**Verification**. Effort/impact/risk are rated `Low / Med / High`.

Ordering principle: do **hygiene + single-source-of-truth + dedup** first (they shrink the
surface area), then **file splits** (mechanical once dedup lands), then **structural** changes.

---

## 3. Priority tiers at a glance

| Tier | Theme | Items |
| --- | --- | --- |
| **P0** | Correctness, build, CI, dangerous doc drift | 1.x build/CI, MCQ engine checker, doc-vs-code contradictions |
| **P1** | High-value dedup + single source of truth | scene-selection shared util, Story AI factory, `SceneId` from catalog, mastery/ID dedup, lesson drag hooks, CSS tokens |
| **P2** | Oversized file splits | `useStorySession`, `numberVariants`, `storyPrompts`, `scenery`, `validation`, `LearningApp`, `story.css`, big test files |
| **P3** | Polish | comment-slop cleanup, a11y, dead-CSS, test fixtures, barrel boundaries |

---

## P0 — Correctness, build, CI, and dangerous doc drift

### P0.1 — Fix `manualChunks`: stop shipping the Firebase/OpenAI SDK eagerly
- **Impact: High · Effort: Low · Risk: Low**
- **Problem:** The build emits a single `vendor` chunk of **1,516 kB (407 kB gzip)** because
  every `node_modules` import is forced into `vendor`. The default backend never initializes
  Firebase, and Story Mode AI is optional, yet React + the Firebase SDK + the OpenAI SDK + KaTeX
  all land in one eager chunk. This defeats the deliberate lazy `import('../firebaseServices')`
  in `src/app/startup.ts`.
- **Evidence:** `vite.config.ts:35-39` (`manualChunks(id) { if (id.includes('node_modules')) return 'vendor' }`); build output `dist/assets/vendor-*.js 1,516.43 kB`; lazy import at `src/app/startup.ts` (dynamic `import` of firebase services).
- **Proposed change:** Split heavy libraries into their own chunks so they cache independently and
  only download when reached:
  ```js
  manualChunks(id) {
    if (id.includes('node_modules')) {
      if (id.includes('firebase') || id.includes('@firebase')) return 'firebase'
      if (id.includes('katex')) return 'katex'
      if (id.includes('openai') || id.includes('@google/genai')) return 'ai'
      return 'vendor'
    }
  }
  ```
  (Or remove `manualChunks` entirely and let Rollup split along dynamic-import boundaries.)
  Confirm the Firebase chunk is no longer pulled by the default local path.
- **Verification:** `npm run build`; compare per-chunk sizes; confirm `firebase` chunk is separate
  and not eagerly imported from `main`/`index`.

### P0.2 — CI must typecheck the test suite
- **Impact: Med · Effort: Low · Risk: Low**
- **Problem:** CI runs `npm test`, which transpiles tests with esbuild (types stripped, **never
  typechecked**). A `test:ci` script exists (`typecheck` + `test`) but is unused. Type regressions
  in tests/`src` can land green.
- **Evidence:** `.github/workflows/ci.yml:41` (`run: npm test`); `package.json:10-12` (`test`,
  `typecheck`, `test:ci`).
- **Proposed change:** Change the CI "Test" step to `npm run test:ci`. Optionally add a Node
  globals override for `tests/**` in `eslint.config.js` (tests currently get `globals.browser`).
- **Verification:** CI run shows a typecheck step before tests; `npm run test:ci` passes locally.

### P0.3 — Add a real MCQ checker in the engine (single source of truth for grading)
- **Impact: High · Effort: Med · Risk: Low**
- **Problem:** Every graded step type has a pure checker in `src/engine/checkers.ts` **except
  MCQ**. MCQ grading + the attempt-escalation ladder (per-option misconception → generic
  explanation at attempt 2 → reveal at attempt 3 → retry guidance) is hand-written inside the
  React component, and the comment there explicitly says it "mirrors the engine's choice-step
  escalation" — i.e. it is a known drift risk. A test even defines its own `gradeMcq` mirror.
- **Evidence:** `src/lesson/steps/MultipleChoiceStep.tsx:37-63` (inline grading) vs
  `src/engine/checkers.ts` `checkOperationChoiceStep` / `buildWrongResult`;
  `tests/story-applyRetheme.test.ts` (local `gradeMcq` mirror).
- **Proposed change:** Add `checkMcqStep(step, choiceId, attemptNumber): StepResult` to
  `checkers.ts` reusing `buildWrongResult` (same shape as `checkOperationChoiceStep`). Route
  `MultipleChoiceStep` through it (like `OperationChoiceStepView`). Delete the inline ladder. Add
  engine unit tests for the MCQ ladder; point the story test at the engine checker.
- **Risk note:** Behavior must stay identical (same strings at each attempt). Snapshot the current
  outputs first, then assert them against the new checker.
- **Verification:** New engine tests assert the 3-attempt ladder; existing story tests still pass;
  manual MCQ step retry still shows the same escalating feedback.

### P0.4 — Make `McqStep.feedback` required (matches runtime + tests)
- **Impact: Low · Effort: Low · Risk: Low**
- **Problem:** `feedback?` is optional on `McqStep` but required on operation-choice; all authored
  content provides it and tests assume it exists, forcing `step.feedback?.` noise.
- **Evidence:** `src/content/types.ts:54` (`feedback?: Feedback`) vs `:92` (required on
  operation-choice); usage `MultipleChoiceStep.tsx:43-45`.
- **Proposed change:** Make `feedback: Feedback` required on `McqStep`; drop optional chaining.
  Pairs naturally with P0.3.
- **Verification:** `npm run typecheck`; content already satisfies it.

### P0.5 — Fix doc-vs-code contradictions (auth + lesson "shells")
- **Impact: Med (trust/onboarding) · Effort: Low · Risk: None (docs only)**
- **Problem:** Several docs describe behavior the code no longer has. This actively misleads
  contributors and QA.
  - **"Passwordless local mode"** is stated in `SECURITY.md`, `PHASE1_QA_CHECKLIST.md`,
    `.env.example`, `BACKEND_ADAPTERS.md`, and `src/authValidation.ts` comments — but local mode
    requires a salted password (`AuthScreen.tsx` `requiresPassword = true`,
    `LocalBackend.ts` password checks).
  - **"Lessons 4-6 are shells"** in `README.md` (lines ~3, 38-39, 135) — but all six lessons are
    fully authored (`src/content/lessons/*.ts`).
  - **`BACKEND_ADAPTERS.md`** says mastery is "EWMA" but `LocalBackend` uses a simple
    `correct/total` ratio.
  - **`.env.example`** implies a bare `OPENAI_API_KEY` is exposed to the client, but
    `vite.config.ts` `envPrefix: ['VITE_']` means only `VITE_*` is exposed (Story Mode in the
    browser needs the proxy, not a bare key).
- **Evidence:** `SECURITY.md:54-65`, `PHASE1_QA_CHECKLIST.md:19-40`, `.env.example:6-7,25-33`,
  `BACKEND_ADAPTERS.md:31,50`, `README.md:3,38-39,135`, `src/authValidation.ts:26-28`.
- **Proposed change:** Update each doc to match current behavior (passworded local demo; six
  authored lessons; ratio-based mastery; `VITE_`-only client exposure + proxy for Story AI). This
  is a documentation-only pass; keep it in its own commit.
- **Verification:** Re-read each doc against the code paths cited; no code changes.

### P0.6 — Remove the stale generated `statereport.md` and gitignore it
- **Impact: Low · Effort: Low · Risk: None**
- **Problem:** `statereport.md` is an auto-generated snapshot (header: "Last generated 2026-06-26",
  basis tip `14fa754`, "203 tests") committed to the repo. It is already wrong (now 750 tests) and
  will keep drifting; treating it as source-of-truth is harmful.
- **Evidence:** `statereport.md:1-29`; `.gitignore` does not list it.
- **Proposed change:** `git rm statereport.md` and add it to `.gitignore` (or move to
  `docs/archive/`). If a live report is wanted, generate it on demand rather than committing.
- **Verification:** File removed from tree; `.gitignore` updated.

---

## P1 — High-value dedup + single source of truth

### P1.1 — Extract a shared scene-selection toolkit
- **Impact: High · Effort: Med · Risk: Low**
- **Problem:** The "rule" files re-declare the same primitives and copy the same random-pick /
  anti-repeat / matcher-wrapping logic. Two of them re-implement other rules instead of calling
  them.
- **Evidence (duplicated symbols):**
  - `SceneSelection` type: `selectPairScene.ts:30`, `selectTripleScene.ts:25`,
    `selectUncommonScene.ts:19`, `selectCustomOnlyScene.ts:29`,
    `selectSuggestedPlusCustomScene.ts:26`, `selectSceneForBeat.ts:32`.
  - `dedupe`: `selectPairScene.ts:36`, `selectTripleScene.ts:28`,
    `selectSuggestedPlusCustomScene.ts:41`.
  - `pickFromPool`/`pickFrom`: `selectPairScene.ts:57-63`, `selectTripleScene.ts:32-37`,
    `selectSuggestedPlusCustomScene.ts:59-65`, `selectCustomOnlyScene.ts:42-48`,
    `selectSingleScene.ts:35-42`, `selectUncommonScene.ts:31-38`.
  - `runMatcher`: `selectSuggestedPlusCustomScene.ts:45-54`, `selectCustomOnlyScene.ts:56-62`.
  - `selectSuggestedPlusCustomScene` re-implements rules 1-3 (`:72-91`);
    `selectCustomOnlyScene` re-implements the uncommon pick (`:42-48`).
- **Proposed change:** Add `src/story/sceneSelection/shared.ts` exporting `SceneSelection`, `Rng`,
  `dedupe`, `pickFromPool`, `runMatcher`, and a `suggestedInterestPool(ids)` cascade. Reduce each
  rule file to composition; make `selectSuggestedPlusCustomScene` delegate to
  `selectSingle/Pair/TripleScene` and `selectCustomOnlyScene` delegate to `selectUncommonScene`.
- **Risk note:** The seeded-RNG determinism is a tested contract — preserve pool ordering and the
  `Math.min(len-1, floor(rng()*len))` clamp exactly.
- **Verification:** All `story-select-*` tests pass unchanged (determinism intact).

### P1.2 — Collapse the four Story AI adapters behind a shared factory
- **Impact: High · Effort: Med · Risk: Med**
- **Problem:** Four adapters re-implement the same seven `StoryAI` methods (validation,
  moderation, JSON parse, retry/backoff); only the transport differs (~800 lines of near-duplicate
  logic). The OpenAI-developer adapter even re-declares `STORY_RETRY` and `isStringRecord` that are
  already exported from `storyPrompts.ts`. Gemini and Firebase adapters share safety settings +
  JSON schemas + primary/fallback model loops.
- **Evidence:** `openAiStoryAi.ts:139-216`, `openAiDeveloperStoryAi.ts:52,65-66,137-221`,
  `geminiDeveloperStoryAi.ts:48-114,129-217`, `firebaseStoryAi.ts:48-116,129-194`.
- **Proposed change:** Introduce `createStoryAiHandlers(deps: { generate, generateProse,
  moderateUserChoice? })` returning the shared method object; each adapter supplies transport only
  (~50 lines). Extract `geminiStoryConfig.ts` (safety + schemas) shared by Gemini + Firebase.
  Import shared `STORY_RETRY`/`isStringRecord` instead of re-declaring.
- **Risk note:** These call external APIs and aren't unit-tested end-to-end; keep method
  signatures and parse/validation order identical. Land behind the existing provider selection so a
  bug only affects an opt-in provider.
- **Verification:** `story-provider-selection`, `story-fallbacks`, prompt-rule tests pass; manual
  smoke against at least the proxy path.

### P1.3 — Remove the dead `StoryAI.pickScene` / `buildScenePrompt` surface
- **Impact: Med · Effort: Low · Risk: Low**
- **Problem:** `pickScene` is part of the `StoryAI` interface and implemented in all four adapters,
  and `buildScenePrompt` exists to support it — but **nothing calls it**. Scene images come from
  the deterministic `selectSceneForBeat` + `matchSceneToInterests` path.
- **Evidence:** `storyAi.ts:55-65` (interface), `storyPrompts.ts:476-535` (`buildScenePrompt`),
  per-adapter `pickScene` impls; no callers in `useStorySession.ts` or UI.
- **Proposed change:** Delete `pickScene` from the interface + all adapters and remove
  `buildScenePrompt` (and its tests if purely for the dead path). Combine with P1.2.
- **Verification:** Typecheck + tests; grep confirms zero `pickScene` callers.

### P1.4 — Derive `SceneId` from the catalog (kill the triple-sync)
- **Impact: High · Effort: Med · Risk: Med**
- **Problem:** Adding/renaming a scene requires editing three places that must stay in lockstep:
  the ~425-line `SceneId` union, the catalog data, and the category tables. This is the single
  biggest maintenance hazard in Story Mode and a classic drift source.
- **Evidence:** `src/content/storyTypes.ts:33-457` (`SceneId` union), `src/story/scenery.ts:26-451`
  (`SCENERY_CATALOG`), `src/story/sceneCategories.ts:59-225` (category tables).
- **Proposed change:** Make `SCENERY_CATALOG` an `as const` and derive
  `type SceneId = typeof SCENERY_CATALOG[number]['id']`. Generate (or co-locate) the category /
  primary-interest tables from catalog metadata via a small script, so a new scene is a one-line
  catalog edit. The `public/scenery/*.webp` ↔ catalog test already guards file coverage.
- **Risk note:** Requires reordering modules so the catalog has no circular import with
  `storyTypes`. Validate the derived union equals the current one before/after (snapshot the list).
- **Verification:** `story-scene-categories`, `story-scene-coverage`, `story-scenery` tests pass;
  typecheck confirms `SceneId` unchanged.

### P1.5 — Extract shared lesson drag/drop primitives
- **Impact: High · Effort: Med · Risk: Med**
- **Problem:** Pointer-drag lifecycle, drop-zone hit-testing, and the drop-bounce animation are
  copy-pasted across the interactive step views, and one copy has a stale-closure bug.
- **Evidence:**
  - Drop-zone hit test (3×): `balanceHelpers.ts:159-163`, `DragTermsStepView.tsx:17-21`,
    `ManipulativeStepView.tsx:20-26`.
  - Pointer-drag lifecycle (4×): `BalanceStepView.tsx:133-181`, `DragTermsStepView.tsx:123-180`,
    `ManipulativeStepView.tsx:103-140`, partial `PlotStepView.tsx:101-133`.
  - Drop-bounce timeout/RAF (3×): `BalanceStepView.tsx:88-123`, `DragTermsStepView.tsx:74-101`,
    `ManipulativeStepView.tsx:63-79`.
  - **Bug:** `DragTermsStepView.tsx:137-144` reads `dragging.moved` from a stale effect closure —
    a same-frame `pointerup` can misclassify a drag as a tap.
- **Proposed change:** Add `src/lesson/steps/usePointerDrag.ts` (`{ onStart, onMove, onDrop,
  onTap?, dragThreshold? }` → `{ dragging, startDrag, previewProps }`), `getZoneAtPoint<T>(x, y,
  selector, parse)` in `src/lesson/dropZoneHelpers.ts`, and `useDropBounce(resetMs)`. Migrate the
  three step views; fix the tap/drag classification with a synchronous ref. Standardize pointer
  capture in the hook.
- **Risk note:** Pointer interactions are not DOM-tested (UI is verified by tsc + manual QA);
  validate by hand on touch + mouse.
- **Verification:** Manual drag QA for balance / drag-terms / manipulative on pointer + touch;
  typecheck.

### P1.6 — `PlotGrid` component + shared projectors
- **Impact: Med · Effort: Med · Risk: Low**
- **Problem:** The coordinate-grid SVG (span, ticks, `toSvgX/Y`, gridlines, axes, labels) is
  duplicated ~35 lines × 4 places; any grid tweak is a four-file edit. `LineGraph` also borrows
  slider CSS classes for static content.
- **Evidence:** `src/components/LineGraph.tsx:19-67`, `PlotStepView.tsx:60-64,190-241`,
  `SliderStepView.tsx:51-54,109-136`, math seed in `plotGeometry.ts:3-7`.
- **Proposed change:** Add `makePlotProjectors(range)` to `plotGeometry.ts` and a
  `src/components/PlotGrid.tsx` (`range`, optional overlays via children). Compose it in
  `LineGraph`, `PlotStepView`, `SliderStepView`. Give the static graph neutral `.plot-*` classes.
- **Verification:** `lesson-graphing-lines` / `lesson-coordinate-plane` tests pass; visual check of
  the three graph surfaces.

### P1.7 — Deduplicate mastery math + ID generation across backends
- **Impact: Med · Effort: Low · Risk: Low**
- **Problem:** The rolling mastery formula is implemented twice; the story-session ID generator and
  the generic `createId` are each duplicated; password-length error strings differ in three places.
- **Evidence:** mastery: `LocalBackend.ts:166-194` vs `firebaseBackend.ts:216-249`; IDs:
  `validation.ts:441-445` vs `storySessionReducer.ts:25-33`, and `createId` lives on
  `LocalBackend.ts:21-29` but is used by `factory.ts`; password errors:
  `authValidation.ts:71-72`, `firebaseBackend.ts:66-67`, `LocalBackend.ts:71`.
- **Proposed change:** `applyMasteryAttempt(existing, correct): SkillMastery` (pure, in
  `src/engine/mastery.ts` or `src/backend/masteryLogic.ts`) used by both backends; `src/backend/id.ts`
  exporting `createId` + `createStorySessionId`; single `passwordValidationError(pw)` in
  `authValidation.ts` reused by UI + both backends.
- **Verification:** `backend.test.ts`, `story-backend.test.ts` pass; mastery numbers unchanged.

### P1.8 — Introduce CSS design tokens + a shared `motion.css`
- **Impact: Med · Effort: Low–Med · Risk: Low**
- **Problem:** Colors and animations are duplicated and order-dependent.
  - `rgba(37, 99, 235, …)` (accent blue) appears **40+ times** (11× in `balance.css` alone);
    success `#dcfce7/#14532d` and warning `#ffedd5/#9a3412` pairs repeat across files.
  - Shared `@keyframes` are defined in files that don't own all consumers, so correctness depends
    on `@import` order: `pan-bounce`/`tile-drop`/`lift-tile`/`scale-settle` live in `drag-terms.css`
    but are used by `balance.css` + `manipulative.css`; `chip-pop`/`zone-correct` live in
    `manipulative.css` but used by `drag-terms.css`.
  - Drop-zone "active" surface + amber tray gradient recipes are copy-pasted across
    `balance.css`/`manipulative.css`/`drag-terms.css`.
- **Evidence:** `feedback.css:12-14`, `balance.css:95-96,355-361`, `story.css:1433-1435`,
  `course-path.css:77,153-154`, `drag-terms.css:184-227`, `manipulative.css:85-164,131-135`,
  `App.css:10-14` (import order).
- **Proposed change:** Add tokens to `:root` in `index.css` (`--accent-a10`, `--success-bg/-text`,
  `--warn-bg/-text`, `--tray-*`) and replace literals. Create `src/styles/motion.css` holding all
  shared `@keyframes`, imported first in `App.css`. Add `.drop-zone-active` / `.tray-surface`
  utility classes.
- **Verification:** `npm run build`; visual diff of feedback/drag/balance states.

---

## P2 — Oversized file splits

These are mostly mechanical **once the relevant dedup (P1) lands**. Split along the seams below;
keep public exports stable via thin barrels so imports don't churn.

### P2.1 — `src/story/useStorySession.ts` (1138 lines)
- **Seams:** pure helpers (`newestRecapChapter`, `resolveBeatText`, `buildRethemeRequest`,
  `themedStepText`, `matcherFor`, `sceneForBeat`) at `:174-309` → `storyBeatHelpers.ts`; question
  pipeline (`selectAndRetheme`, prefetch, `takeNextQuestion`, `maybeCompact`) `:439-583` →
  `useStoryQuestions.ts`; library actions (`openStory`, `switchToStory`, `deleteStory`,
  `refreshLibrary`) → `useStoryLibraryActions.ts`; recap/review nav `:377-1067` →
  `useStoryReviewState.ts`; leave `useStorySession.ts` as a thin composer.
- **Also:** `isProviderConfigured` (`:225-234`) duplicates `selectStoryProvider.ts:32-37` /
  `createStoryAI.ts:59-77` and treats Firebase as configured even when services are null — unify on
  one `isStoryProviderConfigured(env)` (fix the false positive while splitting).

### P2.2 — `src/engine/storyMode/numberVariants.ts` (926 lines)
- **Seams:** `linearEquationParse.ts` (parse + `linearSolutionsInText`), `numberTokenSubstitute.ts`
  (`NUMBER_TOKEN`, `substituteNumbers`, magnitude map), then one file each for
  `randomizeMultiStepInput`, `randomizeCoordinateWalk`, `randomizeSequenceVariant`,
  `randomizeOperationChoiceVariant`; thin `numberVariants.ts` re-export barrel. Reconcile the
  parallel token/parse logic shared with `randomizeQuestionNumbers.ts`.

### P2.3 — `src/story/storyPrompts.ts` (721 lines)
- **Seams:** `storyPromptRules.ts` (the `*_RULE` constants + `SYSTEM_PREAMBLE`),
  `storyPromptBuilders.ts` (the `build*Prompt` functions), `storyAiInfrastructure.ts`
  (`withTimeout`, `callWithBackoff`, `isQuotaError`, `isTransientError`, `STORY_RETRY`). Drop the
  dead `CANNED_BRIDGE_SEGMENT` (`:35-36,95-96`, superseded by `storyFallbackBeat`) and the dead
  `buildScenePrompt` (P1.3). Demote exported rule strings that exist only for tests to
  module-private where tests don't assert them. Move `capitalizeFirst` to one home (also in
  `storyLibrary.ts:53-54`).

### P2.4 — `src/story/scenery.ts` (684 lines)
- **Seams:** `scenery/catalog.ts` (static data), `scenery/lookup.ts` (`BY_ID`, `coerceSceneId`,
  `scenerySrc`, labels), `scenery/interestMatching.ts` (`scenesForInterests`,
  `defaultSceneForInterests`, keyword maps). Delete dead `pickRandomOffInterestScene` (`:680-684`).
  Precompute a `Map<interestSetKey, SceneId[]>` to replace the per-call full-catalog scans in
  `sceneCategories.ts:247-252`. Decide one categorization source of truth (exact-set
  `sceneCategories` vs keyword fingerprinting) and demote the other to a documented fallback.

### P2.5 — `src/content/storyTypes.ts` (609 lines)
- **Seams:** move/derive `SceneId` (P1.4) into a generated `sceneryIds.ts`; keep `storyTypes.ts`
  for session/theme/question runtime shapes only.

### P2.6 — `src/story/InterestSelectionScreen.tsx` (608 lines)
- **Seams:** `StoryGateScreens.tsx` (locked + needs-provider, `:187-231`), `InterestPickerStep.tsx`
  (`:240-387`), `CastBuilderStep.tsx` (`:389-603`); parent keeps `step` + `handleBegin`. Extract a
  generic `ChipAddField` for the duplicated "add chip" UX (interests `:93-119` vs characters
  `:133-151`) and a shared `validateStoryName` wrapping `safety.ts` moderation instead of the
  re-implemented inline checks (`:100-103,124-131`).

### P2.7 — `src/story/storySessionReducer.ts` (469 lines)
- **Seams:** `storySessionCore.ts` + `storySessionReview.ts`. Remove the **duplicate review API**:
  `reviewBack`/`reviewForward`/`reviewBackChapter`/`reviewForwardChapter` (`:212-239`) are
  test-only; production uses the `StoryReviewPos` model (`:373-449`). Migrate
  `tests/story-history.test.ts` to the `StoryReviewPos` API, then delete the mutating helpers and
  the app-unused `setNarrativeSummary` (`:460-462`).

### P2.8 — `src/backend/validation.ts` (601 lines)
- **Seams:** `validation/primitives.ts`, `validation/lessonProgress.ts`,
  `validation/storySession.ts` (theme/segments/sessions/library migration),
  `validation/database.ts` (`normalizeDatabase`, `emptyDatabase`), `validation/authInputs.ts`.
  **Fix layering:** this core persistence module imports `../story/characterPresets` and
  `../story/scenery` (`:23-29`) — move the shared validators (`isKnownPersonalityId`, `isSceneId`,
  caps) to `src/content/` so backend no longer depends "up" on story UI. Make `validateSignUpInput`
  call `validateDisplayName` (it currently skips the 40-char cap the UI enforces).

### P2.9 — `src/app/LearningApp.tsx` (552 lines)
- **Seams:** `useLearningSession(backend)` (auth/session bootstrap `:102-261`),
  `lessonSessionActions.ts` (lesson CRUD `:167-321`), `LearningAppRouter.tsx` + an `AppView` union
  (`:42-55,323-549`), `AppTopBar.tsx` (`:351-386`). Memoize/relocate
  `getRecommendedNextLesson` (computed every render at `:65`, only used by `CompleteScreen`).
  Consider `backend.progress.getAllLessonProgress(userId)` to replace the N sequential reads in
  `dataLoaders.ts:35-48`.

### P2.10 — `src/firebaseBackend.ts` (401) and `src/engine/checkers.ts` (475)
- **`firebaseBackend.ts`:** split into per-concern repositories (auth/progress/mastery/attempts/
  story) composed by the class; add `normalizeStoryPointer` for the unsafe cast at `:328-329`.
- **`checkers.ts`:** split into `checkers/shared.ts` (`buildWrongResult`, hint helpers, numeric
  parse), `checkers/choice.ts` (MCQ + operation-choice after P0.3), `checkers/numeric.ts`,
  `checkers/interactive.ts`; re-export from `checkers.ts`. Take this when the area is next touched.

### P2.11 — `src/styles/story.css` (1471 lines) + `course-path.css` (672)
- **`story.css` seams** (existing section comments at `:5,88,130,239,279,397,512,754,792,872,
  1034,1132,1302`): `story-entry.css`, `story-interests.css`, `story-screens.css` (question/
  checkpoint/outcome), `story-library.css`, `story-review.css`, imported from `App.css`. Move the
  story-profile block out of `base.css:96-199` into the story bundle; drop the redundant nested
  reduced-motion override at `story.css:1467-1471` (covered globally in `responsive.css`).
- **`course-path.css`:** remove dead `.path-node h2` (`:157-164`; nodes render `<h3>`) and
  consolidate the overlapping `.path-node` vs `.graph-node` rule sets onto one class.

### P2.12 — Large test files (1.x test debt)
- **`tests/engine.test.ts` (1492):** split into `engine-checkers`, `engine-progress`, `engine-path`,
  `engine-catalog-invariants`; **move the lesson-content smoke block (`:1056-1414`) out** — it
  overlaps the per-lesson `lesson-*.test.ts` files. Establish the boundary: `engine*` tests own
  pure engine + synthetic fixtures + path/progress; `lesson-*` own authored content/structure.
- **`tests/story-safety.test.ts` (1238):** split into `story-safety-input`, `story-prompts-rules`,
  `story-prompts-builders`.
- **`tests/backend.test.ts` (812):** split into `backend-auth`, `backend-firebase-core`,
  `backend-persistence`, `backend-corruption`.
- **Consolidate** the 8 near-identical `story-select-*` test files behind a shared
  `tests/helpers/storyInterests.ts` + table-driven suite; merge the 3 catalog-count assertions
  into one `story-catalog-invariants.test.ts`.

---

## P3 — Polish

### P3.1 — Trim AI-slop comments
- **Impact: Med (readability) · Effort: Med · Risk: None**
- **Problem:** Many files open with 12–21 line headers that narrate _what_ the code does, restate
  obvious lines, reference plan sections (`plan 5.4`, `WAVE 2`), and repeat
  `PURE + deterministic + never throws` banners. They bury the few genuinely useful invariants.
- **Evidence (representative):** `selectPairScene.ts:1-21,27-56` (21-line header + per-function
  narration for ~50 lines of code), scene-selection files generally, `storyPrompts.ts` rule
  blocks, `useStorySession.ts:1-16`, `numberVariants.ts:1-21,379-393`, `validation.ts:215-227`,
  `useCheckableStep.ts:5-17`, `StepFeedback.tsx:4-6` (claims all views migrated — false; Balance/
  DragTerms still inline), `devSkip.ts:1-7`.
- **Proposed change:** Keep comments that explain **why / non-obvious invariants** (prefetch
  across checkpoints, live-edge guard, hint-escalation rules, the DragPreview portal transform
  bug, dev-skip grading rules). Delete restating narration. Target a meaningful reduction in the
  story + step layers. Move historical bug archaeology to git history / test names.
- **Verification:** Diff review only; no behavior change.

### P3.2 — Remove dead code & dead assets
- **Impact: Low · Effort: Low · Risk: Low**
- **Dead code:** `pickRandomOffInterestScene` (`scenery.ts:680-684`), `CANNED_BRIDGE_SEGMENT`
  (`storyPrompts.ts`), reducer review API (`storySessionReducer.ts:212-239`) + `setNarrativeSummary`,
  `StoryAI.pickScene`/`buildScenePrompt` (P1.3), `requiresPassword === false` path
  (`AuthScreen.tsx`/`authValidation.ts` — always true), `predict-scale-card level` dead class
  (`MultipleChoiceStep.tsx:107`), `makeLessonProgress` alias export (`tests/helpers/fixtures.ts:3`),
  `selectNextQuestion.ts` (superseded in app by `selectArchitecture`; keep only if tests need it —
  if so move to a fixtures/legacy path and dedup its weighted-pick constants with
  `selectArchitecture.ts`).
- **Dead assets:** `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg` (no
  references).
- **Verification:** grep for each symbol/asset; typecheck + tests stay green after removal.

### P3.3 — Accessibility fixes (lesson graphs / drag chips)
- **Impact: Med (a11y) · Effort: Low–Med · Risk: Low**
- **Problem/Evidence:** slider graph hidden from AT (`SliderStepView.tsx:104-108`
  `aria-hidden="true"`); `role="application"` on the plot grid (`PlotStepView.tsx:182-184`);
  manipulative tray chips not keyboard-focusable (`ManipulativeStepView.tsx:162-166`); physical
  balance mode has no non-pointer placement (`BalanceStepView.tsx:328-337`).
- **Proposed change:** Add `role="img"` + descriptive `aria-label` to the slider graph; use
  `role="group"`/`<figure>` for the plot; make tray chips `<button>`s (or document the +/- keyboard
  path); keep an sr-only "place on left/right" action in physical balance mode.
- **Verification:** Manual screen-reader pass on the four step types.

### P3.4 — Barrel & layering boundaries
- **Impact: Low–Med · Effort: Med · Risk: Low**
- **Problem/Evidence:** `engine.ts` re-exports story-mode symbols alongside core lesson APIs (no
  way to tell them apart); the pure engine imports from the fat `domain` barrel
  (`checkers.ts:8`, `progress.ts:7`, `graph.ts:8`); `domain.ts` mixes content + story + persistence
  types.
- **Proposed change:** Add an `engine/story` barrel for story exports (keep temporary re-exports
  from `engine.ts` for back-compat); have engine modules import from `content/types` + a slim
  persistence-types module instead of `domain`. Long-term, split persistence types out of
  `domain.ts`. Note: `backend.ts` is already a clean barrel — leave it.

### P3.5 — Misc correctness/quality nits
- Co-locate recommendation copy (`recommendations.ts:79-98`) and completion copy
  (`CompleteScreen.tsx:105-145`) with content (`course.ts` / `Lesson`) instead of hardcoding.
- Merge `ChoiceTable` (`OperationChoiceStepView.tsx:95-113`) into `ValueTable` via an
  `ariaHidden?` prop.
- Unify the "clean/mastery-grade completion" check duplicated in `courseHelpers.ts:94-124` and
  `masteryCelebration.ts:24-28`.
- Replace `setState`-during-render in `LessonPlayer.tsx:31-35` with an effect; type
  `ProfileScreen` attempts as `AttemptEvent[]` (`ProfileScreen.tsx:18`); guard `main.tsx:7`
  non-null root.
- Extract the Cloud Function OpenAI proxy protocol shared with `functions/index.js:21-47` from
  `src/story/openAiProxyProtocol.ts` (single source), and add a `functions/` Dependabot ecosystem.

---

## 4. Suggested sequencing (dependency-aware)

```
P0.1 manualChunks ─┐
P0.2 CI test:ci    ├─ independent quick wins (land first, separate commits)
P0.5 doc fixes     │
P0.6 statereport   ┘
P0.3 MCQ engine checker ── P0.4 McqStep.feedback required
P1.7 mastery/ID/password dedup (independent)
P1.1 scene-selection shared ──┐
P1.3 drop dead pickScene ─────┼── P1.2 Story AI factory
P1.4 SceneId-from-catalog ────┘   (do P1.1/P1.3 before P2.x story splits)
P1.5 drag hooks ── P1.6 PlotGrid ── P1.8 CSS tokens/motion.css
        │
        └────────────────────────► P2.1–P2.12 file splits (mechanical after dedup)
P3.* polish (anytime; P3.1 comment trim pairs well with each split)
```

Rationale: dedup and single-source-of-truth (P1) **shrink** the files first, so the P2 splits are
smaller and lower-risk. Build/CI/doc fixes (P0) are independent and should land immediately.

---

## 5. Explicitly out of scope (for this plan)

- No framework/dependency upgrades, no new features, no Story Mode content changes.
- No change to the local-demo crypto model or Firebase security rules (already reasonable for the
  demo threat model; only the **docs** describing them are corrected in P0.5).
- No deletion of intentional patterns: the `domain.ts`/`engine.ts`/`backend.ts` barrels and the
  `*Core` env-split modules stay (they are good and should be the template for new code).
- No bulk reformatting; refactors should be behavior-preserving and reviewable.

---

## 6. Appendix A — Largest files (split candidates)

| Lines | File | Tier |
| --- | --- | --- |
| 1492 | `tests/engine.test.ts` | P2.12 |
| 1471 | `src/styles/story.css` | P2.11 |
| 1238 | `tests/story-safety.test.ts` | P2.12 |
| 1138 | `src/story/useStorySession.ts` | P2.1 |
| 926 | `src/engine/storyMode/numberVariants.ts` | P2.2 |
| 812 | `tests/backend.test.ts` | P2.12 |
| 721 | `src/story/storyPrompts.ts` | P2.3 |
| 684 | `src/story/scenery.ts` | P2.4 |
| 672 | `src/styles/course-path.css` | P2.11 |
| 609 | `src/content/storyTypes.ts` | P2.5 |
| 608 | `src/story/InterestSelectionScreen.tsx` | P2.6 |
| 601 | `src/backend/validation.ts` | P2.8 |
| 552 | `src/app/LearningApp.tsx` | P2.9 |
| 517 | `src/styles/balance.css` | P1.8 / P2.11 |
| 475 | `src/engine/checkers.ts` | P2.10 |
| 469 | `src/story/storySessionReducer.ts` | P2.7 |
| 401 | `src/firebaseBackend.ts` | P2.10 |

## 7. Appendix B — Dead code / dead assets checklist

- [ ] `src/story/scenery.ts:680-684` `pickRandomOffInterestScene`
- [ ] `src/story/storyPrompts.ts` `CANNED_BRIDGE_SEGMENT`, `buildScenePrompt`
- [ ] `src/story/storyAi.ts:55-65` `StoryAI.pickScene` (+ 4 adapter impls)
- [ ] `src/story/storySessionReducer.ts:212-239` mutating review API, `:460-462` `setNarrativeSummary`
- [ ] `src/engine/storyMode/selectNextQuestion.ts` (app-superseded; keep only for tests/legacy)
- [ ] `requiresPassword === false` branch (`AuthScreen.tsx`, `authValidation.ts`)
- [ ] `src/lesson/steps/MultipleChoiceStep.tsx:107` `predict-scale-card level` class
- [ ] `src/styles/course-path.css:157-164` `.path-node h2`
- [ ] `tests/helpers/fixtures.ts:3` `makeLessonProgress` alias export
- [ ] Assets: `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`

## 8. Appendix C — Doc/config fixes checklist

- [ ] CI: `.github/workflows/ci.yml:41` → `npm run test:ci`
- [ ] `vite.config.ts:35-39` per-library `manualChunks`
- [ ] `eslint.config.js` Node globals for `tests/**`
- [ ] `statereport.md` removed + gitignored
- [ ] README "lessons 4-6 shells" → all six authored
- [ ] SECURITY.md / PHASE1_QA_CHECKLIST.md / .env.example / BACKEND_ADAPTERS.md / authValidation.ts:
      "passwordless local" → passworded local demo
- [ ] BACKEND_ADAPTERS.md "EWMA" → ratio-based mastery
- [ ] `.env.example` OpenAI key exposure note → `VITE_`-only + proxy
- [ ] `functions/` Dependabot ecosystem; dedup proxy protocol with `openAiProxyProtocol.ts`
