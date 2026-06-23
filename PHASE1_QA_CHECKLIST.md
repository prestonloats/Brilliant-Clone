# Phase 1 QA Smoke Checklist

Use this checklist before a local demo of the Balance Phase 1 MVP. It is intentionally focused on the current React/Vite local build for the six-part Algebra Foundations path, not the future hosted Firebase version.

## How To Mark Results

For each check, replace `[ ]` with one:

- `[P]` Pass: works as expected.
- `[F]` Fail: blocks or visibly harms the demo.
- `[N]` Not checked: skipped, with a short note.

Record the local URL, browser, viewport, and any notes at the bottom before sharing results.

## Local Setup

- `[ ]` Start the local Vite app with the existing project instructions and open the URL printed by Vite, usually `http://localhost:5173/`.
- `[ ]` Confirm the app loads to the Balance auth screen without console-blocking errors.
- `[ ]` Confirm the copy states that accounts and progress are stored locally in this browser.

## Lesson 1 Manual Smoke Test

- `[ ]` Local account: choose `Start with a local demo account`, or create a local account, and confirm the app lands on the Algebra Foundations path.
- `[ ]` Course continue: confirm the `Balancing Equations` card shows a `Continue` button and a visible progress indicator.
- `[ ]` Lesson start: click `Continue`, review the first concept screen, and advance with `Continue`.
- `[ ]` Wrong answer recovery: on the prediction step, intentionally choose an incorrect option such as `It stays level`; confirm specific feedback appears, the option can be retried, and the correct option unlocks `Continue`.
- `[ ]` Balance drag/drop: on `Make the scale level again by dragging the 2 onto the right pan`, drag the `2` tile onto the right pan; confirm the visual responds, the equation totals match, `Check scale` gives correct feedback, and `Continue` appears.
- `[ ]` Numeric retry: on `x + 2 = 5`, submit a wrong value such as `5`; confirm the feedback explains the mistake, then submit `3` and continue.
- `[ ]` Operation mistake: on `Isolate the box by removing 2 from both sides`, choose `-2 from left only`; confirm the scale tips or feedback says only one side changed.
- `[ ]` Reset and retry: after the operation mistake, click `Reset scale`, choose `-2 from both sides`, check the scale, and confirm correct feedback.
- `[ ]` Final practice: on `Solve x + 4 = 9`, repeat the one-side-only mistake once, reset if needed, then finish with `-4 from both sides`.
- `[ ]` Completion: advance through the summary screen and confirm the completion view recommends `One-Step Equations`.
- `[ ]` Refresh/resume after completion: refresh the browser and confirm the local account is still signed in, the course path shows Lesson 1 as completed/mastered, `One-Step Equations` is available, later lessons remain locked until their prerequisites are complete, and `View completion` returns to the Lesson 1 completion view.
- `[ ]` Refresh/resume mid-lesson: with a fresh local demo account, stop around the middle of Lesson 1, refresh, and confirm `Continue` resumes at the expected step rather than restarting from the beginning.
- `[ ]` Profile/mastery: open `Profile` and confirm the display name, attempt history, and mastery values reflect the completed or partially completed lesson.
- `[ ]` Local logout/login: log out, log back in with the same local credentials in the same browser, and confirm progress is still available.

## Path Unlock And Lesson 2-3 Manual Smoke Test

- `[ ]` Fresh path lock state: with a fresh local demo account before completing Lesson 1, confirm `Balancing Equations` is available and Lessons 2-6 are locked with no start/continue action.
- `[ ]` Lesson 2 unlock gate: complete Lesson 1, return to the Algebra Foundations path, and confirm `One-Step Equations` unlocks only after Lesson 1 completion.
- `[ ]` Lesson 3 unlock gate: complete Lesson 2, return to the Algebra Foundations path, and confirm `Two-Step Equations` unlocks only after Lesson 2 completion.
- `[ ]` Lesson 2 start: click `Continue` on `One-Step Equations`, review the first concept screen, and advance with `Continue`.
- `[ ]` Lesson 2 MCQ retry: on `For x - 3 = 4, which move starts solving for x?`, intentionally choose an incorrect option such as `-3 from both sides`; confirm specific feedback appears, the option can be retried, and `+3 to both sides` unlocks `Continue`.
- `[ ]` Lesson 2 operation retry: on `Isolate x in x - 3 = 4 by adding 3 to both sides`, choose `+3 to left only`; confirm the feedback explains that only one side changed, then reset if needed, choose `+3 to both sides`, and continue.
- `[ ]` Lesson 2 numeric retry: on `Solve x + 6 = 10`, submit a wrong value such as `10` or `16`; confirm targeted feedback appears, then submit `4` and continue.
- `[ ]` Lesson 2 multiplication retry: on `Solve 3x = 12`, submit a wrong value such as `12`; confirm the feedback explains dividing by 3, then submit `4` and continue.
- `[ ]` Lesson 2 division retry: on `Solve x / 4 = 2`, submit a wrong value such as `2` or `0.5`; confirm the feedback explains multiplying by 4, then submit `8` and continue.
- `[ ]` Lesson 2 refresh/resume mid-lesson: stop partway through Lesson 2, refresh, and confirm `Continue` resumes that Lesson 2 step rather than restarting Lesson 1 or the beginning of Lesson 2.
- `[ ]` Per-lesson local persistence: refresh after making progress in both lessons and confirm Lesson 1 completion, Lesson 2 current/completed state, step attempts, and profile/mastery data are preserved separately in the same browser profile.
- `[ ]` Lesson 2 completion: advance through the summary screen and confirm the path shows `One-Step Equations` completed/mastered while `Two-Step Equations` is available.
- `[ ]` Lesson 3 completion: complete `Two-Step Equations` and confirm `Like Terms & Variables on Both Sides` unlocks as a lightweight shell.
- `[ ]` Lesson shells: confirm `Like Terms & Variables on Both Sides`, `Coordinate Plane`, and `Graphing Lines` appear in order and each shell unlocks only after the previous lesson is complete.

