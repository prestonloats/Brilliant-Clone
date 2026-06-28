# Learning Science in Story Mode (Phase 3)

Story Mode is the app's **practice surface**. Where the authored lessons (Phase 1) teach a concept
once, Story Mode is an endless, AI-themed loop whose job is to make the learning **stick**. Phase 3
layers evidence-based techniques on top of that loop — implemented for real against a persisted,
per-skill model, not as cosmetic labels.

This document explains what was applied, *why* (the science), *how* (the code), and *how it shows up*
for the learner. It is the reference companion to `STORY_MODE_IMPLEMENTATION_PLAN.md`.

---

## 1. Techniques at a glance

| Technique | Research basis | Where it lives | Learner-visible effect |
|---|---|---|---|
| **Retrieval practice** | Roediger & Karpicke (2006), the "testing effect" | `recordPracticeAttempt` in `src/story/useStorySession.ts`; `StoryQuestionScreen` | Every question is active recall and is *scored on the first try* |
| **Spaced repetition** | Ebbinghaus forgetting curve; Cepeda et al. (2006) spacing effect; SM-2 | `src/engine/practice/scheduler.ts` + due-first in `selectArchitecture.ts` | Concepts return at growing intervals; missed ones come back fast |
| **Interleaving** | Rohrer & Taylor (2007); Kornell & Bjork (2008) | `selectNextArchitecture` (hard no-repeat-skill) | A session mixes problem types instead of blocking one |
| **Mastery learning** | Bloom (1968), "Learning for Mastery" | `src/engine/practice/mastery.ts` + `masteryPrereqs` gating | Harder skills stay locked until prerequisites are genuinely mastered |
| **Immediate explanatory feedback** | Hattie & Timperley (2007); Shute (2008) | `src/engine/checkers.ts` (from Phase 1), surfaced in Story Mode | Wrong answers get hint → explanation → reveal |
| **Measurement** | — | `src/engine/practice/insights.ts` + `PracticeInsightsPanel` | Mastery meters + a "did it stick?" retention metric |

