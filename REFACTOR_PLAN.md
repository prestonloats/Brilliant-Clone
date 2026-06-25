# Refactor Plan — Balance (Brilliant-style Algebra App)

_Repository-wide code review and refactoring plan. Generated from a full read of `src/`, `tests/`, the build config, and the docs._

---

## 0. Executive summary

This codebase is **healthy and already partially refactored** — several large modules
have been split into focused directories (`src/engine/*`, `src/backend/*`,
`src/content/*`, `src/lesson/steps/*`), and the baseline is green:

| Check | Status |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **198 passing** |
| `npm run build` | succeeds (with one chunk-size warning) |

So this is **not** a rescue effort. The work below is a set of **targeted,
independently shippable improvements** that remove genuine duplication, delete dead
code, finish abstractions that were started but not consistently adopted, and reduce
the bundle size. Every phase is designed to keep the four checks above green.

The single highest-value theme: **finish the abstractions that already exist.** The
repo introduced `useCheckableStep`, `StepFeedback`, CSS tokens, and lesson barrels —
but only adopted them in some places, leaving copy-pasted variants next to the
shared version. Closing those gaps removes the most code for the least risk.

### Top findings at a glance

| # | Finding | Severity | Effort |
| --- | --- | --- | --- |
| 1 | Two step views (`BalanceStepView`, `DragTermsStepView`) ignore the shared `useCheckableStep` hook and `StepFeedback` component and hand-roll the same 5 state vars + footer JSX | High (duplication) | Medium |
| 2 | Pointer drag-and-drop machinery is duplicated across **4** step views | High (duplication) | Medium |
| 3 | `vendor` bundle is **1,015 kB** (304 kB gzip): all of Firebase + KaTeX ship to every local-mode user | High (perf) | Low |
| 4 | `AuthScreen` has a hardcoded `const requiresPassword = true` with dead `? :` branches throughout | Medium (AI slop / dead code) | Low |
| 5 | Dead Vite-template assets (`src/assets/react.svg`, `vite.svg`, `hero.png`) | Low (dead files) | Trivial |
| 6 | README claims "Lessons 4–6 are shells" — all six are fully authored | Medium (stale docs) | Low |
| 7 | `engine.test.ts` (1,492 lines) and `backend.test.ts` (727 lines) mix many concerns; ~15–20% of assertions duplicate the `lesson-*.test.ts` files | Medium (test maintainability) | Medium |
| 8 | ~80 hardcoded hex/rgba colors and magic radii/spacing copy-pasted across CSS instead of using tokens | Medium (duplication) | Medium |
| 9 | Adding a lesson requires edits in **7** places (`LessonId` union, lesson file, `lessons/index.ts` ×3, `course.ts`, `domain.ts`, `recommendations.ts`) | Medium (brittle) | Medium |
| 10 | `LearningApp.tsx` (361 lines) is a "god component": 8 `useState` + 10 handlers mixing session, navigation, and persistence | Medium (structure) | Medium |
| 11 | Over-exported / duplicated backend contract types (`Local*Repository` mirror the async repos by hand) | Low | Low |
| 12 | Score-aggregation logic spread across 3 overlapping functions in `progress.ts`; email/password normalization duplicated in 3 files | Low | Low |

---

## 1. Methodology & scope

- Read every file in `src/` (88 files) and `tests/` (21 files), plus build/lint/ts configs.
- Cross-checked "dead code" claims with `grep` before recommending deletion (see §2 caveats).
- Established a green baseline (lint + typecheck + 198 tests + build) so each phase can
  be verified against it.

**Out of scope / explicitly NOT recommended:**

- The barrel files `src/domain.ts`, `src/backend.ts`, `src/engine.ts` are **intentional
  public re-export barrels**, not dead shims. Keep them.
- `src/App.css` is an **import manifest** (documents CSS cascade order), not leftover
  boilerplate. Keep it.
- `src/firebaseConfig.ts` ↔ `firebaseConfigCore.ts` and `firebaseBackend.ts` ↔
  `firebaseBackendCore.ts` are a deliberate "pure logic vs. `import.meta.env`/SDK"
  split that keeps the core unit-testable. Keep the split.
- No framework swaps, no rewrites. The architecture is sound.

---

## 2. Detailed findings

### 2.1 Dead code & leftover artifacts

