# Refactor Plan — Balance (Brilliant Practice clone)

_A full-repository review of code quality, dead code, duplication, oversized files, and
"AI slop," with a prioritized, behavior-preserving plan to address each finding._

Generated from a manual review of every `src/` module plus tests, CSS, docs, and build
config. Baseline at time of review (Node 22 locally; repo pins 24.16.0):

- `npm run lint` — **passes, 0 warnings**
- `npm run typecheck` (`tsc -p tsconfig.test.json`) — **passes**
- `npm test` — **203/203 pass** (`node --test` over esbuild output)
- `npm run build` — **succeeds**, but emits a **1,015 KB (304 KB gzip) `vendor` chunk** and a
  Rollup "chunk larger than 500 KB" warning.

---

## TL;DR — the honest assessment

This codebase is **already in good shape**. It has a clean layered architecture (content →
engine → backend → app/UI), pure and well-tested domain logic, intentional barrel/`*Core`
splits for testability, and comments that mostly explain *intent* rather than restating code.
A prior commit (`a4b7918 "Remove dead code, AI slop, and duplication"`) clearly did a cleanup
pass.

So this is **not** a rewrite. It is a set of **targeted, mostly behavior-preserving
improvements**. The highest-value item is a one-line **build-config bug** that ships the entire
Firebase SDK to every local-mode visitor. After that, the biggest wins are **deduplicating the
interactive step views** (drag-and-drop, SVG grids, feedback scaffolding) and **introducing a
fuller CSS token layer**. Tests and docs need pruning and accuracy fixes.

### Effort/impact map

| Phase | Theme | Impact | Risk | Invasiveness |
|------|-------|--------|------|--------------|
| 0 | Dead code & quick wins | Low | Very low | Trivial |
| 1 | Build/bundle correctness | **High** | Low | 1 file |
| 2 | UI component deduplication | **High** | Medium | `src/lesson/**`, `src/components/**` |
| 3 | CSS tokens & dedup | Medium | Low–Med | `src/styles/**` |
| 4 | Test suite restructure & coverage | Medium | Low | `tests/**` |
| 5 | Docs consolidation & accuracy | Medium | Very low | `*.md`, `.env.example` |
| 6 | App-shell & CI hardening | Low–Med | Low | `App`, `vite`, CI |

Each phase is independently shippable. Recommended order is 1 → 0 → 4 → 2 → 3 → 5 → 6
(do the build fix first for impact; land the test harness before the big UI refactor so the
deduplication is regression-protected).

---

## Guiding principles

1. **Behavior-preserving by default.** Every change keeps the 203 existing tests green; UI
   changes are verified to render identically. Any intentional behavior change is called out.
2. **Test-first for risky refactors.** Phase 4 (test harness + coverage of MCQ, `equationLatex`,
   `plotGeometry`, `courseHelpers`) lands *before* Phase 2 so the UI dedup is protected.
3. **Small, reviewable commits.** One concern per commit, matching the repo's existing history.
4. **No new runtime dependencies.** Everything proposed uses what's already installed.
5. **Keep the good splits.** The barrels (`domain.ts`, `engine.ts`, `backend.ts`) and the
   `*Core` files (`firebaseConfigCore`, `firebaseBackendCore`) are intentional and stay.

---

## Phase 0 — Dead code & quick wins (very low risk)

Small, isolated removals/fixes with no behavioral effect. Good warm-up commits.

### 0.1 Remove unused template assets
- **Evidence:** `src/assets/react.svg`, `src/assets/vite.svg`, and `src/assets/hero.png` have
  **zero references** anywhere in `src/` (verified by search). `react.svg`/`vite.svg` are
  leftover Vite-template files.
- **Action:** Delete all three. Confirm `index.html`/`public/` favicon usage is unaffected
  (favicon comes from `public/favicon.svg`).
- **Verify:** `npm run build` still succeeds; grep confirms no imports.

### 0.2 Remove stale generated doc
- **Evidence:** `statereport.md` (~33 KB) is a one-off, dated (2026-06-24) auto-generated audit
  embedding commit SHAs, PR numbers, bundle byte counts, and "dirty working tree" notes. Its
  metrics are **already wrong** (claims 161 tests/13 files; actual is 203 tests/18+ files). It
  duplicates README/PRD/BACKEND_ADAPTERS content and will rot on every merge.
- **Action:** `git rm statereport.md`. (Covered again in Phase 5 doc cleanup.)

