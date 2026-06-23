# BrainLift — The Backend of Brilliant.org

Author: Preston Loats · Status: Draft v2 · Topic: How the *actual* Brilliant app works under the hood (backend focus)

> **What this is.** A BrainLift to build a defensible, expert-level point of view on how
> Brilliant.org's backend is architected — its content engine, answer-checking model,
> persistence/sync, and infrastructure — and to surface the *spiky* truths that separate how
> Brilliant actually works from how most people assume an edtech backend works.
>
> **Honesty constraint.** Every factual claim is tagged with a confidence level. Treat anything
> below `[Verified]` as a hypothesis to confirm, not a fact to repeat.
>
> **Correction log (v2).** A web-research pass corrected the v1 draft's central error: Brilliant is
> **not** a Clojure/ClojureScript shop. That claim came from conflating Brilliant with **Amperity**
> (whose CTO Derek Slager gave the well-known "Why Clojure?" / "ClojureScript for Skeptics" talks).
> Brilliant's real stack and a verified Experts list are now filled in below.

**Confidence legend**

- `[Verified]` — widely documented / observable behavior of the live product
- `[Likely]` — strong inference from public signal (talks, hiring, community reputation)
- `[Inferred]` — architectural reasoning from how the product behaves, not a stated fact
- `[Unknown]` — genuine gap; needs research

---

## 1. Purpose

Develop enough real understanding of Brilliant's backend to (a) reason about *why* they made the
architectural bets they did, and (b) hold contrarian, defensible opinions about how an
interactive-learning backend *should* be built.

**In bounds**

- Backend architecture and the client/server split
- The interactive-content engine: how a lesson goes from authored artifact → delivered → played
- Answer checking and where the "smarts" live (client vs. server)
- Progress, mastery, streaks: persistence and cross-device sync
- Content authoring/pipeline and versioning
- Billing/subscription, auth, and supporting infra/observability

**Out of bounds**

- Pedagogy and UX content design, except where it constrains the backend
- Native mobile rendering internals
- Marketing/growth systems

**Why it matters.** Brilliant is a useful study because its product thesis (learn by doing,
instant feedback) forces specific backend choices. If you understand those forcing functions, you
can copy the *reasoning*, not just the surface.

---

## 2. Experts & Sources (where the real signal is)

*Verified via web research (June 2026). Links are starting points, not endorsements.*

**People at Brilliant (named)**

