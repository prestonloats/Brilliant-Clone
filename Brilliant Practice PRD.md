# Brilliant Clone PRD — Algebra (codename: Balance)

Author: Preston Loats · Status: Draft · Last updated: 2026-06-22

> **Subject (the one decision everything hangs on): Algebra.**
> The entire platform is built to teach one subject deeply, through hands-on
> interaction, for one persona. We are not building a wide catalog. We are
> building the five-or-six lessons that take a learner from "why are there
> letters in math?" to confidently solving and graphing linear equations — and
> we make each one *click* by letting the learner touch it, get it wrong, and
> figure it out.

## Summary

We are building a **learn-by-doing algebra app** modeled on Brilliant: instead of
handing the learner a video and a quiz, every lesson drops them into an
interactive problem, lets them poke at it, gives instant and specific feedback,
and only then names the idea behind it. The product, **Balance**, teaches a
single coherent path — **Algebra Foundations** — anchored by a flagship
interaction: a **balance scale** the learner manipulates to discover what an
equation really means and how to solve one. Weights, hidden "unknown" boxes, and
operations are draggable and tappable; the scale tips and levels in real time as
the learner acts, so the rule "whatever you do to one side, do to the other"
is *felt*, not memorized.

The heart of the product is the **interactive lesson** plus a **mastery-aware
path**: the app tracks what each learner has mastered per concept, unlocks and
recommends the next step, and repairs gaps before they grow. Creation of content
is authored by us (no AI in the MVP) against a structured **content model** — a
lesson is an ordered sequence of typed, interactive steps, not a blob of HTML —
which is what lets us add lessons fast and, later, lets AI generate them.
Progress and mastery persist across sessions and devices, and the whole
experience is built mobile-first, because that is where a teenager actually
learns. Once that core stands on its own, the first AI layer — **Story Mode**,
an endless, interest-themed review wrapped in a choose-your-own-adventure
narrative — builds directly on the same content model and client-side checker.
It is **pure review** (it never touches mastery or course progress), unlocks
after the first two lessons, and runs on a **free LLM** (the Google Gemini
Developer API free tier) that works in local development first (Phase 2; see
Milestones).

## Problem

A learner first meeting algebra (roughly grades 7–9) hits a wall the moment math
stops being arithmetic and starts using letters. Symbol manipulation —
"subtract 4 from both sides," "move the term across and flip the sign" — feels
arbitrary and rule-bound. Textbooks and lecture videos *explain* the rules, but
explanation is passive: the learner watches someone else do it, nods, and then
freezes on a blank problem because the idea never became theirs. The standard
edtech response, "watch this video, now take this multiple-choice quiz," tests
recall of a procedure the learner never internalized, and a bare red **✗** on a
wrong answer teaches nothing about *why* it was wrong.

The unmet need is **active, hands-on understanding**: a way to manipulate an
equation directly, see the consequence of each move, and recover from mistakes
with specific guidance — until the abstract rule becomes obvious. Algebra is an
ideal subject for this because every core idea has a physical analog (a balance
scale), a spatial one (a coordinate grid), or a manipulable one (term tiles you
drag). The problem we solve is the gap between "I can follow along when someone
explains it" and "I can do it myself and know *why* it works."

## Goals

- **Learn-by-doing core** — Every lesson is a short sequence of interactive
  problems with instant, specific feedback. No video player. No wall of text.
- **One subject, deep** — A coherent **Algebra Foundations** course whose lessons
  build on each other, taking a learner from the meaning of `=` to graphing a
  line. Depth over breadth is the explicit bar.
- **Touch-the-idea interaction** — At least one rich, directly-manipulated
  problem type per concept (drag, tap, slider, plot), with a visual that
  responds in real time, so the interaction *teaches* the idea rather than
  decorating it.
- **Mastery-aware path** — Track per-skill mastery; unlock, recommend, and
  *repair* the next step. The path should feel like it knows where the learner is.
- **Persistence everywhere** — Progress and history survive across
  sessions and devices; leave mid-lesson, return on a phone, continue.

## Non-Goals

- **No AI in the MVP (hard gate).** No model calls, no generated content, no
  chatbot tutor. The core learn-by-doing experience must stand on its own and be
  built by hand. AI is Phase 2, layered on top — see Milestones.
- **No second subject.** Algebra only. We will not add geometry, probability, or
  a wide subject menu. Breadth is explicitly out of scope.
- **No passive video lessons.** We are deliberately not building a video player
  or transcript-driven content; that is the opposite of the product thesis.
- **No social features.** No comments, friend graph, public leaderboards, or
  sharing in v1. (Implicit-signal-driven adaptivity, not social signals, drives
  the path — a deliberate design constraint from day one, not an afterthought.)
- **No streaks or daily-habit mechanics.** Streaks, daily goals / daily-progress
  loops, XP, and milestone/achievement gamification are out of scope for this
  version. The focus is the core learn-by-doing experience and mastery, not
  retention mechanics; these may be revisited in a later version.
- **No learner-authored content / authoring UI.** Lessons are authored by the
  team directly against the content model (typed JSON), not through an in-app
  editor.
- **No monetization** — no ads, subscriptions, or payments in this version.

## User Stories