### 0.3 Tidy minor unused/odd imports & props
- **`src/lesson/steps/BalancePans.tsx`** imports `getBalanceCue` as a *value* but uses it only
  in a `ReturnType<typeof getBalanceCue>` type position → switch to `import type` / restructure.
- **`src/lesson/steps/NumericInputStep.tsx`** seeds `answer` to `''` and never restores the
  learner's previously typed value on revisit even though `priorResult` is available — either
  restore it (small UX fix) or document why it's intentionally blank.
- **Action:** Adjust imports; decide and document the NumericInput resume behavior.
- **Verify:** lint + typecheck.

### 0.4 Remove candidate-unused CSS hooks (after confirmation)
- **Evidence (best-effort, confirm before deleting):**
  - `.slider-card` (used as a class in `SliderStepView.tsx:96`) and `.plot-card`
    (`PlotStepView.tsx:170`) have **no CSS rule** — either dead class names or missing styles.
  - `.available` is produced by `courseHelpers.getPathStatus` but **no `.available` rule** exists.
  - `.path-node h2` selector in `course-path.css` targets an element that is rendered as `<h3>`.
- **Action:** For each, decide *delete the dead class* vs *add the intended rule*. Document the
  resolution in the commit.

**Phase 0 deliverable:** ~3–4 tiny commits; bundle/file count shrinks; no behavior change.

---

## Phase 1 — Build/bundle correctness (HIGH impact, low risk, 1 file)

### 1.1 Stop forcing the entire vendor tree (incl. Firebase) into one eager chunk
- **Problem:** `vite.config.ts` sets `manualChunks(id) { if (id.includes('node_modules')) return 'vendor' }`.
  This collapses **all** dependencies — React, KaTeX, **and the entire Firebase SDK** — into a
  single eagerly-loaded `vendor` chunk.
- **Why it matters:** `src/app/startup.ts` carefully `await import('../firebaseServices')` /
  `import('../firebaseBackend')` *only* when `VITE_BACKEND_PROVIDER=firebase`, precisely so the
  default local path never loads Firebase. The `manualChunks` rule **defeats that optimization**.
  Concrete build evidence:
  ```
  firebaseBackend-*.js     4.06 kB     ← tiny app wrapper (lazy)
  index-*.js             160.63 kB
  vendor-*.js          1,015.51 kB │ gzip: 303.94 kB   ← React + KaTeX + ALL of Firebase, eager
  ```
  Every local-mode visitor downloads hundreds of KB of Firebase SDK they never execute.
- **Action (pick one):**
  1. **Simplest:** remove the custom `manualChunks` entirely and let Rollup code-split naturally
     (the dynamic `import()`s already create separate Firebase chunks), **or**
  2. **Targeted:** split vendor by package so Firebase lands in its own lazily-loaded chunk, e.g.
     keep `react`/`react-dom` (+ optionally `katex`) in a stable `vendor` chunk and let
     everything Firebase fall through to the dynamic-import chunk.
- **Risk:** Low. Behavior identical; only chunk boundaries change. Validate by inspecting the
  build output: the local entry path must **not** statically reference any `firebase/*` chunk.
- **Verify:** `npm run build`; confirm Firebase code is no longer in the eager initial chunk and
  the >500 KB warning is gone (or only KaTeX-driven). Optionally add a comment documenting the
  intent so it isn't "re-optimized" back into a regression.

---

## Phase 2 — UI component deduplication (HIGH impact, medium risk)

The interactive step views grew by copy-paste. There are **existing** shared abstractions
(`useCheckableStep`, `StepFeedback`, `DragPreview`, `plotGeometry`, `balanceHelpers`) that are
**only partially adopted**. The goal is to finish the consolidation, not invent new patterns.

> Land Phase 4's test harness + the MCQ/`plotGeometry`/`balanceHelpers` coverage first so these
> refactors are regression-protected.

### 2.1 Extract a shared pointer-drag hook (`usePointerDrag`)
- **Problem:** The window-level pointer lifecycle (pointermove/up/cancel listeners, drag-preview
  coordinates, hover-zone tracking, cleanup) is reimplemented in **3** views:
  - `BalanceStepView.tsx` (`useEffect` 133–166, `startDrag` 168–181)
  - `DragTermsStepView.tsx` (~123–180, plus a 6 px tap-vs-drag threshold)
  - `ManipulativeStepView.tsx` (~103–140)
  Together ~75–105 duplicated lines with only minor per-view differences.