- **Kevin Smith** — CTO, Brilliant.org. Top of the engineering org; sets technical direction.
  `[Verified]` — [LinkedIn](https://linkedin.com/in/kvnsmth)
- **Jared Silver** — Senior Director of Engineering (joined via Brilliant's 2022 acquisition of
  Hellosaurus); runs the Growth, User Motivation, and Learning Experience teams. `[Verified]` —
  [LinkedIn](https://www.linkedin.com/in/jaredasilver)
- **Danny Greg** — Senior Staff Engineer on the **Interactives** team — i.e., the people who build
  the hands-on lesson engine. `[Verified]` — [LinkedIn](https://linkedin.com/in/danny-greg-576153118)
- **Pontus Granström** — built **Diagrammar**, Brilliant's in-house Elm tool for interactive
  diagrams; the clearest public window into the interactive engine. `[Verified]` — talk below.
- Also in the eng org chart: John Hergenroeder (Sr. Eng. Manager), Shirley Lin (Staff SWE / Tech
  Lead), Thomas Corthouts (Sr. Eng. Manager), Jesse Levine (Interactives Engineer), Kevin Shain
  (Director of ML), Graham Madden (Lead Data & Analytics Eng), plus dedicated **Unity** engineers.
  `[Verified]` (org chart)

**Primary sources (highest signal first)**

- **"Diagrammar: Simply Make Interactive Diagrams" — Pontus Granström, Strange Loop 2022.** The
  single best public source on how Brilliant builds interactive content (Elm + an in-house
  framework). `[Verified]` — [YouTube](https://www.youtube.com/watch?v=gT9Xu-ctNqI)
- **Brilliant "Creative Technologist" job listing (Lever).** Confirms the interactive stack in their
  own words: "web standards, HTML, CSS, SVG, **Elm**, and sometimes TypeScript … using our in-house
  frameworks, like Diagrammar." `[Verified]` —
  [jobs.lever.co/brilliant](https://jobs.lever.co/brilliant/fe9f5add-2078-4fd3-b96c-1e5b6313253a)
- **StackShare — Brilliant profile.** Broad stack inventory (Django, Python, PostgreSQL, Vue.js,
  React, TypeScript, Elm, AWS, Stripe, Algolia, RabbitMQ/Celery, Sentry, Terraform). `[Verified]` —
  [stackshare.io/brilliant/brilliant](https://stackshare.io/brilliant/brilliant)
- **HackerX / RocketReach stack listings.** Corroborate Django, Python, Rust, TypeScript, Vue, Elm.
  `[Verified]`
- **Ex-employee portfolios** (e.g., Dipesh KC) describing the **Vue.js/Django → Next.js/GraphQL**
  migration and growth/experimentation work. `[Likely]` (self-reported)

**Methods to go deeper (no permission needed)**

- **Network inspection of the live app** — open dev tools during a lesson; watch payload shapes and
  where answer-checking happens. Still the best primary source for *backend behavior*. `[Verified method]`
- **Brilliant careers page** — current openings reveal the live stack and team structure. `[Verified method]`

> **Caution:** Don't confuse Brilliant with **Amperity** (Derek Slager's Clojure/ClojureScript
> company) — the v1 draft did exactly that.

---

## 3. Knowledge Tree (organized by Depth of Knowledge)

### DOK 1 — Recall & Reproduction (the facts)

*Plain facts you should be able to state cold.*

- Brilliant is an **interactive STEM learning platform** — math, science, CS, data, logic —
  delivered on **web, iOS, and Android**. `[Verified]`
- Its pedagogy is **learn-by-doing**: short interactive problems with **instant feedback**, not
  lecture videos. `[Verified]`
- Business model is **freemium → subscription** (a limited free tier, paid for full access). `[Verified]`
- Lessons are **interactive and visual** (drag, tap, sliders, step-through), implying a rich
  client and a data-driven content format. `[Verified]` (observable) / `[Inferred]` (data-driven)
- **Backend:** **Python + Django**, serving lesson logic, user progress, and APIs; **PostgreSQL**
  is the primary datastore, with **Memcached** caching and **Celery + RabbitMQ** for async work. `[Verified]`
- **Frontend:** a **Vue.js** app being migrated to **Next.js / React (TypeScript)**, with **GraphQL**
  as the client–server query layer. `[Verified]`
- **Interactive content** is built in **Elm** via an in-house framework called **Diagrammar**;
  **Rust** also appears in the stack (plausibly compiled to WebAssembly for in-browser simulation).
  `[Verified]` (Elm/Diagrammar) / `[Likely]` (Rust→WASM)
- **Native mobile** apps use Swift/Objective-C (iOS) and Kotlin (Android); some interactives use **Unity**. `[Verified]`
- **Infra:** AWS (CloudFront CDN, EC2, S3), Docker, NGINX, Terraform; Stripe (billing), Algolia
  (search), Amplitude/Redash (analytics), Sentry (errors). `[Verified]`
- The frontend is a **single-page-style rich client** that fetches content and runs the
  interaction locally rather than re-rendering from the server per step. `[Inferred]`

### DOK 2 — Skills & Concepts (how the pieces fit together)

*Relationships and mechanisms — the "how it works" you can explain to someone else.*

- **Content-as-data engine.** A lesson is almost certainly **structured data interpreted by a
  generic player**, not bespoke code per lesson. A step declares its type, prompt, interaction
  spec, correct answer(s), and feedback; a client-side renderer maps each type to a component.
  This is what lets Brilliant ship thousands of lessons without shipping code for each. `[Inferred]`
- **Answer checking lives close to the client.** Because feedback is instant and interactions are
  rich, the *checking logic and the visual response are client-side*, evaluated against the step's
  spec. The backend's job is to **serve content and record what happened**, not to grade each
  keystroke. `[Inferred]`
- **The backend is mostly a sync/persistence/identity/billing layer.** Likely responsibilities:
  serve (versioned, cached) content; authenticate users; persist progress/mastery/streaks; run
  subscriptions/entitlements; collect analytics events. The "product logic" of a lesson is in the
  *content data*, not in feature endpoints. `[Inferred]`
- **Content pipeline.** Authors and Creative Technologists build interactive content with in-house
  tooling — notably **Diagrammar**, an Elm-based framework for **parametric, reusable, interactive
  diagrams** — rather than hand-coding each lesson. Authors can share toolkits/styles, and any
  diagram can be made interactive. `[Verified]` (Diagrammar) / `[Inferred]` (versioning/publish path)
- **Cross-device progress** implies a user-keyed store of progress/mastery with last-write or
  merge semantics, plus enough client caching to keep play snappy and offline-tolerant. `[Inferred]`
- **Why Elm for interactives (but not the whole stack).** Brilliant **quarantines** its interactive
  visuals in **Elm** — a pure, statically-typed functional language whose "no runtime exceptions"
  guarantee and data-first model suit many small, reliable, composable interactions — behind the
  **Diagrammar** framework so authors/CTs can build diagrams. The mainstream
  **Python/Django + GraphQL + Next.js** core handles everything else. The interactive engine is an
  *island* with its own language, not the house style. `[Verified]` (the Elm island) / `[Inferred]` (the "why")

### DOK 3 — Strategic Thinking *(suggestions only — investigate, don't assume)*

*These are prompts and hypotheses to reason through and verify, **not** settled answers. Each is a
thread to pull, framed as "go look into this."*

- **Answer-checking trade-off.** Suggestion: map the tension between client-side checking
  (sub-100ms feedback, offline play, zero per-answer server cost, massive concurrency) and its
  costs (answers shippable to the client → scrapeable/cheatable). Investigate *how* they might
  blunt that — obfuscation, server-side validation only for graded/certificate flows, accepting
  leakage as a non-threat for a learning (not testing) product.
- **Content versioning under live cohorts.** Suggestion: figure out what happens when a lesson's
  schema or content changes while learners are mid-course. Look for content version pinning,
  backward-compatible step types, and how stored progress references content (by id+version?).
- **Sync & conflict model.** Suggestion: probe how progress/streaks reconcile across two devices
  used offline. Is it last-write-wins, per-field merge, or event-sourced replay? Watch the network
  tab while forcing a conflict.
- **The content schema as the real product.** Suggestion: treat their step/interaction schema as
  the crown jewel and try to reverse-engineer its shape from network payloads. The expressiveness
  of that schema (how many interaction types, how composable) likely predicts their authoring
  velocity better than any infra choice.
- **Stack-bet evaluation.** Suggestion: build the case *for and against* Brilliant's real bets — an
  **Elm island for interactives** (reliability/composability vs. a tiny hiring pool and a second
  toolchain) and the **Vue → Next.js/GraphQL migration** (developer experience and SEO vs. migration
  cost). Decide which are genuine moats and which are legacy drag.
- **Where adaptivity actually runs.** Suggestion: test the hypothesis that "adaptivity" is mostly
  cheap client-side rules over content metadata, with any ML/analytics computed *offline* and fed
  back as data — rather than ML in the request path. Look for batch vs. real-time signals.

### DOK 4 — Extended Thinking

*Intentionally left empty per request — no DOK 4 content provided.*

---

## 4. SpikyPOVs

*Contrarian, defensible takes. "Consensus says X; the truth is Y." Each is a hypothesis grounded in
the reasoning above — sharpen or kill it as you verify.*

1. **Consensus:** A serious edtech platform needs heavy server-side logic to grade answers and stop
   cheating.
   **Spiky:** Brilliant treats the backend as a *sync-and-billing layer* and pushes grading to the
   client. For a *learning* (not *testing*) product, answer-leakage is a non-threat, and the payoff
   — instant feedback, offline play, near-infinite concurrency at near-zero per-answer cost — is
   enormous. `[Inferred]`

2. **Consensus:** Use one mainstream language across the stack so hiring and maintenance stay easy.
   **Spiky:** Brilliant deliberately runs a **polyglot** shop and **quarantines its interactives in
   Elm** (via Diagrammar) — accepting a tiny hiring pool and a second toolchain — because the
   *reliability and composability of the interactions* (Elm's no-runtime-exceptions guarantee) matter
   more there than stack uniformity. The real moat is **Diagrammar + the Elm interactive library**,
   not the ordinary Python/Django/Next.js core. `[Verified]` (the bet) / `[Inferred]` (that it's the moat)

3. **Consensus:** Interactive lessons are custom-built features, each shipped as code.
   **Spiky:** Brilliant's real backend product is a **content schema + a generic interpreter**.
   Lessons are configuration. The competitive moat is the *expressiveness of the schema and the
   authoring tool*, not any endpoint, datastore, or cloud choice. `[Inferred]`

4. **Consensus:** Adaptive learning requires ML in the live request path.
   **Spiky:** Most perceived adaptivity is **cheap rules over content metadata**, computed on the
   client; the heavy analysis runs **offline** and is delivered back as more data. Real-time ML in
   the hot path would buy little and cost latency. `[Inferred]`

---

## 5. Insights / Working Notes

- The cleanest mental model: **"Brilliant's backend is a CDN for versioned content + a database for
  per-user progress + Stripe-style billing — and almost nothing else clever in the request path.
  The cleverness is in the content schema and the client interpreter."** `[Inferred]`
- This is the *same architectural shape* the learn-by-doing thesis forces on anyone: if feedback
  must be instant and offline-tolerant, the server cannot be in the answer loop.
- The highest-leverage thing to reverse-engineer is **the step/interaction schema**, because it
  encodes their authoring velocity and product surface.

---

## 6. Open Questions / To Verify

- [x] ~~Confirm the language stack~~ — **Done.** Python/Django + PostgreSQL backend; GraphQL;
  Vue→Next.js/React (TS) frontend; **Elm/Diagrammar** for interactives; Rust; Unity for some.
  *(Not Clojure.)* `[Verified]`
- [x] ~~Find and name actual Brilliant engineers + talks~~ — **Done.** See Experts (Kevin Smith CTO,
  Jared Silver, Danny Greg, Pontus Granström + the Diagrammar talk). `[Verified]`
- [ ] Confirm **Rust → WebAssembly** powers in-browser simulations (vs. plain JS/Canvas/WebGL). `[Likely → verify]`
- [ ] Pin down the **content delivery + versioning** path (bundled vs. GraphQL-fetched vs. CDN-cached). `[Unknown]`
- [ ] Determine whether *any* answer checking is server-side (e.g., graded/certificate flows). `[Unknown]`
- [ ] Map how **Elm interactives talk to the GraphQL/Django core** (where progress is recorded). `[Unknown]`
- [ ] Inspect the live app's network traffic to validate the "content-as-data + client checking" model. `[To do]`
