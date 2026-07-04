# Beachhead — Phase 1: Pre-rendered 3D Sprite Frames (SPEC, 2026-07-04)

Goal: replace single-frame AI sprites with frames rendered from Meshy 3D models —
consistent lighting/style + real animation. Engine stays 2D; contract stays data-only.
Background + crate keep the existing ComfyUI art (they're good).

## 1. Assets

| unit | source | frames |
|---|---|---|
| infantry | test soldier ALREADY DONE (meshy_test/walking.glb) | 8 walk-cycle frames |
| commando | new Meshy: tan uniform + dark beret + SMG, t-pose → remesh 100k → rig → walking.glb | 8 walk-cycle frames |
| tank | new Meshy: WWII light tank, olive, stylized (no rig) | 1 frame |
| landing_craft | new Meshy: WWII Higgins landing craft, gray, stylized (no rig) | 1 frame |
| helicopter | new Meshy: attack helicopter gunship, dark gray, stylized (no rig) | 1 frame |

Meshy gotcha (proven 2026-07-04): refine outputs ~375k faces > 300k rig limit —
remesh to 100k before rigging. Budget ≈130 credits for the 4 new models.

## 2. Engine contract (frame arrays)

- `sprite` field on enemy/crate defs: string (static, current behavior) OR array of
  path strings (animation frames).
- New optional `spriteFps` (default 8). Current frame = `floor(entity.age * spriteFps) % frames.length`.
- Preload collects every path (strings + array members). Fallback rules unchanged:
  any frame not yet loaded → vector glyph. `spriteScale` applies as today.
- Grep contract intact (no content ids in src/). README "Optional sprite art" section
  updated to document arrays + spriteFps.

## 3. Blender render recipe (headless)

- Blender 5.1: `"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b -P render_frames.py -- <in.glb> <outdir> <nframes>`
- Fresh empty scene (delete default objects), import GLB.
- Film: transparent. Color mgmt: standard. Res 768×768, Cycles OR Eevee (Eevee fine, faster).
- Lighting: sun key from upper-front-left (matching background's sun), soft fill.
- Camera: perspective, positioned FRONT of the model, elevation ~10° looking slightly
  down (bunker's-eye view), model framed with ~8% margin, full body visible.
  **Verify orientation with a test render — GLB forward axis varies. The unit must
  face the camera (walking toward the player).**
- Animated GLBs: find the action's frame range, render nframes evenly spaced across
  ONE gait cycle (walking clips loop; use the full action range).
- Static: single render at frame 0.
- Post (PIL): compute the UNION alpha bbox across all frames of a unit and crop every
  frame with that SAME box (prevents animation jitter), then scale to height ≤512,
  save `assets/frames/<unit>_<i>.png`.

## 4. Acceptance criteria

1. `assets/frames/` contains infantry_0..7, commando_0..7, tank_0, landing_craft_0,
   helicopter_0 — transparent, subject facing camera, no cut-off limbs, union-bbox
   aligned (soldier feet don't slide vertically between frames).
2. Engine: string sprite still works; array sprite animates at spriteFps; zero console
   errors; grep test clean; debugStep/window.game intact.
3. In-game: infantry + commando visibly animate walking; tank/craft/heli show rendered
   art; ComfyUI background + crate unchanged.
4. Committed; Confluence log v1.3; memory updated.