- **Action:** Add `src/lesson/steps/usePointerDrag.ts`:
  ```ts
  usePointerDrag<TPayload>({
    enabled, threshold?, capturePointer?,
    getZoneAt: (x, y) => Zone | null,
    onDrop: (zone, payload) => void,
    onTap?: (payload) => void,
  })
  ```
  Migrate all three views to it. Balance keeps `setPointerCapture`; DragTerms keeps `threshold`
  and `onTap`; Manipulative uses the base behavior.
- **Risk:** Medium (touches the most interactive code). Mitigate with the harness + manual
  drag/keyboard QA per view.

### 2.2 Generalize drop-zone hit-testing
- **Problem:** Three near-identical `elementFromPoint(...).closest('[data-…]')` helpers:
  `getDropTargetAtPoint` (`balanceHelpers.ts:159`), `getTermZoneAtPoint`
  (`DragTermsStepView.tsx:17`), `getManipulativeZoneAtPoint` (`ManipulativeStepView.tsx:20`).
- **Action:** One generic `getZoneAtPoint(x, y, selector, read)` (e.g. in `balanceHelpers.ts` or
  a new `dragZones.ts`); express the three as thin wrappers.

### 2.3 Extract the drop-bounce effect (`useDropBounce`)
- **Problem:** The "set bounced zone, clear after `BOUNCE_RESET_MS`" `useEffect` +
  `requestAnimationFrame` reset appears in Balance, DragTerms, and Manipulative (~12 lines × 3).
- **Action:** `useDropBounce(zoneKey)` returning `[bounced, triggerBounce]`. The `BOUNCE_RESET_MS`
  constant already lives in `constants.ts`; centralize the effect too.

### 2.4 Migrate the two legacy views to `useCheckableStep` + `StepFeedback`
- **Problem:** `useCheckableStep.ts` (feedback/correct/attempts/reveal/retryGuidance + submit +
  clearStatus) and `StepFeedback.tsx` (banner + retry prompt + Continue) are used by **9** step
  views, but `BalanceStepView` and `DragTermsStepView` **reimplement both inline** (~50 lines of
  state + ~20 lines of footer JSX each). See `BalanceStepView.tsx` 68–73 & 375–394.
- **Action:** Adopt the existing hook + component in both. Balance's operation-reset path maps to
  `StepFeedback`'s `retryActionLabel`/`onRetryAction` props (already designed for this).
- **Payoff:** Removes the single biggest "sibling files diverge" inconsistency in the UI.

### 2.5 Extract a shared coordinate-grid component (`PlotGrid`)
- **Problem:** The SVG grid math (`span`, `ticks`, `toSvgX`, `toSvgY`) and the axis/tick markup
  are duplicated across `LineGraph.tsx` (19–59), `PlotStepView.tsx` (60–64, 190–241), and
  `SliderStepView.tsx` (51–54, 109–136) — ~80–100 lines. `plotGeometry.ts` shares the constants
  and `lineEndpoints` but **not** the rendering layer.
- **Action:** Add `src/components/PlotGrid.tsx` (or `src/lesson/PlotGrid.tsx`) rendering the
  grid/axes/ticks given `range`; let the three callers layer points/line/cursor on top. Keep
  geometry in `plotGeometry.ts`.

### 2.6 Smaller, optional consolidations
- **IO tables:** `ValueTable.tsx` vs inline `ChoiceTable` in `OperationChoiceStepView.tsx`
  (~18 dup lines) → render `ValueTable` (with an `aria-hidden`/caption option).
- **Manipulative chip/zone markup:** shared between `ManipulativeStepView` and
  `ManipulativeBuildView` (~25 lines) → small presentational `ManipulativeZone`/chip helper.
- **MCQ selection chrome:** `MultipleChoiceStep` and `OperationChoiceStepView` share selection
  logic (~15 lines) → optional shared `ChoiceButton`.
- **Lesson card shell:** all 12 step views repeat the `<article class="lesson-card card">` +
  eyebrow/title scaffold. A `StepCard` wrapper would remove ~96 structural lines but touches
  every view — schedule last, only if Phase 2 lands cleanly.

### 2.7 Break down the largest components (follow-on)
After 2.1–2.5, re-split by responsibility:
- `BalanceStepView.tsx` (398) → `SymbolicScaleStage` (the inline SVG scale, 245–308),
  `BalanceItemBank` (311–346), `BalanceOperationGrid` (362–370); leave orchestration in the view.