Primary persona — **Maya, 13, 8th grade**, just starting algebra, finds the
textbook abstract and intimidating, learns on her phone in short bursts.
(Secondary: an adult relearning the basics; the design serves both, but every
decision is made for Maya first.)

- As a student who finds algebra abstract, I want to *do* something with an
  equation instead of watching a lecture, so the idea clicks on its own.
- As a learner, I want to drag weights onto a balance scale and watch it tip and
  level, so I can *see* why both sides must stay equal.
- As someone who gets stuck, I want a specific hint when I'm wrong — not just
  "incorrect" — so I can recover and figure it out myself.
- As a busy student, I want to stop mid-lesson and pick up exactly where I left
  off later on my phone, so I never lose progress.
- As a learner who finished a lesson, I want the app to recommend a sensible next
  step, so I always know what to do next without choosing from a giant menu.
- As a learner who keeps missing one idea, I want the app to give me an easier
  review before pushing on, so my gaps don't pile up and sink me later.
- As a learner who has finished the first couple of lessons, I want to keep
  practicing inside a story themed to things I like — space, soccer, dragons — so
  reviewing old material feels like play instead of a worksheet. *(Story Mode · Phase 2)*
- As a learner at a story checkpoint, I want to type what my character does next
  and have the story respond, so I stay invested enough to keep practicing.
  *(Story Mode · Phase 2)*

## Requirements

Priorities: **P0** = required for the MVP gate (Wednesday), **P1** = MVP if time
allows / fast-follow, **P2** = later phase.

### Functional Requirements

**Accounts & Auth**

| ID | Requirement | Priority |
| --- | --- | --- |
| R1 | Users can create an account with email + password and a **display name** (the name shown on their profile and progress). | P0 |
| R2 | Users stay logged in across sessions (persistent auth); a returning learner lands back in their course. | P0 |
| R3 | Users can log out. | P1 |
| R4 | Each account has a basic profile (display name, optional avatar) surfaced on a profile/progress screen. | P1 |
| R5 | Password reset / account recovery. | P2 |

**Content Model & Lessons**

| ID | Requirement | Priority |
| --- | --- | --- |
| R6 | A lesson is defined by a **structured content model**: an ordered sequence of typed steps (`concept`, interactive `problem`, `feedback`), not a blob of HTML. This is what lets us add lessons fast and later lets AI generate them. | P0 |
| R7 | At least **one fully built interactive lesson** on a real algebra concept — **"Balancing Equations: what `=` really means"** — built around hands-on problems, not a video or a wall of text. | P0 |
| R8 | The frontend renders any lesson purely from its content model, captures the learner's interaction on each step, and drives feedback from the model. | P0 |
| R9 | **Authored, specific feedback** for every step — for the correct answer *and* for common wrong answers — written by us (no generation in MVP). A wrong answer gets a hint or explanation, never a bare red ✗. | P0 |
| R10 | Lessons are grouped into a **course with an ordered path** through algebra (Algebra Foundations); the path defines prerequisites between lessons. | P0 |
| R11 | Multiple-choice problem type with **per-option** feedback (each distractor maps to a specific misconception message). | P1 |
| R12 | New lessons can be added by writing content (typed JSON against the schema), not by writing new components, for the supported step types. | P2 |

**Interactive Problem Types (the hands-on core)**

| ID | Requirement | Priority |
| --- | --- | --- |
| R13 | A rich, **directly-manipulated** problem type fit to algebra: a **balance scale** the learner drags weights/unknown-boxes onto and applies operations to, keeping (or breaking) the balance. This is the flagship interaction. | P0 |
| R14 | **Drag-terms**: drag algebra term tiles across the `=` sign (with automatic sign change) or into "like-term" bins to combine them. | P1 |
| R15 | **Interactive coordinate grid**: tap or drag to plot points and lines. | P1 |
| R16 | **Sliders** that drive a live graph — adjust slope `m` and intercept `b` and watch the line respond in real time. | P1 |
| R17 | **Tap-to-build / reorder**: assemble or order the steps of a solution. | P2 |
| R18 | **Numeric / expression input** with equivalence checking (e.g. accept `x = 3`, `3`, `6/2`). | P1 |

**Visual & Hands-On**

| ID | Requirement | Priority |
| --- | --- | --- |
| R19 | Every concept has an **interactive visual that responds in real time** — the scale tips/levels as weights change; the line redraws as sliders move. | P0 |
| R20 | Visuals **animate** state changes (a weight added visibly tips the scale; the line sweeps as slope changes) so cause and effect are legible. | P1 |
| R21 | The learner can **freely experiment** with the visual (a sandbox mode) and observe outcomes, not only answer the posed question. | P2 |

**Feedback**

| ID | Requirement | Priority |
| --- | --- | --- |
| R22 | **Instant feedback on every answer**, right or wrong, with a short authored explanation of *why*. | P0 |
| R23 | Wrong answers **escalate**: first a targeted hint, then a worked explanation, then a reveal — never a dead end. | P1 |
| R24 | Feedback is computed **client-side** so it appears in **under 100ms** — no model call, no server round-trip for answer checking. | P0 |

**Progress, Path & Mastery**