> **Desirable difficulty** (Bjork) and **scaffolding/fading** are intentionally *not* in this cut —
> see [§10 Limitations & future work](#10-limitations--future-work).

---

## 2. Design principles

These constraints shaped every decision below.

1. **A dedicated, separate practice store.** Spaced repetition and mastery are inherently
   cross-session and time-based, so the learning state must persist per user. It is kept **separate**
   from the lesson `SkillMastery` ratio (a naive cumulative `correct/attempts` with no decay) so the
   new model never corrupts lesson grading.
2. **Narrowed "pure-review" invariant.** Story Mode still **never writes `LessonProgress` or lesson
   mastery** — lesson unlocks and grades are unaffected. It *does* write the new `practice` store and
   `source:'story'` attempt events. This is documented at the top of `src/story/useStorySession.ts`.
3. **Grading stays code-authoritative.** The LLM only re-skins display text; answer keys are always
   computed in code (`src/engine/storyMode/questionBank/`). Learning-science changes never touch the
   grading path.
4. **Pure logic, thin React seam.** All the science is pure, deterministic, unit-tested TypeScript in
   `src/engine/practice/*`; `useStorySession` is the only React glue. Time is always injectable
   (`now` / `outcome.at`) so behavior is testable and resume-safe.

---

## 3. The practice-state model

One record per user per skill is the source of truth for retrieval strength, scheduling, and mastery.

```ts
// src/domain.ts
export type SkillPracticeState = {
  userId: string
  skillId: SkillId
  proficiency: number    // 0..1 EWMA of FIRST-TRY recall success (the retrieval-strength signal)
  streak: number         // consecutive first-try corrects; resets to 0 on any miss
  intervalDays: number   // current spaced-repetition interval
  ease: number           // SM-2 ease factor (1.3 .. 3.0)
  dueAt: string          // ISO; selection prefers due/overdue skills
  lapses: number         // times a scheduled item was missed (interval reset)
  totalAttempts: number  // lifetime retrievals (for insights)
  firstTryCorrect: number
  lastSeenAt: string
  updatedAt: string
}
```

A single pure function advances it by one practiced question, composing the mastery update and the
reschedule so both backends and the tests share one implementation:

```ts
// src/engine/practice/applyOutcome.ts
applyPracticeOutcome(state, { firstTryCorrect, at }) // -> next SkillPracticeState
```

---

## 4. The techniques, in detail

### 4.1 Retrieval practice

**Science.** Recalling information from memory (rather than re-reading it) is one of the most robust
ways to strengthen durable memory — the *testing effect* (Roediger & Karpicke, 2006).

**Implementation.**
- The question bank is already recall-first: 5 of 6 architectures are free-response `input` and one
  is `sequence` ordering — **zero** multiple-choice recognition.
- The retrieval *outcome*, previously discarded, is now captured. `StoryQuestionScreen` forwards each
  graded submit to the controller, which records **only the first attempt per question** — first-try
  correctness is the true retrieval-strength signal, so a multi-try question counts as one retrieval,
  not several misses:

```ts
// src/story/useStorySession.ts — recordPracticeAttempt (abridged)
const signature = `${session.id}:${questionKey(question)}:${session.questionsSolvedTotal}`
if (lastRecordedQuestionRef.current === signature) return   // first attempt only
// ...writes practice state + a source:'story' AttemptEvent with answer latency
```

**Learner effect.** Every prompt pulls the idea out of memory; the system quietly learns how strong
that recall is and uses it everywhere below.

### 4.2 Spaced repetition

**Science.** Memory decays predictably (Ebbinghaus); restudying at *expanding* intervals beats
massed practice (the spacing effect, Cepeda et al. 2006). Items answered wrong should return sooner.

**Implementation.** An SM-2-lite scheduler in `src/engine/practice/scheduler.ts`:
- **Correct first try →** grow the interval up a ladder (`0 → 1 day → 3 days → interval × ease`) and
  nudge `ease` up.
- **Miss →** reset the interval, shrink `ease`, and make the skill due again in **~30 minutes**
  (`LAPSE_INTERVAL_DAYS = 0.02`) so a wrong answer resurfaces within the session.
- `isDue(state, now)` and `overdueScore(state, now)` let selection prefer and rank due work.

The selector (`selectNextArchitecture`) then does **due-first** selection: it narrows to due / never-
practiced skills whenever any exist (never emptying the pool), and the more overdue a skill is, the
more it is boosted (capped by `OVERDUE_BOOST_CAP = 3`).

**Learner effect.** Concepts reappear at growing gaps once solid; a concept you just missed comes
back quickly — but **not immediately next** (that would be cramming; interleaving spaces the retry).

### 4.3 Interleaving

**Science.** Mixing problem types within a session ("interleaving") forces the learner to *choose*
the right approach, not just repeat the last one, and improves discrimination and transfer
(Rohrer & Taylor, 2007).

**Implementation.** Upgraded from the old soft down-weight to a **hard rule** in
`selectNextArchitecture`: never serve the same skill as the immediately previous question when a
different skill is available. It self-relaxes when only one skill is unlocked (so the loop never
stalls), and a soft `SAME_SKILL_MULTIPLIER = 0.6` remains as a backstop for that relaxed case.

```ts
// src/engine/storyMode/questionBank/selectArchitecture.ts (step 3)
if (previousSkillId !== undefined) {
  const differentSkill = candidates.filter((a) => a.skillId !== previousSkillId)
  if (differentSkill.length > 0) candidates = differentSkill
}
```

**Learner effect.** Back-to-back questions train different skills whenever possible.

### 4.4 Mastery learning

**Science.** Bloom's mastery learning (1968): require demonstrated mastery of a concept before
advancing, rather than moving on by time/coverage.

**Implementation.**
- A clear, recency-weighted mastery signal in `src/engine/practice/mastery.ts`:
  `isSkillMastered = proficiency ≥ 0.9 AND streak ≥ 5`. Requiring both a high estimate **and** a
  streak means one lucky answer can't flip mastery.
- **Tier-unlock gating.** Harder architectures declare prerequisites that must be *practice-mastered*
  (on top of lesson completion):

  | Architecture | Skill | `masteryPrereqs` |
  |---|---|---|
  | `balance-equality` | equality | — (entry tier) |
  | `inverse-operation` | inverse-operations | — (entry tier) |
  | `one-step-linear`, `one-step-sequence` | one-step-equations | — (entry tier) |
  | `coordinate-walk` | coordinate-plane | — (entry tier) |
  | `combine-like-terms` | like-terms | — (entry tier) |
  | `two-step-linear` | two-step-equations | `one-step-equations` |
  | `variables-both-sides` | variables-on-both-sides | `two-step-equations` |
  | `line-value` | graphing-lines | `coordinate-plane` |

  `selectNextArchitecture` filters out architectures whose prerequisites aren't mastered yet (with a
  defensive fallback so an entry tier is always available).