- `DragTermsStepView.tsx` (334) → `TermTray`/`TermBin` presentational pieces + the new drag hook.
- `PlotStepView.tsx` (298) → `PlotGrid` (2.5) + a `usePlotInteraction` hook (click/keyboard→data).

**Estimated dedup:** ~120–150 lines (drag), ~80–100 (grid), ~70 (feedback) — several hundred
lines net, with consistent behavior across siblings.

---

## Phase 3 — CSS tokens & deduplication (medium impact, low–med risk)

CSS is ~3,219 lines across 15 files with a clean two-tier entry (`index.css` tokens +
`App.css` manifest of partials) and well-centralized responsive/reduced-motion handling. The
issue is an **incomplete token system**: the core blue/gray palette is tokenized (`var(--…)`
used ~173×), but semantic colors, spacing, radii, and motion are hardcoded and repeated.

### 3.1 Extend the design-token layer in `index.css`
- **Evidence of repetition:**
  - `rgba(37, 99, 235, …)` (the accent blue) appears **~34×** across 10 files, never tokenized.
  - `#111827` (==`--text-h`) hardcoded 5×; `#dbeafe` (==`--accent-soft`) hardcoded; gold
    (`#f59e0b`/`#fbbf24`) and orange (`#9a3412`/`#ffedd5`) palettes repeated with no tokens.
  - Spacing (`gap: 8/12/14px`, `margin: 18px 0` ×6, `padding: 14px` ×8), radii (`999px` ×19,
    `22px` ×15, `18px` ×12), `min-height: 44px` ×5, `font-weight: 800` ×47.
  - A `180ms ease` 4-property transition block is copy-pasted **4×**; `cubic-bezier(0.22,1,0.36,1)`
    appears 3–4×.
- **Action:** Add semantic tokens: `--accent-rgb`, `--color-success-*`, `--color-warning-*`,
  `--color-gold-*`; a spacing scale `--space-1..6`; `--radius-pill/card/control`;
  `--transition-fast`, `--ease-out-expo`; `--touch-min: 44px`. Then sweep partials to replace the
  literals. This is mechanical and visual-diff-verifiable (no pixel changes intended).

### 3.2 Consolidate copy-pasted rule blocks into utilities
- **Drop-target highlight** is byte-identical in `manipulative.css:131`, `drag-terms.css:115`,
  and near-identical in `balance.css:355`/`258` → one `.drop-target` utility (or shared
  `@mixin`-style class) applied across zones.
- **Gold draggable chip/tile** (gradient+border+shadow) repeats in `balance.css`,
  `manipulative.css`, `drag-terms.css`, `lesson.css` → one `.chip`/`.tile` base.

### 3.3 Resolve the cross-file `@keyframes` dependency
- **Problem:** `drag-terms.css` *defines* shared animations (`chip-pop`, `pan-bounce`,
  `zone-correct`, `tile-drop`, `lift-tile`) that `balance.css` and `manipulative.css` consume —
  a fragile, misleading ownership (works only because keyframes are global).
- **Action:** Move shared keyframes into a dedicated `styles/animations.css` imported early in
  `App.css`; keep feature partials consuming them.

### 3.4 Split the two oversized stylesheets
- `course-path.css` (666) mixes path graph + progress bars + mastery celebration + connectors;
  `balance.css` (518) is the largest widget sheet. Split each into focused partials
  (e.g. `course-path.css` → `path-graph.css` + `mastery.css`) listed in `App.css` in the same
  cascade order. Also flag the brittle `:nth-of-type(1..6)` stage selectors (hard-cap at 6
  stages) and `complete-card > *:nth-child(1..6)` stagger for a more robust approach.

---

## Phase 4 — Test suite restructure & coverage (medium impact, low risk)

203 tests pass and helpers exist (`tests/helpers/{findStep,localStorage,fixtures}.ts`), but two
files are oversized, several tests duplicate across files, and a few important paths are
untested. **Do the coverage additions (4.3) before Phase 2.**

### 4.1 Split the two large test files along natural seams
- **`tests/engine.test.ts` (1,492 lines)** → move synthetic step fixtures (79–185) to
  `tests/fixtures/`, then split into `engine.checkers.test.ts`, `engine.progress.test.ts`,
  `engine.path.test.ts`, and `content.catalog.test.ts` (the 1416–1492 schema validator).