| ID | Requirement | Priority |
| --- | --- | --- |
| R25 | **Progress persists**: a learner can leave mid-lesson and resume at the **exact step**, across sessions and devices. | P0 |
| R26 | **Per-skill mastery tracking**: record what was attempted, what was correct, and a mastery estimate per concept/skill. | P0 |
| R27 | The path **unlocks/recommends the next lesson or step** based on mastery and prerequisites (rule-based in the MVP — no AI). | P0 |
| R28 | When a learner **repeatedly misses** a skill, surface a review or an easier step before advancing. | P1 |
| R29 | Capture **per-attempt signals** (step id, correct/incorrect, attempt count, time-to-answer) to feed mastery now and adaptivity later. | P1 |
| R30 | On finishing a lesson, the learner sees a **sensible recommended next step** in the course. | P0 |

**Story Mode (Phase 2 · AI)**

| ID | Requirement | Priority |
| --- | --- | --- |
| R31 | **Interest selection**: on entering Story Mode the learner picks (and can later edit) a few interests from a curated list and/or free text, used to theme the story and the problems. | P2 |
| R32 | **LLM integration** for Story Mode uses a **free LLM** — the Google Gemini Developer API free tier (e.g. `gemini-flash-latest`); **no Blaze/Vertex billing** is required for v1. It is **local-first**: in local dev the client calls Gemini directly with a gitignored key (`VITE_GEMINI_API_KEY`, acceptable for local dev only); at deploy the same call moves behind a thin server proxy / Cloud Function (or Firebase AI Logic + App Check) so the key never reaches the client — the same app-owned adapter either way. It re-themes problems and generates narrative, and **never** checks answers. | P2 |
| R33 | **Next-question selection** draws **only from steps in lessons the learner has already completed**, favoring skills due for review or weakly mastered — a review surface, not new material. | P2 |
| R34 | **LLM re-theming**: only the step's **display text** is rewritten to fit the learner's interests and story; the **answer key stays in the original bundled step** (numbers, structure, answer, and step `type` preserved), yielding a valid content-model `Step` graded by the existing client-side checker. A bad rewrite can never make a wrong answer pass. | P2 |
| R35 | **Story checkpoint**: after every **10** solved questions, present a longer **1–2 paragraph** narrative beat that reflects the learner's interests and prior choices. | P2 |
| R36 | **Choose-your-own-adventure input**: at each checkpoint the learner types, in free text, what they do next, and the LLM continues the narrative from that input. | P2 |
| R37 | **Endless mode**: Story Mode has no fixed end — it keeps generating new themed questions and story segments indefinitely. | P2 |
| R38 | **Story persistence**: interests, the running narrative + learner choices, solved-count, and progress toward the next checkpoint persist across sessions/devices and support pause/resume. | P2 |
| R39 | **Teen-appropriate safety (first-class)**: strict system-prompt constraints (age-appropriate; no violence, sexual, self-harm, hateful, or dangerous content; stay on the educational story), Gemini safety settings set to block harmful categories, learner free-text **sanitized + moderated before** it reaches the model and **filtered on output**, **no personal info collected** from typed input, and a **safe fallback** when content is blocked. The model may not alter a problem's math or reveal its answer. Local v1 relies on model safety settings + prompt constraints + client checks; deployment adds server-side moderation via the proxy/Cloud Function. | P2 |
| R40 | **Unlock gate**: Story Mode unlocks only after the learner completes the **first two lessons** of Algebra Foundations — **Balancing Equations** and **One-Step Equations**. Until then the entry point is shown locked with a prompt to finish them. | P2 |
| R41 | **Pure review (no progress effects)**: Story Mode **never** writes mastery, lesson progress, streaks, or course completion — it persists only its own story state. It may read mastery/attempt signals to choose questions but cannot advance or alter the course path. | P2 |

### Non-Functional Requirements

**Performance**

| ID | Requirement | Priority |
| --- | --- | --- |
| N1 | Time from app open to **first interaction < 2s** on a typical connection (code-split, lazy-loaded, content cached). | P0 |
| N2 | **Answer feedback appears < 100ms** after submit (client-side checking). | P0 |
| N3 | Interactive visuals sustain **60 FPS** while the learner manipulates them (scale drag, slider sweep, line redraw). | P0 |
| N4 | Steps advance instantly; upcoming lesson content is prefetched/cached so there is no per-step load spinner. | P1 |

**Persistence & Sync**

| ID | Requirement | Priority |
| --- | --- | --- |
| N5 | Progress, mastery, and history **survive across sessions and devices**. | P0 |
| N6 | Graceful **offline** behavior: an in-progress lesson keeps working and syncs when connectivity returns. | P1 |

**Mobile & Accessibility**

| ID | Requirement | Priority |
| --- | --- | --- |
| N7 | Works well on **phone-sized screens with touch input**; the core loop is **one-thumb** friendly. | P0 |
| N8 | Large hit targets for drag/tap; respects `prefers-reduced-motion`; sufficient color contrast; answers are not conveyed by color alone. | P1 |

**Scale & Reliability**

| ID | Requirement | Priority |
| --- | --- | --- |
| N9 | Supports **multiple concurrent learners with no slowdown** — answer checking is client-side (no per-answer server load), and the backend scales horizontally. | P0 |
| N10 | Graceful handling of network loss (resume lesson, retry writes); no progress lost on a dropped connection. | P1 |

**Security & Safety**

