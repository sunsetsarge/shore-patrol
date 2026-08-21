# SHORE PATROL — 3D asset pipeline (project notes)

**The canonical pipeline documentation is the `game-asset-pipeline` skill, lane 3D:**
`C:\Claude\sarges-skills\skills\game-asset-pipeline\references\lane-3d-render.md`

That file owns the eleven hard-won rules, the Track A / Track B shading recipe, and the
fail-loud assertions (`ASSERT_FORWARD_AXIS`, `ASSERT_FACING_FROM_RENDER`,
`ASSERT_MIN_FRAMES`, `ASSERT_SHARED_PALETTE`). Do **not** restate or fork them here — read
them there. This file keeps only what is specific to SHORE PATROL
(`C:\Claude\Projects\Active\Beachhead`).

The pipeline in one line: text prompt → Meshy text-to-3D (GLB) → headless Blender render to
PNG frames → PIL alpha-bbox trim → install into `assets/` → wire into `data/*.json`. The
engine stays 2D; every "3D model" in the shipped game is a pre-rendered sprite.

---

## This machine / this project

| Thing | Location / value |
|---|---|
| Meshy API key | `C:\Claude\.credentials\meshy.key` (also `MESHY_API_KEY` env var) |
| Meshy API base | `https://api.meshy.ai`, `Authorization: Bearer <key>` |
| Blender (headless) | `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (4.3 also installed) |
| Python (PIL/requests) | `C:\AI-Shared\python.exe` (3.10) |
| Reference implementation | `C:\Claude\Projects\Active\Beachhead\meshy_test\` |

SHORE PATROL ships **Track A** (pre-rendered realism) — correct for this game. Track B
(cel-shaded, reads as pixel art) is documented in the skill for other projects.

## The meshy_test/ iteration landscape

`meshy_test/` is an *iteration* folder, not a curated toolkit: it accumulated one script per
experiment. Freshly measured on 2026-08-21 from `C:\Claude\Projects\Active\Beachhead`:

```
$ ls meshy_test/*.py  | wc -l
28
$ ls meshy_test/*.json | wc -l
36
```

**28 Python scripts and 36 JSON configs.** Earlier write-ups quoted three different figures;
28/36 is the measured number — re-run the two commands above rather than trusting any prose
count, including this one, once scripts are added or consolidated.

The ones worth copying into a new project (the rest are one-off experiments):

- **`run_battleship.py`** — cleanest single-model Meshy generator (preview → refine →
  download). Copy and change only the prompt. `run_bomber.py` is the same thing generating
  **two** models in one run (multi-asset template).
- **`render_frames.py`** — the workhorse config-driven headless Blender renderer:
  multi-frame animation sampling, per-unit azimuth, wobble, bbox-fit camera, Icosphere
  filter. `blender -b -P render_frames.py -- config.json`.
- **`build_bomber_sprite.py`** — simplest single-still renderer with explicit `elev/az/roll`
  args. Best starting point when still hunting for the camera angle.
- **`postprocess.py`** — alpha-bbox trim with the shared union bbox across frames.
- **`split_render.py`** — splits a fused GLB into base + part (hull vs turret) via bmesh.
- **`inspect_battleship.py`** — mesh count, per-object verts, bbox, longest axis. Run this
  FIRST on every new GLB (`ASSERT_FORWARD_AXIS`).
- **`build_lcvp.py` / `build_lst.py`** — building a model from Blender primitives when Meshy
  refuses the shape.

## Known Meshy limits on this project — settled, do not re-fight

- **No open-well craft with a bow ramp.** A Higgins boat / LCVP request comes back as a
  closed cabin launch. Two attempts, both failed. Build it from primitives instead
  (`build_lcvp.py`, `build_lst.py`).
- **Prop prompts can come back as diorama-base display pieces** — the object mounted on a
  decorative plinth rather than as a standalone asset.
- **GLBs arrive as ONE FUSED MESH**, so sub-parts need a geometric split (`split_render.py`);
  the battleship was a single 152k-vertex mesh with non-separable turrets.
- **A broadside sprite cannot show guns aimed at the camera** — a geometry wall, not a tuning
  problem. Sell aggression with muzzle flashes and tracer origins instead.
- **Rigged/T-pose models silently drop hand-held props** (~90 credits to learn). Attach the
  prop procedurally from the hand bone matrix.

## Project sizing and cost history

Soldiers render at 512px source and display at ~87px — a ~6× downscale, so intricate prompt
detail is wasted. Decide the on-screen pixel height first.

~20–40 Meshy credits per model (preview + refine); balance was ~1014 credits after this
project's full asset set (`GET /openapi/v1/balance`). GLBs are 10–22 MB — gitignored
(`meshy_test/*.glb`), only rendered PNGs live in the repo. Meshy's server copies expire in
about three days, so download immediately.

## Verification harness (this project)

`screenshot_sink.py` — a tiny HTTP sink on port 8200 that writes POSTed PNGs to `shots/` —
plus an injected `window.saveShot(name)` doing `canvas.toBlob` → `fetch` POST. Judge the
shots with a **different** model against written acceptance criteria. Hidden tabs suspend
rAF, so drive `window.game.debugStep(1/60)` when stepping frames.

---

## Note for Blaine

The skill already exists: `game-asset-pipeline` in `C:\Claude\sarges-skills`, with the 3D lane
at `references/lane-3d-render.md`. It is canonical — new lessons go **there**, and this file
stays project-specific. Related tool-level skills: `skill-blender`, `meshy-3d-generation`,
`pixel-art-studio`, `comfyui-studio`; the pipeline skill sits above them (orchestration and
failure modes, not the tool APIs).
