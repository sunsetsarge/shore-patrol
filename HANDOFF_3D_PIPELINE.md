# HANDOFF — 3D Asset Production Pipeline (Meshy → Blender → game sprites)

Paste the block below into a fresh Claude Code session in the **target project**. It carries the
working pipeline *and* the failure modes that cost real time/credits to discover in SHORE PATROL
(`C:\Claude\Projects\Active\Beachhead`). Everything referenced here is verified to exist on this PC
as of 2026-07-12.

---

## THE PROMPT (copy from here down)

You are taking over a proven **3D-asset production pipeline** that was built and hardened on another
game project (SHORE PATROL, a browser Beach Head 2000 clone). I want to use the same pipeline to
produce assets for THIS project. Read this whole brief before generating anything.

### What the pipeline is

Text prompt → **Meshy** text-to-3D (GLB) → **headless Blender** render to PNG frame(s) → **PIL** trim
→ install into the game's `assets/` → wire into data JSON. The game engine stays 2D; every "3D model"
in the shipped game is a **pre-rendered sprite**. There is no runtime 3D.

This is the right architecture when: you want 3D-looking assets, you're on HTML5 canvas / a 2D engine,
and you don't want a WebGL renderer, physics, or a 40MB model payload.

### Prerequisites (all present on this machine)