| ID | Requirement | Priority |
| --- | --- | --- |
| N11 | Security rules enforce **per-user access**: a learner can only read/write their own progress and mastery; lesson content is **read-only** to clients. | P0 |
| N12 | Secure credential storage (hashed + salted, handled by the auth provider) and **encrypted transport (HTTPS/TLS)**. Minimal PII; age-appropriate, COPPA-aware sign-up for the teen audience. | P0 |
| N13 | **Deployed and public** at a stable URL. | P0 |

**AI & Story Mode (Phase 2)**

| ID | Requirement | Priority |
| --- | --- | --- |
| N14 | **Story Mode latency & quota**: LLM-dependent content (a re-themed question, a checkpoint narrative) is generated behind a graceful loading state and prefetched where possible — called directly from the client in local dev, and from the deploy-time proxy / Firebase AI Logic in production. **Free-tier rate/quota limits are a real constraint**: handle `429`/quota-exceeded gracefully (backoff + a friendly fallback to the un-themed question) and never hard-block the learner. The **underlying answer check stays client-side and < 100ms**, since a themed item is still a content-model step. | P2 |
| N15 | **AI content safety (teen audience)**: prompts and model outputs are constrained and filtered for age-appropriate content, Gemini safety settings block harmful categories, free-text input is sanitized and moderated before the model sees it, and no personal info is collected from typed input. A client-embedded model key is used **only** in local dev (gitignored `.env.local`); on deploy the key stays off the client (server proxy / Cloud Function or Firebase AI Logic + App Check) and server-side moderation is added. | P2 |

## Design / Flows

### Screens (inventory)

- **Auth** — Sign up (email + password + display name) / Log in / (P2) reset.
- **Home / Course Map** — the Algebra Foundations path as a vertical sequence of
  lesson nodes (locked / available / completed / mastered), with a prominent
  **"Continue"** that jumps to the exact step where the learner left off.
- **Lesson Player** — renders the content model one step at a time: a concept
  card, an interactive problem (balance scale, plot, slider, drag-terms, MCQ),
  and an inline **feedback panel**. A slim progress bar shows position in the
  lesson.
- **Feedback panel** — appears instantly under the problem: ✓ with a one-line
  "why," or a targeted hint → explanation → reveal for wrong answers.
- **Lesson Complete** — what you learned, mastery changes, and the
  **recommended next step**.
- **Profile / Progress** — display name, avatar, and a per-skill mastery view.
- **Story Mode (P2)** — an **interest picker**; a **themed problem player** that
  reuses the lesson-player components to render LLM-re-themed steps; and a
  **story checkpoint** card showing the 1–2 paragraph narrative beat plus a
  free-text "what do you do next?" input.

### The flagship lesson — "Balancing Equations" (concrete content model)

This lesson exists to prove the thesis: a hard idea (equality + inverse
operations) made obvious by manipulation. Steps:

1. **concept** — "An equation is a balance." Visual: a level scale with `3` on
   each side. The `=` sign means *both sides weigh the same*.
2. **problem · predict (MCQ)** — "If you add a weight of `2` to the left pan,
   what happens?" Options → *tips left / stays level / tips right*. Feedback
   per option; then the scale visibly tips left.
3. **problem · balance (drag)** — "Make it level again: drag the right weight to
   match." Learner drags a `2` onto the right pan; the step checks `level`.
   Feedback: "Adding the same amount to **both** sides keeps it balanced."
4. **concept** — Introduce the **unknown**: a hidden box `x`. Scale shows
   `x + 2` on the left, `5` on the right, level.
5. **problem · input** — "What's inside the box?" Numeric input `x = 3`
   (accepts `3`). Wrong-answer hints, e.g. answer `5` → "That's the *whole*
   right side — but the left pan also has a `2` sitting next to the box."
6. **problem · balance (apply to both sides)** — "Isolate the box: remove `2`
   from **both** sides." Tap `−2 (both sides)`; the scale updates to `x = 3`.
   If the learner removes from one side only, the scale tips: "You only took
   from one side — the scale tipped. Whatever you do to one side, do to the
   other."
7. **problem · balance (new equation)** — Solve `x + 4 = 9` by applying the
   inverse to both sides → `x = 5`, with the same misconception guardrail.
8. **feedback / complete** — "You solved an equation by keeping it balanced.
   Up next: **One-Step Equations (× and ÷)**." Mastery for `equality` and
   `inverse-operations` is updated.

This single lesson satisfies the MVP's hands-on bar: direct manipulation
(R13), a real-time responsive visual (R19/R20), authored right/wrong feedback
(R9/R22), a genuine concept, and a sensible next step (R30).

### Course path — Algebra Foundations (depth, not breadth)

Five-to-six lessons that build on one another:

1. **Balancing Equations** — meaning of `=`; do the same to both sides. *(MVP
   flagship.)*
2. **One-Step Equations** — inverse operations with `+ − × ÷`.
3. **Two-Step Equations** — undo in the right order; reorder-the-steps
   interaction.
4. **Like Terms & Variables on Both Sides** — classify variable terms, combine
   like terms, move x-terms across `=` with the inverse sign, and solve equations
   that have multiple variable terms before the course introduces line graphs.
5. **The Coordinate Plane** — plot points; read/write coordinates.
6. **Graphing Lines (slope–intercept)** — `m` / `b` sliders drive a live line;
   connect equation ↔ graph.