| Item | Location | Evidence | Action |
| --- | --- | --- | --- |
| Vite template SVGs + unused hero image | `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png` | `grep` for `react.svg\|vite.svg\|hero.png\|assets/` → **no matches** anywhere in `src/` | Delete the files |
| Vestigial `requiresPassword` flag | `src/auth/AuthScreen.tsx:14` (`const requiresPassword = true`) and its `?:`/`&&` uses at lines 38–56, 127, 138 | The value is a literal `true`; every `requiresPassword ? X : undefined` / `{requiresPassword && …}` false-branch is unreachable | Inline `true`, delete the dead branches |
| Over-exported types (not truly dead, but exported wider than used) | `src/backend/types.ts:27–51` (`MaybePromise`, `AuthRepository`, `ProgressRepository`, `MasteryRepository`, `AttemptRepository`) | These are only consumed inside `types.ts` to compose `Backend`. `AuthRepository` is referenced in docs only. | Keep the types; consider not `export`ing the ones only used to build `Backend` (or keep for docs — low priority) |
| Duplicated sync contract | `src/backend/types.ts:63–85` (`LocalAuthRepository`…`LocalAttemptRepository`) | **Used** by `LocalBackend.ts:45–48`, so NOT dead. But they hand-mirror the async repos minus `MaybePromise`. | Derive them from the async repos via a mapped type (`UnwrapPromise<T>`) instead of re-declaring |
| `normalizeLocalUser` exported but only used internally | `src/backend/validation.ts:106` (used at `:201`) | Single internal caller | Drop the `export` (minor) |

