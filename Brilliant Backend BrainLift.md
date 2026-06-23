# BrainLift — The Backend of Brilliant.org

Author: Preston Loats · Status: Draft v1 · Topic: How the *actual* Brilliant app works under the hood (backend focus)

> **What this is.** A BrainLift to build a defensible, expert-level point of view on how
> Brilliant.org's backend is architected — its content engine, answer-checking model,
> persistence/sync, and infrastructure — and to surface the *spiky* truths that separate how
> Brilliant actually works from how most people assume an edtech backend works.
>
> **Honesty constraint.** This was written without live web access, so every factual claim is
> tagged with a confidence level. Treat anything below `[Verified]` as a hypothesis to confirm,
> not a fact to repeat.

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

A BrainLift names real sources. Since this draft is offline, these are the *channels* to mine —
fill in specific names/links as you verify.

- **Brilliant's own engineering talks** — Brilliant is well known in the Clojure community and has
  presented at Clojure conferences (Clojure/conj, re:Clojure, etc.). These talks are the highest-
  signal source on their stack and content engine. `[Likely]`
- **Brilliant careers / job listings** — the stack they hire for is the cheapest reliable tell
  (languages, datastores, cloud). `[Verified method]`
- **Stack-detection tools** — `BuiltWith`, `Wappalyzer`, `StackShare` profiles for brilliant.org. `[Verified method]`
- **Network inspection of the live app** — open dev tools on a lesson and watch what's fetched:
  payload shapes, where answer checking happens, what hits the server vs. stays local. This is the
  single best primary source and requires no permission. `[Verified method]`
- **Public engineering writing / interviews** — blog posts, podcasts, and conference Q&A from
  Brilliant engineers. `[Unknown]` which specific ones — to be filled in.

> **To do:** replace this section with named people + linked talks/posts. An Experts section
> without names is a knowledge tree, not an experts list.

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
- Brilliant is a recognized **Clojure / ClojureScript** shop — a single Lisp spanning server
  (Clojure) and browser (ClojureScript). `[Likely]`
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
- **Content pipeline.** Authors create lessons in an **internal authoring tool** that emits the
  structured format; content is versioned and published to a store/CDN the clients read. `[Inferred]`
- **Cross-device progress** implies a user-keyed store of progress/mastery with last-write or
  merge semantics, plus enough client caching to keep play snappy and offline-tolerant. `[Inferred]`
- **Why a Lisp + data orientation fits.** ClojureScript's "data first" ethos (lessons *are* data
  structures; EDN/JSON over the wire) and code sharing across client/server reduce the
  impedance between "author a lesson" and "play a lesson." The stack choice and the
  content-as-data architecture reinforce each other. `[Inferred]`

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
- **Stack-bet evaluation.** Suggestion: build the case *for and against* Clojure/ClojureScript for
  this product — hiring pool vs. code-sharing/data-orientation payoff — and decide whether the bet
  is a genuine moat or a legacy constraint.
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

2. **Consensus:** Pick the mainstream stack (JS/Python) so hiring is easy.
   **Spiky:** Brilliant's bet on a niche **Lisp across the whole stack** is *correct for this
   product*, because "a lesson is data" and "code shared between authoring and playing" matter more
   than a big hiring pool. The stack is downstream of the content-as-data architecture, not a
   fashion choice. `[Likely]`

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

- [ ] Confirm the language stack (Clojure/ClojureScript?) from a current job listing or talk. `[Likely → verify]`
- [ ] Identify the primary datastore(s) for content vs. user progress. `[Unknown]`
- [ ] Confirm content delivery: bundled, CDN-served, or fetched-and-cached — and how it's versioned. `[Unknown]`
- [ ] Determine whether *any* answer checking is server-side (e.g., for certificates/graded paths). `[Unknown]`
- [ ] Find and name 2–3 actual Brilliant engineers + their talks/posts for the Experts section. `[Unknown]`
- [ ] Inspect the live app's network traffic to validate the "content-as-data + client checking" model. `[To do]`