The MVP ships lesson 1 fully and stubs the path so the *next-step recommendation*
and locking/unlocking are demonstrable; lessons 2–6 are the Phase-1-through-3
depth target.

### MVP test scenarios (acceptance)

These are exactly how the MVP will be evaluated; each maps to requirements above.

- A learner completes "Balancing Equations" end to end, **gets some problems
  wrong**, and uses the feedback to recover. *(R7, R9, R22, R23)*
- A learner **manipulates the balance scale** and watches it tip/level in real
  time. *(R13, R19, R20, N3)*
- A learner **leaves mid-lesson and returns** (and on a different device) to find
  progress intact. *(R25, N5)*
- A learner **finishes the lesson and sees a sensible recommended next step.**
  *(R27, R30)*
- The whole thing runs on a **phone-sized screen** with touch. *(N7)*
- Under **multiple concurrent learners**, the deployed app stays responsive.
  *(N9)*

### Story Mode — AI-themed, endless practice (Phase 2)

The first AI feature layered on the working core. **Story Mode** turns review
into a narrative: the learner picks a few **interests**, and the app wraps an
endless stream of practice problems — drawn only from lessons they have already
completed — inside a **choose-your-own-adventure** story themed to those
interests. It brings *retrieval practice* (a Phase 3 goal) forward in a form
that feels like play rather than a worksheet, and gives a learner who has
mastered the path a reason to keep returning. It **unlocks after the first two
lessons** (Balancing Equations and One-Step Equations) and is **pure review** —
it never changes mastery or course progress. Crucially it sits **on top of** the
existing content model and client-side checker: the LLM only *re-themes* a
problem and *narrates* between sets — it never grades answers — so the sub-100ms
answer loop (N2) is untouched. It runs on a **free LLM** (the Gemini Developer
API free tier) and works in local development first.

**Flow:**

1. **Pick interests (onboarding).** On entering Story Mode the learner selects a
   few interests from a curated list (e.g. *space*, *soccer*, *dragons*,
   *cooking*) and/or types their own; these seed the story's setting and the
   flavor of every problem (R31). Interests persist with the run and stay
   editable.
2. **Select the next question (review algorithm).** A client-side selector picks
   the next item **only from steps in lessons the learner has already
   completed** (R33), favoring skills due for review or weakly mastered — reusing
   the same `mastery` and `attempts` signals the MVP already records. Story Mode
   is therefore a *review* surface and never introduces unlearned material.
3. **Re-theme it with the LLM.** Only the selected step's *display text* — names,
   setting, prose — is rewritten to fit the learner's interests and the running
   story, while the **answer key stays in the bundled step** (numbers, structure,
   answer, and step `type` preserved) (R34). In local dev the client calls the
   **free Gemini Developer API directly** (key in a gitignored `.env.local`); at
   deploy the same call moves behind a thin proxy / Cloud Function (or Firebase AI
   Logic + App Check) so the key never ships — the same adapter either way (R32).
   The result is a normal content-model `Step`, so the same renderer and the same
   **client-side checker** evaluate it (N2/N14): a re-skinned `2x + 4 = 10` is
   still checked exactly like an authored one.
4. **Solve, with the usual feedback.** The learner answers with the normal
   interactive components and gets the same instant, specific feedback. Story Mode
   is **pure review**: it does **not** update mastery, lesson progress, streaks, or
   course completion — only its own story state advances (R41).
5. **Story checkpoint every 10 solved (read).** After **10** solved questions
   the LLM advances the narrative with a longer beat — roughly **1–2
   paragraphs** — picking up the learner's interests and earlier choices (R35).
6. **Choose your own adventure (write).** At each checkpoint the learner **types
   what they do next** in free text; the LLM continues the story from that input
   (R36), and the loop returns to step 2 for the next set of ten. The running
   narrative, the choices, and progress toward the next checkpoint all persist
   (R38), so a run pauses and resumes like any lesson (R25).
7. **Endless by design.** There is no fixed ending — questions and story
   segments generate indefinitely (R37). A compact "story so far" summary is
   kept so prompts stay bounded as a run grows long.

**Safety & guardrails (teen-appropriate, first-class).** Everything must be safe
for teens (R39, N15). Prompts carry strict system constraints (age-appropriate;
no violence, sexual, self-harm, hateful, or dangerous content; stay on the
educational story), Gemini **safety settings** block harmful categories, and the
learner's free text is **sanitized and moderated before** it reaches the model and
**filtered on output**; typed interests pass the same checks so a custom interest
cannot smuggle in unsafe themes. **No personal information** is collected from
typed input, and when content is blocked the app shows a **safe fallback** instead
of erroring. The model may never alter a problem's math or reveal its answer.
Local v1 leans on model safety settings + prompt constraints + client checks;
deployment adds **server-side moderation** via the same proxy/Cloud Function.

**Edge cases.** Story Mode stays **locked until the first two lessons** are
complete; those two lessons supply only a **small pool** (~12 re-themable steps),
so the endless loop intentionally reuses them with fresh re-theming until later
lessons widen the pool. An **LLM, network, or free-tier quota failure**
(`429`/quota-exceeded) backs off and falls back to the un-themed authored problem
and a canned narrative beat so practice never blocks; and a skipped checkpoint
simply carries the narrative forward with a neutral default.

## Tech Stack

A client-heavy web app backed by **Google Firebase**, reusing the existing
**React + Vite + Firebase** scaffold already in [`vite/`](./vite). The learner
interacts only with the React frontend; managed Firebase services handle auth,
data, and hosting. A critical architectural choice flows from the performance
bar: **answer checking and visual interaction happen entirely client-side**, so
feedback is sub-100ms (N2), visuals hold 60 FPS (N3), and the backend carries no
per-answer load — which is what lets the app serve many concurrent learners
cheaply (N9).

### Frontend — React + Vite

- React renders the lesson player by **interpreting the content model**: a step
  type maps to a component (`ConceptCard`, `BalanceScale`, `CoordinateGrid`,
  `SliderGraph`, `DragTerms`, `MultipleChoice`, `NumericInput`). Adding a lesson
  = authoring data, not writing components (R6, R12).
- Interactive visuals use **SVG / Canvas with `requestAnimationFrame`** and CSS
  transforms for smooth, GPU-friendly animation of the scale and graphs (N3);
  input uses **Pointer Events** so drag/tap work identically on touch and mouse
  (N7).
- Vite gives code-splitting and lazy-loading so the **course map and first
  lesson load first** (N1); heavier step components load on demand.
- **Answer evaluation is a pure client-side function** over the step's spec
  (`check(answer, step) → { correct, feedbackId }`), guaranteeing < 100ms (N2,
  R24) and full offline play (N6).

### Hosting — Firebase Hosting

- Serves the compiled static assets over a global CDN with automatic HTTPS/TLS
  (covers N12 transport security and the **deployed-and-public** requirement
  N13). Atomic deploys with instant rollback.

### Authentication — Firebase Authentication

- Email + password sign-up/login/logout with persistent sessions (R1–R3), and
  the provider manages secure credential storage/hashing (N12). Sign-up also
  collects a **display name** (R1/R4). `sendPasswordResetEmail` makes reset
  near-free (R5). The authenticated **UID** is the key that ties a learner to
  their progress and mastery.

### Database — Cloud Firestore

The store for lesson content, progress, mastery, and per-attempt
signals. Document-based NoSQL with low-latency reads, **offline persistence**
(N6), and **Security Rules** that enforce per-user access and read-only content
(N11). Proposed data model:

```
courses/{courseId}
  title, subject: "algebra", description
  lessonOrder: [lessonId, ...]          // the path
skills/{skillId}                         // e.g. "equality", "inverse-ops", "slope"
  title, prerequisites: [skillId, ...]
lessons/{lessonId}
  courseId, title, skillIds: [...]
  prerequisites: [lessonId, ...]
  steps: [ Step, ... ]                   // the content model (see below)
users/{uid}
  displayName, email, avatarUrl|null, createdAt
progress/{uid}/lessons/{lessonId}
  status: notStarted|inProgress|completed
  currentStepIndex                       // ← enables exact resume (R25)
  stepResults: { [stepId]: { correct, attempts } }
  startedAt, completedAt, updatedAt
mastery/{uid}/skills/{skillId}
  score (0–1), attempts, correct
  lastPracticedAt                        // (Phase 3: decay / spaced repetition)
attempts/{uid}/events/{eventId}          // implicit signals (R29)
  stepId, lessonId, correct, attemptCount, msToAnswer, at
storyMode/{uid}                          // Phase 2 — Story Mode run state. PURE REVIEW: Story Mode
                                         // writes ONLY here, never to progress/ or mastery/ (R41).
                                         // Local-first dev mirrors this same shape to browser storage.
  interests: [string, ...]               // chosen themes (R31)
  status: active|paused
  solvedCount, sinceCheckpoint           // sinceCheckpoint 0–10 → triggers a beat (R35)
  storySummary                           // compact "story so far" (bounds prompts, R37)
  createdAt, updatedAt
storyMode/{uid}/segments/{segmentId}     // narrative log + learner choices (R36/R38)
  kind: narrative|choice, text, at
storyMode/{uid}/items/{itemId}           // themed questions (cache + history)
  sourceLessonId, sourceStepId           // the completed-lesson step it reuses (R33)
  themedStep                             // LLM-rewritten content-model Step (R34)
  correct|null, at
```

The content model `Step` is a tagged union — concretely:

```ts
type Step =
  | { id; type: "concept"; body; visual? }
  | { id; type: "mcq"; prompt; options: {id; label; feedback}[]; correctId }
  | { id; type: "balance"; prompt; left; right; goal: "level"|"isolate";
      ops?; check; feedback: { correct; hints: {when; text}[] } }
  | { id; type: "plot"; prompt; target; check; feedback }
  | { id; type: "slider"; prompt; vars: {m?; b?}; target; check; feedback }
  | { id; type: "dragTerms"; prompt; terms; bins; check; feedback }
  | { id; type: "input"; prompt; accept: string[]; check; feedback };
```

### Content delivery

Lesson content is small and authored; it is **bundled with the app as typed
JSON and/or read once from Firestore and cached**, so steps advance with no
spinner (N4) and play offline (N6). Static visual assets (e.g. SVG icons) ship
with the bundle or via Cloud Storage.

### Business Logic — Cloud Functions

