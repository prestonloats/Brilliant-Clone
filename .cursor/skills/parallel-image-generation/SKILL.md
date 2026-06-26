---
name: parallel-image-generation
description: >-
  Generate many images in parallel using subagents without the calling model
  getting stuck. Each GenerateImage result returns a multi-megabyte (~5 MB) image
  blob into the calling model's context, so batching several image calls in one
  turn overruns the context window and the turn hangs until aborted. Use when
  generating many / bulk / batch images or image assets (scenery, sprites, icons,
  tiles, illustrations, textures) — it fans the work out to waves of subagents
  that each generate one image per turn and report back only file paths, keeping
  image bytes out of the orchestrator's context. Not needed for a single image.
---

# Parallel Image Generation

Generate a large set of images fast, without the hang that happens when a model
generates images. The orchestrator (this agent) plans and coordinates; **subagents
do all the `GenerateImage` calls** so the heavy image bytes never land in the
orchestrator's context.

## Why the hang happens (read once)

- Every `GenerateImage` call feeds the produced image back into the **calling
  model's context as a ~5 MB blob**, and it stays there for the rest of that
  context's life.
- Generating several images in one turn (e.g. 6–8 parallel calls) dumps tens of
  MB into a single turn → the context window overruns, throughput collapses, and
  the turn appears frozen.
- `reference_image_paths` adds another image payload per call, making it worse.

**Therefore:** keep image bytes out of the orchestrator, isolate every generation
in a short-lived subagent, generate **one image per turn**, and have subagents
return **text only**.

## Core rules (non-negotiable)

1. **The orchestrator never calls `GenerateImage`.** Not even once "to test". Its
   context must stay clean to coordinate many waves.
2. **One `GenerateImage` call per subagent turn.** Never put two image calls in a
   single message/turn.
3. **Few images per subagent** — default **1**. If a subagent is assigned more,
   it generates them **sequentially, one per turn**, never batched.
4. **Subagents return TEXT ONLY**: destination path + file size + status. They
   must never echo/embed the image, never read a generated image back into
   context, and never print base64.
5. **No `reference_image_paths` unless style-matching is required.** If it is, use
   one small reference image.
6. **Idempotent / resumable**: skip any image whose destination file already
   exists (non-trivial size). A re-run continues where it left off.

## Workflow

```
Image-gen progress:
- [ ] 1. Build the manifest (id, filename, destination, prompt); skip existing
- [ ] 2. Partition into waves (default 8 subagents/wave, 1 image each)
- [ ] 3. Spawn a wave: one message, one Task per image, in parallel
- [ ] 4. Collect text reports; verify files on disk (size only)
- [ ] 5. Retry failures (cap 2), spawn next wave until manifest is done
- [ ] 6. Report back to the user
```

### 1. Build the manifest

Produce a list of image tasks, each with:

- `id` — short slug (used for the filename)
- `filename` — e.g. `<id>.png`
- `destination` — final path, e.g. `public/scenery/<id>.png`
- `prompt` — the full image description (see prompt tips below)

Derive the list from the user's request or an existing catalog. **Skip tasks
whose `destination` already exists** so reruns are cheap. Track remaining tasks
with `TodoWrite`.

### 2. Partition into waves

- Default **1 image per subagent** and **8 subagents per wave** (so genuinely
  many subagents run at once). Tune in "Tuning" below.
- Each task has a unique `filename`/`destination`, so subagents never collide on
  files.

### 3. Spawn a wave (parallel)

- Send **one message containing one `Task` call per image task** in the wave, so
  they run in parallel. Use `subagent_type: generalPurpose`.
- For very large or long jobs, set `run_in_background: true` and integrate
  completion notifications as they arrive; otherwise foreground is simpler.
- Each subagent prompt must be **self-contained** (subagents don't see this
  chat). Use the template below.

### 4. Collect and verify

- Read only the subagents' **text reports**. **Never open the generated images
  yourself** — that reintroduces the blob into your context.
- Verify each destination exists with a size check only (e.g. shell file size),
  not by reading image contents.

### 5. Retry and continue

- Re-queue any FAILED or missing image into the next wave. **Cap retries at 2**
  per image. Then keep spawning waves until the manifest is exhausted.

### 6. Report back

Summarize: `N/total` generated, destinations written, and any images that failed
after retries (with the subagent's reported error).

## Subagent prompt template

```text
You are an image-generation subagent. Do exactly the task below, then report and stop.

Repo: <absolute repo path>
Image task:
- filename: <id>.png
- destination: <dir>/<id>.png
- description: <full image prompt>

Steps:
1. If <destination> already exists and is > 10 KB, skip generation and report SKIPPED.
2. Otherwise call GenerateImage ONCE with description=<the description above> and
   filename="<id>.png". Do NOT pass reference_image_paths unless told to.
3. Locate the file the tool produced (search the workspace for "**/<id>.png").
4. Move it to <destination> (create the destination directory if needed).
5. Verify <destination> exists and its size is > 10 KB. DO NOT open or read the
   image's contents — check size only.

Hard rules:
- Make at most ONE GenerateImage call. Never call it twice in one turn.
- Report TEXT ONLY. Never embed/echo the image, never print base64, never read the
  image bytes back into context.

Report back exactly:
- Status: DONE | SKIPPED | FAILED
- Destination path and file size in bytes
- If FAILED: which step failed and the error text
```

> If a subagent is assigned more than one image, repeat steps 2–5 **one image per
> turn** (one `GenerateImage` call per turn), then report all results together.

## Prompt tips for a consistent set

- Keep a **fixed style suffix** on every prompt and vary only the subject:
  e.g. `..., <style> concept art, richly saturated, cinematic wide landscape,
  no text, no watermark, no people, 3:2 aspect ratio`.
- State the aspect ratio and exclusions explicitly in the text (the tool has no
  size parameter).
- Only style-match with a reference image when the set must match existing art;
  pass exactly one small reference and accept the extra per-call cost.

## Tuning

| Knob | Default | Raise when | Lower when |
|------|---------|-----------|------------|
| images per subagent | 1 | many images, want fewer spawns | subagents hang |
| subagents per wave | 8 | generation is fast/cheap | hitting concurrency limits |
| retries per image | 2 | flaky generation | — |

## Escape hatch (massive or repeated jobs)

If you need hundreds of images or a repeatable pipeline, skip the in-chat tool
entirely: write a script that calls an image API directly and writes files to
disk, so the bytes never enter **any** model's context. Subagents are the right
tool for one-off bulk sets; a script is better for scale and repeatability.
