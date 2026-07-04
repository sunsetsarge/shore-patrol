# Beachhead — 3D Models & Physics: Research + Recommendation (2026-07-03)

Question: should Beachhead move to 3D models for better graphics and physics?

## The case against (read this first)

1. **"Physics" buys almost nothing in this genre.** [Inferred, high confidence]
   A stationary-turret shooter has no player movement, no vehicles you drive, no
   stacking, no emergent interactions. Everything a physics engine would simulate
   here is cosmetic: shell arcs (already faked convincingly), ragdoll deaths,
   debris, parachute sway. Beach Head 2000 itself was not physics-driven. Adding
   Rapier/Havok adds a dependency, a tuning burden, and nondeterminism — and zero
   gameplay depth. If the itch is "explosions should feel juicier," that's a
   particles-and-screenshake problem, not a physics-engine problem.

2. **A 3D rewrite is not a renderer swap — it invalidates the verified core.** [Known, from the codebase]
   renderer.js is cleanly isolated, but collision, aiming, movement behaviors,
   splash math, and the wave feel all operate in the fake 2.5D `(x, d, alt)`
   space. Real 3D means raycast hit-testing, a real camera, 3D movement, and
   re-tuning every number in the data files. That's a v2 project (multiple
   sessions), not an upgrade — and the current v1 was play-verified today.

3. **AI text-to-3D is prop-grade, not character-grade.** [Inferred from reviews + Funko experience]
   Meshy-class tools (1-minute generations, PBR, auto-rig) are genuinely good for
   tanks, boats, crates — hard-surface props. Stylized *characters* with clean
   rigs and animation cycles remain the weak spot; expect manual Blender cleanup.
   The Funko project already demonstrated the "AI 3D quality ceiling" problem
   first-hand.

4. **The project's stated virtue is inspectability.** [Known, SPEC §0]
   No-build vanilla JS + JSON modding is why a non-coder can extend it. Three.js
   keeps that mostly intact (one script include); Godot/Unity kill it.

## What "3D" could actually mean — four options, ranked

### A. Pre-rendered 3D → sprites (RECOMMENDED — this is how the classics did it)
Generate/download 3D models → Blender (MCP already installed and battle-tested) →
render to 2D frames → feed the existing `sprite` fields. C&C, Diablo, StarCraft,
and Beach Head-era games were all pre-rendered 3D; that's the exact look.
- **Graphics win:** consistent lighting/angle across all units (the current
  DreamShaper sprites each have slightly different style/lighting), plus real
  **animation**: walk cycles, turret rotation, death falls, rotor spin — render N
  frames per unit instead of 1.
- **Engine cost:** small — extend the sprite field to accept a frame array
  (`"sprite": ["assets/infantry_0.png", ...]` + fps). One Sonnet session,
  contract-preserving.
- **Asset sources:** Meshy (skill installed; free tier = CC-BY 4.0 attribution,
  paid = private license/full ownership [Known]); 3D AI Studio (skill installed);
  free WWII packs on Sketchfab/OpenGameArt (check licenses per-asset).
- **Physics:** n/a — but "fake juice" (ragdoll-ish death frames, debris sprites)
  comes free as rendered frames.

### B. Three.js renderer swap, keep the data-driven core (the real "Beachhead 3D" — v2, later)
Keep JSON contract (swap `sprite` for `model` fields), map `(x,d,alt)` to world
XYZ, raycast for hit-testing, real camera in the bunker. Three.js: ~168 KB, no
build step required (ES module import — fits the ethos). Add **Rapier** (the
current default web physics engine, WASM, actively maintained) ONLY for cosmetic
ragdolls/debris/crate sway.
- Effort: 2–4 focused sessions (Sonnet execute, top-model judge). Re-tune all
  gameplay numbers afterward.
- This is the only option where "physics" earns its keep, and even then it's
  decorative.

### C. Babylon.js
Batteries-included (integrated physics, scene tooling) but ~1.4 MB and more
framework lock-in. For a solo hobby project of this size, Three.js's smaller
surface wins; Babylon pays off for bigger simulations. Not recommended here.

### D. Godot 4 rebuild
Real engine, real editor, and web export is finally sane (4.3+ single-threaded
default, no SharedArrayBuffer headers needed [Known]) — but exports run tens of
MB, and it abandons the inspectable single-repo + JSON-modding contract
entirely. Blaine already has a Godot lane (Bounty Hunter X); if Beachhead ever
becomes a "real game," port there deliberately. Overkill for an arcade toy.

## Recommendation

**Phase 1 (do now, ~1 session):** Option A. Generate 5 unit models via Meshy
(paid tier if shipping anywhere public, for the private license) or free packs,
render 4–8 animation frames each in Blender via the MCP (fixed camera matching
the game's view), extend the engine's sprite field to frame arrays. Result:
visibly "3D" units, consistent art direction, animated — no engine risk.

**Phase 2 (only if Phase 1 still leaves the itch):** Option B as a `v2-three`
branch. Keep data files as the contract; Rapier for death/debris cosmetics only.

**Don't:** adopt a physics engine as a goal in itself, or rebuild in
Godot/Unity for this project.

Confidence: the option landscape and effort estimates are [Inferred] from the
codebase + current ecosystem; licensing and Godot-export facts are [Known] from
vendor docs/search (July 2026); AI-character-rig quality is [Inferred/Guessed]
from reviews and prior local experience — validate with one Meshy test model
before committing to Phase 1's asset source.

## Sources
- Three.js vs Babylon comparisons: utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison; blog.logrocket.com/three-js-vs-babylon-js
- Meshy licensing/quality: help.meshy.ai (commercial-use article); meshy.ai/blog/best-ai-tools-for-3d-game-assets; medium.com Meshy 2026 review
- Godot web export: godotengine.org/article/progress-report-web-export-in-4-3; best-games.io Godot web optimization guide
- Pre-render pipeline: viniguerrero.itch.io/pre-render-creator (Blender add-on)