- **None required for the MVP.** Answer checking, mastery updates, and
  next-step recommendation are all computed client-side and persisted directly
  to Firestore (guarded by Security Rules). This is deliberate: it is what keeps
  feedback < 100ms (N2) and lets the app scale to many concurrent learners with
  no per-answer server work (N9).
- **Reserved for later phases:** Phase 2 AI's **Story Mode** is **local-first**
  and needs **no Cloud Functions for the initial build** — in local dev the client
  calls the free Gemini Developer API directly with a gitignored key. A thin Cloud
  Function / server proxy (or Firebase AI Logic + App Check) is the **deploy-time**
  path that keeps the model key off the client and hosts server-side moderation,
  behind the same app-owned adapter (N15). Other Phase 2 AI (problem generation,
  adaptive hints, tutor) and Phase 3 cross-session signal aggregation can likewise
  move server-side when needed.

### Measurement & Tuning

- **Firebase Performance Monitoring** — track real-world app-open / first-
  interaction latency and answer-feedback timing against N1/N2/N3.
- **Google Analytics for Firebase** — the North-Star metric (lessons completed)
  and secondaries (lesson completion rate, step-level wrong-answer rates to find
  weak content).
- **Firebase Remote Config** — tune mastery thresholds and hint-escalation
  timing **without shipping a build**.
- **Firebase App Check** — attest genuine app clients (protects content and
  per-user data); **Crashlytics** for client error visibility.

### How a session flows

1. Learner opens the app → Firebase Hosting serves the React/Vite SPA (CDN,
   HTTPS); App Check attests the client.
2. The SPA checks Firebase Auth; a returning learner goes straight to the course
   map with a **"Continue"** to the exact saved step.
3. The lesson player loads the lesson's content model (bundled/cached) and
   renders the current step.
4. The learner interacts (drags a weight, plots a point, picks an option); a
   **pure client-side checker** returns correctness + the authored feedback id in
   < 100ms; the visual animates the result.
5. On each answer, the client updates `progress`, `mastery`, and writes an
   `attempts` event to Firestore (offline-queued if needed).
6. On lesson completion, the client updates mastery and computes the
   **next recommended step** from mastery + prerequisites (rule-based), then
   shows the completion screen.

## Open Questions

- **Anonymous first lesson?** Do we let a learner play lesson 1 before sign-up
  (lower friction) and merge progress on account creation, or require auth up
  front (R1)? Leaning toward "try the first step, then sign up to save."
- **Mastery model.** Start with a simple thresholded estimate (e.g. EWMA of
  correctness per skill) for the MVP; what's the right model before Phase 3's
  spaced repetition?
- **Bundled vs. fetched content.** Bundle lessons for instant load (N1/N4) vs.
  fetch from Firestore for hot-fixes without a deploy. Likely bundle for MVP,
  move to fetch-and-cache as the library grows.
- **Age gating / COPPA** specifics for under-13 (N12) — do we cap the audience at
  13+ like a typical teen app, or add guardian consent?
- **Re-theming fidelity** — how do we guarantee the LLM never changes a
  problem's numbers or answer (R34)? Likely validate the generated `Step`
  against the source and reject/retry on drift — and prefetch/cache to keep
  per-question latency and cost in check (N14).
- **Narrative coherence over a long run** — what "story so far" summarization
  keeps an endless run (R37) coherent without unbounded prompt growth?
- **Free-tier headroom** — the exact current Gemini Developer API free-tier
  limits (requests/min and /day) and the resulting questions/day ceiling per
  learner; verify against Google's live docs and tune the model
  (`gemini-flash-latest` vs `gemini-flash-lite-latest`) and prefetch accordingly.

## Resolved Decisions

| Decision | Choice | Implication |
| --- | --- | --- |
| **Subject** | **Algebra** | The whole app — content model, interactions, path, persona — is built for algebra. No second subject. |
| **Persona** | New-to-algebra 8th grader (Maya, 13), mobile-first | Justifies short lessons, one-thumb UX, and the balance-scale concretization. |
| **Flagship interaction** | Manipulable **balance scale** | The signature, directly-manipulated problem type (R13) that makes equality + inverse operations *click*. |
| **Answer checking** | **Client-side, pure function** | Sub-100ms feedback (N2), 60 FPS interaction (N3), offline play (N6), and many concurrent learners with no per-answer server cost (N9). |
| **Content model** | Typed **step array** (tagged union), bundled JSON + Firestore | Lessons are data, not HTML/components — fast to author now (R6/R12), AI-generatable later (Phase 2). |
| **AI in MVP** | **None** | Hard gate. The core must teach with zero AI before any is added (Phase 2). |
| **Backend** | Reuse existing **Firebase** scaffold in `vite/` | Auth, Firestore, Hosting, Security Rules already wired; no servers to run; deploy = public URL (N13). |
| **Cloud Functions in MVP** | **None** | Keeps the answer loop fast and the architecture simple; Functions reserved for Phase 2 AI. |
| **Habit / retention mechanics** | **Out of scope (Non-Goal)** | Streaks, daily goals, XP, and milestones are descoped for this version; focus stays on the core learn-by-doing loop and mastery. May be revisited later. |
| **First AI feature (Phase 2)** | **Story Mode** — interest-themed, endless review with a choose-your-own-adventure narrative | Reuses the MVP content model and client-side checker; the LLM only re-themes display text and narrates (never grades), so the sub-100ms answer loop and overall architecture are unchanged. |
| **Story Mode LLM & cost** | **Free** — Google **Gemini Developer API free tier** (`gemini-flash-latest`; `gemini-flash-lite-latest` fallback) | No Blaze/Vertex billing for v1. Free-tier rate/quota limits are a design constraint — handle `429`/quota-exceeded with backoff and a friendly fallback (R32, N14). |
| **Story Mode local-vs-deploy** | **Local-first**, one app-owned adapter | Local dev calls Gemini directly with a gitignored `VITE_GEMINI_API_KEY` (a client key is OK for local dev only); deploy keeps the key off the client via a server proxy / Cloud Function (or Firebase AI Logic + App Check) behind the same adapter, selected by env (R32, N15). |
| **Story Mode & progress** | **Pure review** — no mastery/progress writes | Never writes mastery, lesson progress, streaks, or course completion; it persists only its own story state (R41). |
| **Story Mode unlock** | After the **first two lessons** (Balancing Equations, One-Step Equations) | Eligibility uses the existing `hasCompletedLesson` helper; the small early pool (~12 re-themable steps) is reused with fresh re-theming (R40). |
| **Story Mode teen safety** | **First-class, multi-layer** | System-prompt constraints + Gemini safety settings + input sanitization/moderation + output filtering + no PII + safe fallback; deploy adds server-side moderation (R39, N15). |