**Full coverage.** The question bank exercises **all 8 skills** taught by the lessons — including
`balancing-equations`' equality (`balance-equality`) and inverse-operations (`inverse-operation`), and
the like-terms half of the Like Terms lesson (`combine-like-terms`) — so every subject learned in a
lesson is practiced in Story Mode.

**Learner effect.** A clear per-skill mastery state, and a real gate: you can't practice two-step
equations in Story Mode until you've actually mastered one-step.

### 4.5 Immediate, explanatory feedback (from Phase 1, retained)

Wrong answers escalate **hint → explanation → reveal** by attempt number in `src/engine/checkers.ts`,
and each generated question carries code-authored `feedback.correct/incorrect/reveal`. Story Mode
surfaces this unchanged. (Sharpening these explanations further is future work — §10.)

---

## 5. The selection pipeline

`selectNextArchitecture` (`src/engine/storyMode/questionBank/selectArchitecture.ts`) composes the
techniques into one pure, deterministic-given-`rng` function. Order matters:

1. **Lesson gate** — only architectures whose `requiredLessonId` is completed.
2. **Mastery gate** (§4.4) — drop architectures whose `masteryPrereqs` aren't mastered.
3. **Anti-repeat window** — avoid recently served items (and the on-screen one).
4. **Interleaving** (§4.3) — drop the previous skill when another is available.
5. **Due-first** (§4.2) — narrow to due / never-practiced skills when any exist.
6. **Weighted random pick** — final weights combine:
   - struggle ×2 / mastered ×0.75 — using **practice proficiency** when present, else lesson mastery;
   - overdue boost `1 + min(overdueScore, 3)`;
   - recent-miss ×1.5; same-skill ×0.6 (relaxed-case backstop).

Every narrowing step self-relaxes rather than emptying the pool, so the endless loop never stalls.

---

## 6. Measuring the effect

"Pick a few, do them well, and measure or show their effect." Measurement lives in
`src/engine/practice/insights.ts` (pure) and surfaces in `src/story/PracticeInsightsPanel.tsx` as a
"Learning analytics" section on the Profile page.

- **Mastery meters** — `summarizePractice` rolls states into per-skill levels
  (`learning` / `practiced` / `mastered`) with **mastery-progress bars**, plus headline `mastered`
  and `due` counts. Each bar uses `masteryProgress` (a 0..1 value that reaches 100% EXACTLY when the
  skill is mastered — i.e. proficiency ≥ 0.9 AND a first-try streak ≥ 5), so a full bar can never
  disagree with the gold "Mastered" badge.
- **Retention lift — the headline "did it stick?" metric** — `computeRetention` compares **first-try
  accuracy and latency on the first exposure of a skill vs. its later, spaced re-exposures** (using
  only `source:'story'` attempts). Rising accuracy / falling latency across growing intervals is the
  evidence that spacing + retrieval are working. Skills with only one exposure are excluded (no
  signal yet).
- **Telemetry substrate** — each story retrieval is an append-only `AttemptEvent` tagged
  `source:'story'`, carrying `correct`, `attemptCount`, `msToAnswer`, and a timestamp, so cohort/
  before-after analysis is possible later without schema changes.

---

## 7. Persistence & data flow

```
StoryQuestionScreen.onAttempt(correct)
  └─ useStorySession.recordPracticeAttempt           (first attempt per question only)
       ├─ backend.practice.updatePractice(uid, skill, { firstTryCorrect })
       │     └─ applyPracticeOutcome(existing, outcome)   (shared pure update)
       ├─ backend.attempts.recordAttempt(source:'story', stepId: arch:<id>, msToAnswer)
       └─ onLearnerDataChanged()  →  app re-reads practice + attempts  →  next selection adapts
```

- **Contract:** `PracticeRepository` on `Backend` (`src/backend/types.ts`).
- **Local:** `practice` map (`${userId}:${skillId}`) in `LocalBackend`, normalized in
  `src/backend/validation.ts` (`isSkillPracticeState`); malformed entries are dropped on read.
- **Firebase:** `practice/{uid}/skills/{skillId}`, transactional update mirroring mastery; secured by
  an owner + verified-email rule in `firestore.rules`.
- **`AttemptEvent.source`** is additive/optional — legacy and lesson attempts omit it and are treated
  as `'lesson'`, so nothing about existing data changes.

---

## 8. Parameters reference (tuning)

All constants are centralized in the pure modules so they're easy to tune.

