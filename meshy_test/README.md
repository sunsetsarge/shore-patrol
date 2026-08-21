# meshy_test/ — SHORE PATROL 3D asset pipeline scratch directory

This directory is where Meshy text-to-3D output is generated, rendered through
headless Blender, and trimmed into game sprites. It grew organically, so most
of what is here is exploration residue rather than a repeatable pipeline.

Rules for the render stage live in the `game-asset-pipeline` skill and
`HANDOFF_3D_PIPELINE.md`; this file only describes the contents of *this*
directory.

## Measured size (2026-08-21)

```
$ cd C:/Claude/Projects/Active/Beachhead/meshy_test
$ ls *.py | wc -l
30
$ ls *.json | wc -l
36
```

(30 counts the two consolidated modules: meshy_api.py, animations.py; 28 pre-existing scripts.)

## The dominant cost is Rule 1, camera angle

The single biggest time sink in this directory is **not** model generation —
it is finding a camera angle that produces a readable silhouette. That is what
the ~36 JSON render configs are: the same model re-rendered at a different
azimuth/elevation/FOV until it read correctly on the canvas. The `renders_*`
directory sprawl (`renders_sweep`, `renders_r4`, `renders_r5`, `renders_r5p`,
`renders_cand`, ...) is the same story in image form. Budget iteration time for
camera angle first; generation is comparatively cheap and fast.

See `okf/research/asset-pipeline-audit-reconciled.md` and
`okf/research/skill-feedback-loop.md` in the audit workflow for the full
finding; the render-stage assertion names are documented by
`okf/research/lane-3d-render.md` (task 12) and are not restated here.

## Shared modules (current — use these for new work)

| File | Purpose |
|---|---|
| `meshy_api.py` | One Meshy API wrapper: `create()`, `poll()`, `download()`, `balance()`, one error path with 429 exponential backoff. Key from `MESHY_API_KEY` else `C:\Claude\.credentials\meshy.key`. Run it directly for a zero-credit self-check. |
| `animations.py` | `ACTIONS` registry mapping names to Meshy action ids (`death`=183, `combat_walk`=234, `fire`=104, `rifle_charge`=511), each annotated with the script it was read from. `rifle_charge` (511) has unusable root motion. |

Both are **additive**. No existing script was modified, so every prior run
stays reproducible exactly as it was.

## Which scripts are current vs. exploration leftovers

Classified by last-modified date plus what each script produces. Anything not
in the "current" table is retained only for reproducibility of a past run.

**Current (latest asset revision, 2026-08-19 vessel/upgrade pass):**

- `build_lcvp.py`, `build_lst.py` — parameterized-ish vessel builds producing
  `lcvp_v2.glb` / `lst_v2.glb`.
- `run_visual_upgrade.py` — the 2026-08-19 visual upgrade run.
- `render_candidates.py` — camera-angle candidate sweep renderer (the Rule 1 loop).
- `postprocess.py` — PIL alpha-bbox trim + data JSON emit; still the tail of every run.

**Exploration leftovers (kept, do not extend):**

- Soldier/animation era, 2026-07-04: `run_batch.py`, `run_rig.py`,
  `run_remesh_rig.py`, `run_retex.py`, `run_test.py`, `run_p2_batch.py`,
  `run_p3_batch.py`, `run_p3b.py`, `run_soldiers_v2.py` — these are the four
  places the action ids were hardcoded, now superseded by `animations.py`.
- Debug/probe one-offs: `debug_bbox.py`, `debug_bbox2.py`, `probe_hands.py`,
  `inspect_bones.py`, `inspect_battleship.py`.
- Superseded per-asset runs: `run_r4_anims.py`, `run_r5_boats.py`,
  `run_battleship.py`, `build_battleship_guns.py`, `run_mg2.py`,
  `run_bomber.py`, `build_bomber_sprite.py`, `render_frames.py`,
  `split_render.py`.

The 36 JSON files are a mix of render configs (`*_cfg.json`) and run results
(`batch_results.json`, `metadata.json`, `soldiers_v2.json`, `p2_results.json`,
`pass1.json`, `pass2.json`). Only the results files are read by scripts; the
`*_cfg.json` files carry no record of which was the accepted angle.

## Known pipeline limits (do not re-fight)

- Meshy will not produce open-well craft (a Higgins boat with a bow ramp comes
  back as a cabin launch).
- Prop prompts can return diorama-base display pieces.
- GLBs arrive as ONE FUSED MESH; sub-parts need a geometric split.
- A broadside sprite cannot show guns aimed at the camera without ugly
  foreshortening.