## Milestones

The brief mandates a **strict three-phase order**: build the app first, add
intelligence second, add learning science third. Each phase must stand on its
own before the next begins.

### Phase 1 — MVP (by Wednesday) · the learn-by-doing core, **no AI**

Hard gate. To pass, all of the following must be true:

- [ ] **Subject stated clearly** (Algebra) and the app built for a **specific
      persona** (Maya, new-to-algebra 8th grader). *(README + this PRD)*
- [ ] **One interactive lesson** on a real concept — "Balancing Equations" —
      built from hands-on steps, not video/text. *(R7)*
- [ ] **At least one directly-manipulated problem** — the **balance scale**
      (drag weights, apply ops to both sides). *(R13)*
- [ ] **An interactive visual that responds** in real time — the scale tips and
      levels as the learner acts. *(R19, R20, N3)*
- [ ] **Instant, specific, authored feedback** on every answer, right or wrong,
      with a short explanation — written by us, not generated. *(R9, R22, R24,
      N2)*
- [ ] **Progress persists** — leave mid-lesson, come back, resume at the exact
      step, across devices. *(R25, N5)*
- [ ] **Accounts and names** (email/password + display name). *(R1, R2)*
- [ ] **Mastery + next-step path** — track mastery, recommend a sensible next
      step on completion, lock/unlock by prerequisite. *(R26, R27, R30)*
- [ ] **Works on mobile** screen sizes with touch. *(N7)*
- [ ] **Deployed and public**, holding up under multiple concurrent learners.
      *(N9, N13)*
- [ ] **Performance targets met**: feedback < 100ms, visuals 60 FPS, first
      interaction < 2s. *(N1, N2, N3)*

Depth target for the week: grow from the one flagship lesson toward **five-to-
six lessons that build on each other** (the Algebra Foundations path), because
depth — not lesson count — is what decides Phase 1.

### Phase 2 — AI features (by Friday) · built **on top** of a working core

Decide what AI should genuinely improve, then build it. Story Mode is built
**local-first** on a **free LLM**; any client-embedded key is gitignored and used
only in local dev, and the deploy path keeps keys off the client (server proxy /
Cloud Function or Firebase AI Logic + App Check):

- **Story Mode** — the first AI feature: an endless, interest-themed **review**
  mode. The learner picks interests; a selector pulls the next problem only from
  **already-completed** lessons; the LLM **re-themes** it to their story while
  preserving the math; and every **10** solved questions unlocks a **1–2
  paragraph** narrative beat the learner steers by **typing what they do next**
  (choose-your-own-adventure). It unlocks after the **first two lessons**, is
  **pure review** (never writes mastery or progress), runs on the **free Gemini
  Developer API** (no Blaze), and is **teen-safe** by design. Reuses the content
  model and client-side checker. *(R31–R41, N14, N15)*
- **Problem generation** — generate new practice items *in the content-model
  schema* (e.g. fresh one-/two-step equations at a target difficulty), so the
  same renderer and client-side checker apply.
- **Adaptive hints & explanations** — when a learner is stuck after the authored
  hints, generate a tailored next hint grounded in their specific wrong answer.
- **AI tutor** — an optional "explain this step to me" that respects the
  learn-by-doing flow (nudges, doesn't hand over the answer).
- **Difficulty calibration** — use accumulated signals to pick the next problem's
  difficulty.

### Phase 3 — Learning science (by Sunday) · make it *stick*

Layer evidence-based techniques on the now-smart app:

- **Spaced repetition** — schedule reviews of mastered skills with a mastery
  **decay** model (extend `mastery/{uid}/skills`).
- **Retrieval practice** — periodic low-stakes recall of earlier concepts.
- **Interleaving** — mix problem types/skills rather than blocking by topic.
- **Desirable difficulty** — keep problems in the productive-struggle zone, with
  the gap-repair loop (R28) surfacing reviews before weaknesses compound.