- **`tests/backend.test.ts` (726 lines)** → `backend.auth.test.ts` (~68–281),
  `backend.firebase-core.test.ts` (~283–397), `backend.repositories.test.ts` (~399–523),
  `backend.persistence.test.ts` (~525–726).

### 4.2 Remove duplication & fix misleading names
- The `engine.test.ts` "lesson smoke" blocks (981–1414) **re-test** the dedicated
  `lesson-*.test.ts` files (drag-to-level, plot/swapped, slider, like-terms, two-step…). Keep
  lesson-specific string assertions in `lesson-*.test.ts`; reduce `engine.test.ts` to one smoke
  assertion per lesson (or delete where fully covered).
- De-dup engine↔engine.extra input-equivalence/recovery tests and backend↔backend.extra mastery
  rounding tests.
- `hardening.test.ts` is misnamed (3/5 tests are `LocalBackend` cache, 1 is engine balance ids,
  1 is shared id-gen). Rename/redistribute to the relevant suites.
- Add shared factories to `tests/helpers/`: `makeCompletedProgress`, `makeLessonScore`, and a
  `runLessonStructureTests`/`runHintEscalationTests` harness — ~40–50% of lesson-test LOC is
  repeated structural/escalation boilerplate.

### 4.3 Fill real coverage gaps (do these first)
- **MCQ checking is untested *and* mislocated:** the logic lives inline in
  `MultipleChoiceStep.tsx` (38–63), not in `engine/checkers.ts`. **Extract `checkMcqStep` into the
  engine** (matching the other 9 checkers) and unit-test it. This both fixes an architecture
  inconsistency and closes a coverage hole.
- Add direct unit tests for `equationLatex.ts` (LaTeX + aria conversions), `plotGeometry.ts`
  (grid math used by 3 components), the untested `balanceHelpers` exports
  (`reconstructSolvedBalanceState`, `formatSide`, `describeMove`, …), the `courseHelpers` UI
  helpers (label/score/path-status formatters), `engine/graph.getPathLessonIds`, and
  `backend/validation` normalizers.

### 4.4 Make CI actually type-check tests (also Phase 6)
- CI runs `npm test` (esbuild, **no type-check**). `tsconfig.test.json` typecheck only runs via
  the unused `test:ci` script. Switch CI to `npm run test:ci` (or add a typecheck step).

---

## Phase 5 — Docs consolidation & accuracy (medium impact, very low risk)

The docs have drifted from the code, with the same facts repeated across many files. Per-file
verdicts:

| File | Verdict | Why |
|------|---------|-----|
| `README.md` | **UPDATE** | Says lessons 4–6 are "shells" (all six are authored); describes `App.tsx` as the monolith (it's a ~35-line shell — UI is in `src/app/LearningApp.tsx`); omits KaTeX/`MathText`, the post-refactor module layout, the branching lesson DAG, CI commands, and the Node pin. |
| `statereport.md` | **REMOVE** | Stale generated audit (see 0.2). |
| `BACKEND_ADAPTERS.md` | **UPDATE** | Self-contradicts on local passwords (lines 18–44 vs 50); wrong `AuthScreen` path; says "EWMA mastery" but code uses cumulative `correct/attempts`. |
| `SECURITY.md` | **UPDATE** | Claims passwordless local mode; code hashes/verifies local passwords. Keep the disclosure template. |
| `PHASE1_QA_CHECKLIST.md` | **UPDATE or archive** | Local-auth steps obsolete; otherwise a useful manual-QA template. |
| `Brilliant Practice PRD.md` | **KEEP** (update milestones) | Authoritative spec; checkboxes lag reality. |
| `Brilliant Backend BrainLift.md` | **KEEP** | External research reference. |

### 5.1 Fix the cross-doc auth drift (highest-priority doc fix)
- `AuthScreen.tsx` requires passwords for **both** providers, but `SECURITY.md`,
  `PHASE1_QA_CHECKLIST.md`, `.env.example`, and part of `BACKEND_ADAPTERS.md` still describe
  passwordless local mode. Update all four to match the code in one pass.

### 5.2 De-duplicate setup instructions
- `npm install`/dev, the local-vs-Firebase switch, the Firebase Console + `.env.local` steps, and
  fail-closed behavior are repeated across README/BACKEND_ADAPTERS/SECURITY/PHASE1/`.env.example`.
  Make README the single source for setup; have the others link to it.
- Optionally move PRD + BrainLift under `docs/`.

---

## Phase 6 — App-shell & CI hardening (low–med impact)

### 6.1 Extract hooks from `LearningApp.tsx` (361 lines)
- It owns ~9 `useState`s plus session loading, step completion (mastery + attempt + progress
  writes), launch/retake, and view routing. Extract `useLearnerSession(backend)` (auth + initial
  load + refresh) and `useLessonFlow(backend, user)` (launch/retake/completeStep), leaving the
  component as view orchestration. Improves testability; behavior unchanged.

### 6.2 Unify the two confetti implementations
- `celebrationParticles.ts` (seeded `mulberry32` PRNG → `MasterySparkles`) and
  `CompleteScreen.tsx`'s hardcoded `CELEBRATION_PIECES` array + `.score-celebrate` CSS are two
  separate confetti systems. Consolidate on the deterministic generator (also lets the celebration
  colors use the Phase 3 tokens instead of inline hexes).

### 6.3 Wire the Node-24.17 deploy workaround (or document it)
- `scripts/node24-keepalive-fix.cjs` works around a `firebase deploy` regression on Node 24.17.0,
  but the `deploy` npm script doesn't reference it. Either add
  `NODE_OPTIONS="--require ./scripts/node24-keepalive-fix.cjs"` to the script or document when
  it's needed. (Repo pins 24.16.0, so this is latent.)

### 6.4 CI type-checks tests
- See 4.4 — switch CI to `npm run test:ci`.

---

## Sequencing & dependencies

```
Phase 1 (build fix) ──┐                       ← do first; highest ROI, isolated
Phase 0 (dead code) ──┤
Phase 4.3 (coverage) ─┼─→ Phase 2 (UI dedup) ─→ Phase 2.7 (component splits)
Phase 4.1/4.2 (tests) ┘            │
                                   └─→ Phase 3 (CSS tokens, parallel-safe)
Phase 5 (docs) ── independent, any time
Phase 6 ── after Phase 2 (6.1) / Phase 3 (6.2)
```

- **Land Phase 4.3 (esp. extracting/ testing `checkMcqStep`, `plotGeometry`, `balanceHelpers`)
  before Phase 2** so the drag/grid/feedback dedup is regression-protected.
- Phases 3 (CSS) and 5 (docs) are independent and can proceed in parallel with code work.

## Risks & mitigations

- **UI dedup regressions (Phase 2):** the interactive views are the least test-covered area.
  Mitigate by (a) adding the Phase 4.3 unit tests first, (b) refactoring one view at a time
  behind the new hooks, (c) manual drag + keyboard QA per view, ideally captured as a short
  screen recording.
- **CSS visual drift (Phase 3):** tokenization should be pixel-identical; verify with
  before/after screenshots of each screen. Watch the brittle `nth-child`/`nth-of-type` staggers.
- **Bundle change (Phase 1):** confirm via build output that the local entry no longer pulls a
  `firebase/*` chunk and that Firebase mode still lazy-loads correctly.
- **Test reshuffle (Phase 4):** keep total assertions ≥ current; the `build-tests.mjs` glob
  (`dist-tests/tests/**/*.test.js`) already picks up new files automatically.

## Definition of done (per phase)

- `npm run lint`, `npm run typecheck`, and `npm test` stay green (test count must not drop).
- `npm run build` succeeds; Phase 1 additionally removes the >500 KB eager-vendor warning.
- No behavior changes except those explicitly noted (NumericInput resume; MCQ checker relocation;
  confetti unification).
- Each phase is a focused PR with a short before/after note (and screenshots for UI/CSS).

---

### Appendix — what was reviewed and deliberately left alone

- **Barrels** (`domain.ts`, `engine.ts`, `backend.ts`) and **`*Core` splits**
  (`firebaseConfigCore`, `firebaseBackendCore`) — intentional, documented, aid testability/parallel
  edits. **Keep.**
- **Pure engine modules** (`engine/checkers|progress|graph|recommendations|balance`) — cohesive,
  well-commented, well-tested. `checkers.ts` (475) is long but is one-pure-checker-per-type;
  splitting is optional and low priority.
- **`content/types.ts` (384)** and **per-lesson content files** — mostly declarative data with
  intent-revealing comments. No action needed beyond the `checkMcqStep` extraction.
- Comments throughout largely explain *why*, not *what* — not "AI slop." The few that restate code
  (e.g. a handful in `BalanceStepView`/`BalancePans`) can be trimmed opportunistically during
  Phase 2.