| Thing | Location / value |
|---|---|
| Meshy API key | `C:\Claude\.credentials\meshy.key` (also `MESHY_API_KEY` env var) |
| Meshy API base | `https://api.meshy.ai`, `Authorization: Bearer <key>` |
| Blender (headless) | `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (4.3 also installed) |
| Python (for PIL/requests) | `C:\AI-Shared\python.exe` (3.10) |
| Reference implementation | `C:\Claude\Projects\Active\Beachhead\meshy_test\` |

### Reusable scripts to COPY (don't rewrite these)

From `C:\Claude\Projects\Active\Beachhead\meshy_test\`:

- **`run_battleship.py`** — cleanest single-model Meshy generator (preview → refine → download).
  Copy and change only the prompt. `run_bomber.py` is the same thing generating **two** models in one
  run (use it as the multi-asset template).
- **`render_frames.py`** — the workhorse config-driven headless Blender renderer. Handles multi-frame
  animation sampling, per-unit azimuth, wobble, bbox-fit camera, the Icosphere filter. Driven by a
  JSON config: `blender -b -P render_frames.py -- config.json`.
- **`build_bomber_sprite.py`** — simplest single-still renderer with explicit `elev/az/roll` args.
  Best starting point for a NEW asset where you're still hunting for the right camera angle.
- **`postprocess.py`** — alpha-bbox trim with the **shared union bbox** across frames (see Rule 6).
- **`split_render.py`** — splits a fused GLB into base + part (e.g. hull vs turret) via bmesh.
- **`inspect_battleship.py`** — prints mesh count, per-object vert counts, bbox, and which axis is
  longest. **Run this FIRST on every new GLB** — it tells you if the model is one fused mesh and which
  way it's facing.
- **`build_lcvp.py` / `build_lst.py`** — building a model from Blender **primitives** when Meshy
  refuses a shape (see Rule 4).

### The pipeline, step by step

1. **Generate.** Copy `run_battleship.py`, swap the prompt, run it with `MESHY_API_KEY` set. It does
   `mode:"preview"` → poll → `mode:"refine"` (with `preview_task_id`, `enable_pbr:true`) → poll →
   download GLB + thumbnail. Check the thumbnail before spending render time.
2. **Inspect.** `blender -b -P inspect_battleship.py -- <model.glb>` → mesh count, verts, dims, longest
   axis. This determines whether you can separate parts and what the model's forward axis is.
3. **Find the camera angle.** Render 3–4 candidate `elev/az` values with `build_bomber_sprite.py`,
   montage them side by side with PIL, and pick. **Do not guess a single angle** — see Rule 1, this is
   where the most time gets wasted.
4. **Render final.** Either the single-still script or `render_frames.py` with a config for animation
   frames / multiple azimuths.
5. **Trim + install.** Alpha bbox + ~4–8px pad, scale to target height (LANCZOS), write into
   `assets/`. Use `postprocess.py`'s shared-bbox logic if you have base+part pairs.
6. **Wire + verify.** Register the path so it preloads, reference it from data JSON, then
   **screenshot the running game and have a different model judge it** (Rule 9).

---

### THE HARD-WON RULES — this is the actual value of this handoff

**Rule 1 — The camera angle must match how the object MOVES on screen. This is the #1 time sink.**
Render the object as the player will see it *in motion*, not as a nice product shot. On SHORE PATROL
the bomber was rendered from straight below (`elev -88`) — a perfect belly view that read as the plane
*sliding in belly-first*, which the user immediately rejected. Re-rendering at `elev -40` (front-3/4
from below) put the **nose leading in the direction of travel** and it read correctly. Rule of thumb:
whatever end of the object moves first on screen must be the end pointing that way in the sprite.
Enemies advancing toward a bottom-screen player → render **head-on** (az ~270–290).

**Rule 2 — Meshy models arrive as ONE FUSED MESH. You cannot rotate sub-parts.**
The SHORE PATROL battleship was a single 152k-vertex mesh — the gun turrets were not separable
objects. Any plan that depends on "rotate just the turret / open just the hatch" needs either
`split_render.py` (geometric split by centroid) or a separately-generated part. Verify with
`inspect_battleship.py` **before** promising that behavior.

**Rule 3 — A side/broadside sprite fundamentally cannot show guns aimed at the camera.**
This is a geometry wall, not a tuning problem. On SHORE PATROL three separate attempts (aim-at-camera,
aim-down, aim-down-forward) all foreshortened into ugly poles. Either render the object at a 3/4 angle
from the start, or accept the broadside read and sell the aggression with **muzzle flashes + tracer
origins** instead of barrel direction. **Never** stick flat 2D vector shapes (canvas `lineTo` barrels)
on top of a photoreal render — it looks terrible and was rejected on sight.

**Rule 4 — Meshy refuses certain shapes; build those from primitives.**
Open-well / concave craft (Higgins boat, LST with bow doors) failed twice on Meshy. The fix was
`build_lcvp.py` / `build_lst.py` — assembling the shape from Blender primitives in a script. Faster
than fighting the generator. Symptom: the model comes back as a generic closed hull.

**Rule 5 — Meshy T-pose/rigged models silently DROP hand-held props.**
Ask for "soldier holding a rifle" and you get a soldier with empty hands (~90 credits learned the hard
way). Fix: attach the prop procedurally in Blender from the hand **bone matrix** (`probe_hands.py`,
`inspect_bones.py`). Note the hand-to-hand grip line is diagonal, NOT the aim axis — you must aim
along character-forward, and `transform_apply` before using `matrix_world`.

**Rule 6 — Base + part sprites MUST be trimmed with ONE SHARED UNION BBOX.**
If you trim a hull and its turret independently, their alpha bboxes differ and the overlay drifts.
Compute the union bbox across all frames/parts, crop everything to it, then draw both at the identical
destination rect. `postprocess.py` implements this. This is what makes part-compositing (spinning
rotors, aiming turrets) pixel-locked.

**Rule 7 — Blender headless gotchas.**
- Use **absolute** output paths. Relative paths write to CWD, not where you think.
- **Create the output dir first** (`os.makedirs`) — Blender silently fails otherwise. Cost me a
  round-trip on the bomber.
- `view_transform = 'Standard'` (Filmic washes game sprites out). `film_transparent = True`, RGBA PNG.
- **`bpy.ops.mesh.separate` is a TRAP on glTF imports** — stale edge/face select flags re-select
  everything. Use a bmesh face-centroid split, and `bpy.data.objects.remove()` the original or
  visibility passes resurrect it.
- Meshy rigged exports contain a stray ~42-vertex **"Icosphere"** placeholder. Filter it out by name
  and vert-count before computing the bbox or it wrecks your framing.
- For **underside/belly views you need a strong underlight + ambient world fill**, or you render a
  black silhouette. Two suns is not enough; add a `world` background node at ~0.5 strength.
- Refine output is ~375k faces, above the ~300k rigging limit → **remesh to ~100k before rigging**.

**Rule 8 — Single-frame azimuth tests are USELESS on animated models.**
Walk-cycle root rotation means one frame lies about the facing. Sweep multiple frames. On SHORE PATROL
the soldiers' walk anim aimed ~70° off body-facing, needing an explicit `aim_vec` + az290 correction.

**Rule 9 — Verify with a screenshot judged by a DIFFERENT model.**
Do not trust "it looks right to me," and do not trust a subagent's prose claim that it worked. The
loop that worked: save the running game's canvas to a PNG on disk → spawn an agent with a *different*
model → have it read the image against explicit acceptance criteria → PASS/FAIL + defects. In this
session that loop caught two real defects a self-review missed (a stray muzzle blast at a tank's feet;
a muzzle flash too faint to read as the shot origin). Harness: `screenshot_sink.py` (a tiny HTTP sink
that writes POSTed PNGs to `shots/`) + an injected `window.saveShot(name)` that does
`canvas.toBlob → fetch POST`.

**Rule 10 — Size the sprite for its ON-SCREEN size, then render 2–3× that.**
SHORE PATROL renders soldiers at 512px source and displays them at ~87px — a 6× downscale. Not
harmful (downscaling stays crisp) but all fine detail is thrown away, so intricate prompt detail is
wasted effort. Decide the on-screen pixel height first.

**Rule 11 — Damage/variant states: post-process the PNG, don't re-model.**
The battleship's battle-damaged variant was made by running the clean render through PIL (desaturate +
darken, soot streak gradients, blast-crater radial darkening, warm ember cores). Seconds, not credits.

### Costs

Roughly **20–40 Meshy credits per model** (preview + refine). Balance was ~1014 credits after this
project's full asset set. Check with `GET /openapi/v1/balance`. GLBs are 10–22MB — **gitignore them**
(`meshy_test/*.glb`) and keep only the rendered PNGs in the repo; Meshy's server copies expire in ~3 days,
so download immediately.

### Your first task in this project

1. Tell me what assets this project needs and what the on-screen presentation is (viewing angle,
   direction of travel, target on-screen pixel size).
2. Copy the scripts listed above into this project's tooling folder.
3. Generate ONE asset end-to-end as a pilot, using the candidate-angle montage step (Rule 1), and show
   me the montage before committing to a final render.

Do not skip Rule 1 or Rule 9. Those two are where every previous round of rework came from.

## (END OF PROMPT)

---

## Notes for Blaine (not part of the prompt)

- This is a strong candidate to become a **skill** in `C:\Claude\sarges-skills` (e.g. `3d-sprite-pipeline`)
  rather than a copy-pasted prompt — the rules above are exactly the "hard-won, would-repeat-the-mistake"
  content skills are for. Say the word and I'll build it with skill-creator.
- Related existing skills: `skill-blender`, `meshy-3d-generation`, `pixel-art-studio`, `comfyui-studio`.
  This pipeline sits above them (it's the orchestration + failure modes, not the tool API).