| Constant | Value | Meaning | File |
|---|---|---|---|
| `PROFICIENCY_ALPHA` | `0.4` | EWMA weight on the newest retrieval | `practice/mastery.ts` |
| `PRACTICE_MASTERY_THRESHOLD` | `0.9` | proficiency needed for mastery | `practice/mastery.ts` |
| `PRACTICE_MASTERY_STREAK` | `5` | consecutive first-try corrects for mastery | `practice/mastery.ts` |
| `PRACTICE_PRACTICED_THRESHOLD` | `0.5` | proficiency for the mid "practiced" level | `practice/mastery.ts` |
| `INITIAL_EASE` | `2.5` | starting ease for a new skill | `practice/mastery.ts` |
| `FIRST_INTERVAL_DAYS` / `SECOND_INTERVAL_DAYS` | `1` / `3` | first two interval rungs | `practice/scheduler.ts` |
| `LAPSE_INTERVAL_DAYS` | `0.02` (~30 min) | how soon a missed item returns | `practice/scheduler.ts` |
| `MIN_EASE` / `MAX_EASE` | `1.3` / `3.0` | ease clamp | `practice/scheduler.ts` |
| `STRUGGLE` / `MASTERED` mult. | `2` / `0.75` | weak skills surface more, mastered less | `selectArchitecture.ts` |
| `RECENT_MISS_MULTIPLIER` | `1.5` | boost a just-missed architecture | `selectArchitecture.ts` |
| `SAME_SKILL_MULTIPLIER` | `0.6` | interleaving backstop (relaxed case) | `selectArchitecture.ts` |
| `OVERDUE_BOOST_CAP` | `3` | cap on the spaced-repetition overdue boost | `selectArchitecture.ts` |

---

## 9. Tests

The learning-science logic is pure and covered by `node --test` (run `npm test`):

- `tests/practice-state.test.ts` — proficiency EWMA, mastery flip, schedule grow/lapse, due/overdue,
  determinism of `applyPracticeOutcome`.
- `tests/practice-backend.test.ts` — Local practice repo seed/advance, per-user isolation, reload
  normalization, malformed-entry handling.
- `tests/story-practice-selection.test.ts` — due-first, overdue boost, proficiency-supersedes-mastery,
  and mastery-gate tier unlock.
- `tests/practice-insights.test.ts` — mastery summary roll-up and the retention metric.
- `tests/story-select-architecture.test.ts` — updated for hard interleaving + the mastery gate.

Full pipeline is green: `npm run typecheck`, `npm test` (794 tests), `npm run lint`, `npm run build`.

---

## 10. Limitations & future work

- **Strict mastery gate.** Gating is a hard lock (a harder skill is unavailable until its prerequisite
  is mastered). If a softer *bias* is preferred, it is a one-line change in `selectArchitecture.ts`
  (treat prereqs as a weight instead of a filter).
- **Scaffolding & desirable difficulty (not yet built).** The plan is to extend
  `QuestionArchitecture.generate(rng, difficulty)`, drive difficulty from proficiency toward a
  ~80–85% success band, and fade upfront hints as proficiency rises. The `paramSeed` mechanism is
  already in place to keep this deterministic/resume-safe.
- **Sharper explanatory feedback (not yet built).** Enrich the code-built `feedback` per architecture
  with the worked next step and misconception-specific messages (kept out of the re-theme path so it
  can never corrupt the key).
- **Real-day spacing.** Intervals are honored by wall-clock time; the offline metric measures
  re-exposures within available data. A multi-day cohort study would strengthen the retention claim.

---

## 11. References

- Roediger, H. L., & Karpicke, J. D. (2006). *Test-enhanced learning.* — retrieval practice.
- Cepeda, N. J., et al. (2006). *Distributed practice in verbal recall tasks: A review and quantitative synthesis.* — spacing.
- Ebbinghaus, H. (1885). *Memory: A Contribution to Experimental Psychology.* — forgetting curve.
- Rohrer, D., & Taylor, K. (2007). *The shuffling of mathematics problems improves learning.* — interleaving.
- Kornell, N., & Bjork, R. A. (2008). *Learning concepts and categories: Is spacing the "enemy of induction"?*
- Bloom, B. S. (1968). *Learning for Mastery.* — mastery learning.
- Bjork, R. A. (1994). *Memory and metamemory considerations in the training of human beings.* — desirable difficulties.
- Hattie, J., & Timperley, H. (2007). *The power of feedback.*
- Wozniak, P. (1990). *SuperMemo (SM-2) algorithm.* — the scheduler's basis.