> **Caveat / correction:** an automated pass initially flagged the `Local*Repository`
> and `*Repository` types as "dead exports." Manual `grep` shows they **are** used
> (to type `LocalBackend`'s fields and to compose `Backend`). They are a *duplication*
> issue, not deletable dead code. Treat accordingly.

### 2.2 AI slop / vestigial patterns

- **Dead conditional branches** from `requiresPassword` (above) — the clearest "slop"
  artifact: a feature flag frozen to `true` with both branches left in.
- **Over-narration in tests**: ~40–50 comment lines across `tests/lesson-*.test.ts`
  restate what the next line obviously does (e.g. `lesson-balancing-equations.test.ts`
  lines 10, 15–16, 22–23). (Note: many comments in `src/` are genuinely useful domain
  context — e.g. the escalation rationale in `engine/checkers.ts` — and should be kept.)
- **Copy-paste-shaped tests** that should be table-driven (see §2.7).

### 2.3 Duplication — step views (highest-value cleanup)

The repo already has the right abstractions; they're just not adopted everywhere.

- `src/lesson/steps/useCheckableStep.ts` owns the 5 shared states
  (`feedback`, `correct`, `attempts`, `reveal`, `retryGuidance`) + `submit()` + `clearStatus()`.
- `src/lesson/steps/StepFeedback.tsx` owns the shared footer (banner + retry prompt + Continue).

**Adopted by 9 views**, but **NOT** by:

| View | Lines | What it re-implements |
| --- | --- | --- |
| `src/lesson/steps/BalanceStepView.tsx` | 394 | All 5 states (lines 68–73), inline `check()` (211–220), inline footer JSX (372–391) |
| `src/lesson/steps/DragTermsStepView.tsx` | 333 | All 5 states (59–63), `clearStatus` (80–85), inline `check()` (203–212), inline footer (318–329) |

Compare to `ManipulativeStepView.tsx`, which uses both helpers and is materially
shorter for the same behavior.

**Pointer drag machinery duplicated across 4 views** (`grep` for
`addEventListener('pointermove'` / `getBoundingClientRect`):
`BalanceStepView`, `DragTermsStepView`, `ManipulativeStepView`, `PlotStepView`. Each
re-implements: a `dragging` state object, a `pointermove/up/cancel` effect, a
`startDrag` that captures `getBoundingClientRect`, a `lastDrop*` "bounce" reset on a
`BOUNCE_RESET_MS` timer, and a `<DragPreview>` render. The drop-target detection is
already factored per-view (`getDropTargetAtPoint`, `getTermZoneAtPoint`,
`getManipulativeZoneAtPoint`), so only the generic gesture is duplicated.

**`StepRenderer.tsx:22–71`** is a 10-branch `if` chain where every branch is a
near-identical `<XStepView step={step} priorResult={priorResult} onAdvance={onAdvance} onComplete={onComplete} />`.

### 2.4 Duplication — CSS (~2,900 lines, 15 files)

- Tokens exist (`src/index.css:1–14` `:root`) but are under-used: **~149** `var(--…)`
  references vs **~80** hardcoded hex literals and **~102** `rgba(...)` literals.
  `rgba(37, 99, 235, …)` (the accent) alone appears **~26 times** across 10 files.
- No tokens for radii/spacing/durations: `border-radius: 999px` ×18, `22px` ×12,
  `gap: 12px` ×14, `180ms ease` ×19, focus `outline: 3px solid` ×5 — all magic values.
- Repeated component palettes copy-pasted: the **drop-target highlight** (~5 rules)
  appears in 4 files; the **amber tray gradient** in 4; **gold chip** styling in 4;
  success/warning palettes in 3–4.
- Shared `@keyframes` (`tile-drop`, `pan-bounce`, `lift-tile`, `scale-settle`) live in
  `drag-terms.css:184–227` but are used by `balance.css`/`manipulative.css` — misfiled.
- Responsiveness is well-centralized (single `720px` breakpoint in `responsive.css`,
  plus `clamp()` elsewhere) — only one duplicated locked-connector gradient
  (`course-path.css:295` ↔ `responsive.css:129`).

### 2.5 Duplication — lesson content authoring

All six lesson files are **pure data** (good). But authoring is repetitive:

- **4 near-identical balance "isolate" steps** (~140 lines) across
  `balancing-equations.ts` (2), `one-step-equations.ts`, `two-step-equations.ts`.
- 11 sequence steps and 13 `hintsByAnswer` input steps repeat the same feedback skeleton.
- A small set of authoring factories (`isolateBalanceStep(...)`,
  `sequenceStep(...)`, `inputStep(...)`) would cut the boilerplate and standardize shape.

### 2.6 Large files to break down

| File | Lines | Recommendation |
| --- | --- | --- |
| `tests/engine.test.ts` | 1,492 | Split by concern (see §2.7) |
| `src/styles/course-path.css` | 665 | Optional split: dashboard / graph / mastery |
| `tests/backend.test.ts` | 727 | Split: auth / firebase-core / local-repos / persistence |
| `src/styles/balance.css` | 517 | Optional split: abstract scale / physical scale / tile-drag |
| `src/engine/checkers.ts` | 475 | Optional: group the data-driven checkers (plot/slider/dragTerms/manipulative) vs. the equation checkers; share `makeHintHelpers`/`buildWrongResult` from one place. Cohesive today — low priority. |
| `src/lesson/steps/BalanceStepView.tsx` | 394 | Shrinks naturally once it adopts `useCheckableStep` + `usePointerDrag` (§3 Phase 1) |
| `src/content/types.ts` | 384 | Mostly well-documented types; optional split per step-type if it keeps growing. Low priority. |
| `src/app/LearningApp.tsx` | 361 | Extract custom hooks (see §2.8) |

### 2.7 Test suite

- **`engine.test.ts` mixes 5 concerns**: checker mechanics, progress/scoring,
  recommendations, graph/path, and a 76-line content-catalog lint (lines 1416–1492).
  Suggested split: `engine-checkers.test.ts`, `engine-progress.test.ts`,
  `engine-recommendations.test.ts`, `engine-graph-path.test.ts`, and move the catalog
  lint to `content-catalog.test.ts` (or a non-test validator).
- **Cross-file redundancy**: ~15–20% of assertions duplicate the `lesson-*.test.ts`
  integration tests (e.g. balance drag-to-level, coordinate plot checks).
- **Inline fixture repetition**: `new LocalBackend()` ×37, identical `signUp({...})`
  payloads ×21, `createInitialProgress('user-1', …)` ×25, and 3 parallel
  "completed-progress" builders. Centralize in `tests/helpers/` (a `backend-fixtures.ts`,
  a `progress.ts`, and an `assertEscalates()` helper) — removes ~200+ lines.
- **Build pipeline** (`tests/build-tests.mjs`): transpiles the *entire* `src/` tree to
  CJS via esbuild, then runs `node --test`. Works and is fast, but has more moving
  parts than needed and `npm test` does **not** typecheck (only `test:ci` does).
  Optional: migrate to `tsx --test` or `vitest` (node env) to drop the CJS shim.

### 2.8 Structural — `LearningApp.tsx`

`src/app/LearningApp.tsx` (361 lines) holds 8 `useState`s and 10 handlers
(`applySession`, `refreshLearnerData`, `saveProgress`, `completeStep`,
`handleSignedIn`, `handleVerificationContinue`, `handleSignOut`, `launchLesson`,
`retakeLesson`, …) that mix three responsibilities:

1. **Session/auth lifecycle** (load current user, verify-email gating, sign in/out).
2. **Lesson navigation** (launch, retake, view switching).
3. **Progress persistence** (save progress, record attempts, refresh mastery/attempts).

Extracting `useLearnerSession(backend)` and `useLessonFlow(...)` custom hooks would
turn `LearningApp` into a thin view-router and make the data flow testable in isolation.

### 2.9 Build / performance

`vite.config.ts:12–16` puts **all** of `node_modules` into one `vendor` chunk →
**1,015 kB / 304 kB gzip**, triggering Vite's >500 kB warning. Firebase is already
lazy-loaded at the *adapter* level (`firebaseBackend`/`firebaseServices` are tiny
separate chunks), but the Firebase *library* still rides in `vendor`, so **local-mode
users download the whole Firebase SDK and KaTeX up front.** Split `firebase*` and
`katex` into their own `manualChunks` groups (and ideally load KaTeX CSS/JS only when
the first `MathText`/equation renders).

### 2.10 Documentation drift

- `README.md:3, 38–39, 135` describe Lessons 4–6 as "shells" / "lightweight content
  shells" — but `like-terms`, `coordinate-plane`, and `graphing-lines` are each fully
  authored (10–11 steps, with `dragTerms`/`plot`/`slider` interactions). Update README.
- Root holds several large narrative docs (`statereport.md` 33 KB, `Brilliant Practice
  PRD.md` 30 KB, `Brilliant Backend BrainLift.md` 15 KB, `PHASE1_QA_CHECKLIST.md`
  12 KB). Not code, but consider moving design/history docs into a `docs/` folder to declutter root.

---

## 3. Phased refactoring plan

Each phase is independently shippable and must keep lint + typecheck + 198 tests +
build green. Phases are ordered by **value ÷ risk**, starting with the safest wins.

### Phase 0 — Quick wins (low risk)
**Goal:** delete dead weight and stale docs; no behavior change.
1. Delete `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`.
2. `AuthScreen.tsx`: inline `requiresPassword = true`, remove dead `?:`/`&&` branches.
3. Drop the unnecessary `export` on `normalizeLocalUser`.
4. Update `README.md` to describe the full six-lesson path (remove "shell" language).
5. (Optional) Move narrative `*.md` design docs into `docs/`.

_Verify:_ `npm run lint && npm run typecheck && npm test && npm run build`.

### Phase 1 — Consolidate step-view duplication (highest code-quality ROI)
**Goal:** one source of truth for checkable-step state, footer, and drag gestures.
1. Migrate `BalanceStepView` and `DragTermsStepView` to `useCheckableStep` +
   `StepFeedback` (matching `ManipulativeStepView`). Removes ~5 states + footer JSX from each.
2. Extract a `usePointerDrag` hook in `src/lesson/steps/` capturing the shared gesture
   (dragging state, global `pointermove/up/cancel` effect, `startDrag`, `lastDrop`
   bounce timer, `DragPreview` props). Parameterize the drop-target resolver per view.
   Adopt in `Balance`, `DragTerms`, `Manipulative`, `Plot` views.
3. (Optional) Replace the `StepRenderer` `if`-chain with a typed registry
   `Record<StepType, ComponentForStep>` to remove 10 near-identical branches
   (keep the `build-product` sub-dispatch comment).

_Verify:_ checks green; add a focused unit test for `useCheckableStep` and (optionally)
the first React-component test for one step view, since UI currently has 0 test coverage.

### Phase 2 — CSS design tokens & shared partials
**Goal:** replace copy-pasted color/spacing values with tokens; defrag animations.
1. Expand `:root` in `index.css` with semantic tokens: `--success-bg/-text`,
   `--warning-bg/-text`, `--correct`, gold/tile palettes, and
   `--accent-alpha-12/-28` (kills the ~26 `rgba(37,99,235,…)` copies).
2. Add layout tokens: `--radius-sm/md/lg/pill`, `--space-*`, `--dur-fast`, `--bp-mobile`.
3. Create `styles/animations.css` (move keyframes out of `drag-terms.css`) and a shared
   `interactive-surfaces.css` (drop-target, dashed zone, amber tray, gold chip).
4. (Optional) Split `course-path.css` and `balance.css` along the seams in §2.6, keeping
   `responsive.css` last in the `App.css` manifest.

_Verify:_ checks green; visual smoke test via `npm run dev` (no token should change a
rendered color — pure refactor).

### Phase 3 — Lesson authoring ergonomics & single registry
**Goal:** make adding/editing lessons a one-file change; cut authoring boilerplate.
1. Introduce a single `lessonModules` list and derive the `lessons` map + (optionally)
   `course.lessonOrder` from it, collapsing the 7 edit points toward 1–2.
2. Add authoring factories: `isolateBalanceStep(...)`, `sequenceStep(...)`,
   `inputStep(...)` to standardize feedback shape and remove ~140 lines of duplicate
   balance scaffolding.
3. Move the per-lesson "next lesson" motivational copy out of
   `engine/recommendations.ts:79–98` into lesson content (eliminates a wiring point).
4. Normalize step-id conventions (`complete-*-summary`, `mastery-*`).

_Verify:_ the catalog-lint test (currently `engine.test.ts:1416–1492`) guards structure;
checks green.

### Phase 4 — Engine/backend internals (low risk, small)
1. `progress.ts`: consolidate `getLatestLessonScore`/`getBestLessonScore`/
   `restartLessonProgress` history logic behind one `collectLessonScores(lesson, progress)`.
2. Add a shared `normalizeEmail()` used by `validateSignUpInput`, `LocalBackend.signIn`,
   `FirebaseBackend.signIn` (3 copies of `trim().toLowerCase()`), and a shared
   password-min-length guard.
3. Derive `Local*Repository` types from the async repos via an `Unwrap<MaybePromise>`
   mapped type instead of re-declaring them.

_Verify:_ existing backend/engine tests cover these; checks green.

### Phase 5 — Test suite restructuring
1. Split `engine.test.ts` and `backend.test.ts` along the seams in §2.7.
2. Centralize fixtures in `tests/helpers/` and add `assertEscalates()` for the
   hint→explanation→reveal ladder; dedupe the ~15–20% overlap with `lesson-*.test.ts`.
3. Move the content-catalog lint into its own file or a standalone validator script.
4. (Optional) Make `npm test` typecheck too, or migrate the runner to `tsx`/`vitest`.

_Verify:_ same total assertions pass; faster, clearer files.

### Phase 6 — Bundle/perf
1. In `vite.config.ts`, split `manualChunks` so `firebase/*` and `katex` become their
   own chunks rather than living in `vendor`.
2. Confirm Firebase code only loads in firebase mode (adapter already lazy-loads;
   ensure the library does too) and that local-mode initial JS drops materially.

_Verify:_ `npm run build` shows the vendor chunk shrink and no chunk >500 kB warning
(or an intentional adjusted limit); checks green.

### Phase 7 (optional) — `LearningApp` decomposition
Extract `useLearnerSession(backend)` and `useLessonFlow(...)` hooks so `LearningApp`
becomes a thin router. Do this last: it touches the app's core state and benefits from
the Phase 1 step-view cleanup landing first. Add hook-level tests when extracting.

---

## 4. Sequencing, risk & verification

```
Phase 0 ─▶ Phase 1 ─▶ Phase 2
   │           │
   ├──▶ Phase 3 (content)        ┐
   ├──▶ Phase 4 (engine/backend) ├─ independent; any order after Phase 0
   ├──▶ Phase 5 (tests)          │
   └──▶ Phase 6 (bundle)         ┘
                  └──▶ Phase 7 (LearningApp) — after Phase 1
```

- **Risk profile:** Phases 0, 4, 6 are very low risk (dead code, pure helpers, build
  config). Phase 2 is low risk if treated as a pure value-substitution. Phases 1, 3, 5,
  7 are medium risk and should each land as small PRs.
- **Guardrail for every PR:** `npm run lint && npm run typecheck && npm test && npm run build`
  must stay green (baseline: lint clean, typecheck clean, **198 tests**, build OK).
- **Test-coverage note:** all `.tsx` UI is currently untested. Phase 1 is a good moment
  to add the first 1–2 component/hook tests (especially `useCheckableStep` and one step
  view), so the consolidation is protected.

## 5. Impact ÷ effort summary

| Phase | Primary benefit | Effort | Risk |
| --- | --- | --- | --- |
| 0 Quick wins | Less dead code, accurate docs | Low | Very low |
| 1 Step views | Removes the largest real duplication | Medium | Medium |
| 2 CSS tokens | Themeable, DRY styles | Medium | Low |
| 3 Content | One-file lessons, less boilerplate | Medium | Low–Med |
| 4 Engine/backend | Simpler scoring + shared utils | Low | Very low |
| 5 Tests | Maintainable, faster-to-navigate suite | Medium | Low |
| 6 Bundle | Smaller initial download for local mode | Low | Very low |
| 7 LearningApp | Testable session/navigation logic | Medium | Medium |

_Recommended starting point: Phase 0 → Phase 1 → Phase 6 (high signal, mostly low risk)._