## Mobile And Touch Checklist

- `[ ]` Set the viewport to 375px wide, for example iPhone SE or a custom 375px responsive viewport.
- `[ ]` Confirm auth, path, lesson, completion, and profile screens fit without horizontal scrolling.
- `[ ]` Complete Lesson 1 using touch or touch emulation only, including the balance drag/drop step.
- `[ ]` Start or complete Lesson 2 using touch or touch emulation only, including operation buttons, numeric answers, wrong-answer feedback, and retries.
- `[ ]` Confirm tile drag targets and the `Left` / `Right` tap alternatives are usable without a mouse.
- `[ ]` Confirm primary actions remain visible and tappable after feedback panels appear.
- `[ ]` Confirm the balance scale, equation row, and feedback text remain readable at 375px.

## Accessibility Smoke Checks

- `[ ]` Hit targets: primary buttons, options, tiles, and operation buttons are comfortable to activate at mobile size, aiming for roughly 44px minimum touch targets.
- `[ ]` Keyboard basics: using only Tab, Shift+Tab, Enter, and Space, a tester can sign in, navigate Path/Profile/Log out, answer non-drag steps, use operation buttons, reset, and continue.
- `[ ]` Keyboard drag fallback: balance tile placement can be completed without pointer dragging by using the `Left` and `Right` buttons.
- `[ ]` Focus visibility: keyboard focus is visible on controls throughout auth, path, lesson, completion, and profile screens.
- `[ ]` Non-color feedback: correct and incorrect states include explanatory text, not color alone.
- `[ ]` Reduced motion: with OS/browser reduced-motion enabled, the lesson remains usable and no animation is required to understand correctness or progress.
- `[ ]` Screen-reader basics: interactive scale imagery has a useful accessible label, form fields have labels, and navigation has a clear label.

## Phase 1 Final Sign-Off Checklist

Current local MVP checks expected to pass before Phase 1 sign-off:

- `[ ]` Local-only auth works in the same browser profile.
- `[ ]` Local progress and mastery persist per lesson across refresh in the same browser profile.
- `[ ]` Lessons 1-3 can be completed without Firebase or any hosted backend.
- `[ ]` Lessons 4-6 appear as local content shells in the correct prerequisite order.
- `[ ]` Wrong-answer recovery works across Lesson 1 and Lesson 2 retries.
- `[ ]` Local resume returns to the correct lesson and step after refresh.
- `[ ]` Profile and mastery screens reflect completed or partially completed work.
- `[ ]` Mobile/touch basics work at the tested mobile viewport, including drag/drop or tap alternatives.
- `[ ]` Demo notes clearly state that browser storage resets, private browsing, or a different browser/device can lose or hide progress.

Deferred hosted checks, expected to fail or remain unchecked while Firebase/Supabase is unavailable:

- `[ ]` Firebase or hosted auth sign-up, login, logout, and password reset.
- `[ ]` Cross-browser and cross-device resume for the same learner account.
- `[ ]` Hosted database sync for progress, mastery, and attempts.
- `[ ]` Firebase Security Rules or Supabase RLS that prevent one learner from reading or writing another learner's data.
- `[ ]` Public HTTPS deploy with production environment configuration.
- `[ ]` Basic concurrent-user smoke test against the hosted deploy.
- `[ ]` Production monitoring for load, client errors, and feedback latency.

These hosted checks are deferred because the current Phase 1 backend is browser-local and Firebase/Supabase is not available for this MVP pass. They are not dropped from scope.

## Demo Sign-Off

- Local URL:
- Browser and version:
- Viewport tested:
- Additional viewport, if any:
- Tester:
- Date:
- Overall result: `[P]` Pass / `[F]` Fail / `[N]` Not checked
- Pass/fail notes:
- Blocking issues:
- Follow-up notes:
