# SHORE PATROL — Ship-It Plan (Opus-judge / Sonnet-worker loop)

Created 2026-07-10 (Opus 4.8). Goal: drive the game to **ship-ready** via an
autonomous **worker≠judge** loop — Sonnet/Haiku agents implement, screenshots +
headless checks are captured, **Opus judges each screenshot against explicit
acceptance criteria**, and each workstream **loops until its criteria pass**.

This plan is self-contained and executable by a later session with NO Fable in
the loop. Resume context lives in STATE.md. Repo: `C:\Claude\Projects\Active\Beachhead`.

---

## 0. Finish line (the judge-of-done)

The game is **ship-ready** when ALL workstream criteria below pass a fresh
Opus screenshot review AND the regression checklist (§6) is green AND the live
build at https://shore-patrol.web.app is updated. "Looks ready to ship" is
decided by the Opus judge from screenshots, not by the worker's self-report
(subagents fabricate success — see [[feedback-verify-subagent-claims]]; require
the screenshot artifact + a headless number every time).

---

## 1. Current-state evaluation (measured, 2026-07-10)

| # | Requirement | Status | Gap to close |
|---|---|---|---|
| R1 | 3D models for all **enemies** | ✅ DONE | 7/7 enemies have Blender-rendered sprite frames (infantry, tank, landing_craft, helicopter, commando, commando_craft, tank_lst). |
| R1 | 3D models for all **weapons** | ✅ DONE | 4/4 turret icons (mg/howitzer/sam/pistol); MG re-rendered R7. |
| R1 | 3D models for all **bosses** | ⚠️ PARTIAL | Battleship + damaged variant = 3D sprite ✅. **Bomber (Air-Raid boss) + fighter escorts are still VECTOR primitives** (bosses.js `moveTo/lineTo/fill`, no `assets/frames/bomber*`). NEEDS a 3D bomber (+escort) model. |
| R2 | Enemies advance toward player, **front facing player** | ✅ mostly | Head-on renders (R5). Verify no enemy shows side/back at any range. |
| R2 | Fire **periodically as they advance** | ❌ GAP | `advance_and_fire` STOPS at `standoffD` then fires. Spec wants firing **while still advancing**. |
| R2 | Shots originate from **the right sprite part** (gun barrel / heli missiles) | ❌ GAP | `notifyEnemyFire`/`spawnTracer` emit from the entity **center** (`entity.x,d,alt`). No per-enemy muzzle offset; heli shots don't come from the missile pylons. |
| R3 | Battleship boss **doesn't beach** | ✅ DONE (R8.4) | d=0.55 floats whole hull above the sloped waterline. Regression-guard only. |
| R4 | Air-Raid boss **advances slower** | ❌ GAP | `approachSpeed=0.045`. |
| R4 | Air-Raid boss **doesn't end game until it fully exits the top** (passes over player, escapes after bomb) | ❌ GAP | Currently at `approachZ≥0.85` it opens the bay, +2 s → `nukeDropped`/`nukeDetonated` = game over. It never flies overhead and off the top; player gets no shoot-down window during a pass. |
| R5 | Tide animation matches background waterline **angle** | ✅ DONE (R7/R8) | `drawTidal` slope y345(left)→y440(right); whitecaps on same slope. Regression-guard only. |
| R6 | Hitboxes functional, **mapped to sections where applicable** | ⚠️ VERIFY | Battleship = 5 sections via SHIP_FEATURES ✅. Bomber = bomber+escort circles. Land/sea/air enemies = single `type.hitbox` circle. Need an audit that every enemy is clickable across its whole approach and the circle matches the sprite. |

**Not in the user's list but gates "ship-ready" — treat as P2 polish, judge lightly:**
balance/difficulty ramp, juice (screenshake/hit-flash/score-pops — partly present
from a prior session), audio coverage, and the single-file build (the original
end goal; see FINISH_PLAN.md Phase F/G). Keep these OUT of the core loop unless
the Opus judge flags them as ship-blockers.

---

## 2. Data-driven contract (must hold — do not regress)

All content stays in `data/*.json`; the engine dispatches on generic schema
fields via registries (movementBehaviors, fireMode, shape glyphs). **Grep
contract** (run every workstream): `grep -rniE "howitzer|infantry|helicopter|landing_craft|pistol|commando" src/` must be empty of NEW hits (pre-existing violations in upgradeSystem.js/debug are tracked, not added to). New behavior = new registry key + JSON field, never an id literal in `src/`.

---

## 3. Agent-loop architecture  (roles per Blaine 2026-07-10: **Fable judges, Opus/Sonnet execute**)

```
   Opus (this seat): ORCHESTRATOR + EXECUTOR
     • owns SHIP_PLAN.md; runs one workstream at a time
     • EXECUTES code changes inline (Opus) or delegates mechanical bulk to a Sonnet agent
     • drives window.game/debugStep, saves the exact screenshot to disk via the sink
     • hands the saved PNG + criteria to a FABLE judge agent; on FAIL, fixes and re-judges
     • cap 4 iters/workstream, then escalate + log why it stalled

   Fable (Agent tool, model:"fable"): JUDGE  ── the pixel gate ──
     • Reads the saved screenshot PNG + the workstream's acceptance criteria
     • returns strict PASS / FAIL + specific defects (what's wrong, where)
     • never edits code; judging only. A DIFFERENT model from the executor = real check.

   Sonnet (Agent tool, model:"sonnet"): EXECUTOR for mechanical/bulk work
     • e.g. driving Blender/Meshy render scripts (W1), batch data edits
     • MUST forbid nested Agent spawning; runs node --check + grep contract; returns artifacts

   gemini-analyzer agent → bulk file/log analysis when needed
```

**Why worker≠judge:** the doer is optimistic; the judge must be a *different model*
looking at *pixels*. Fable holds the judge seat (Blaine's call today). Opus never
judges its own output as "done" — it saves the screenshot and lets Fable rule.

### Screenshot-to-disk harness (so Fable can see pixels)
`screenshot_sink.py` (port 8200) writes POSTed PNGs to `shots/`. In the page,
inject `window.saveShot(name)` = `canvas.toBlob → fetch POST → sink writes shots/<name>.png`
(same-origin canvas ⇒ not tainted). Flow per judge: `debugStep`/spawn to set the
scene → `saveShot('wN_case')` → spawn Fable agent: "Read shots/wN_case.png, judge
vs these criteria, return PASS/FAIL + defects." Both servers via `play.bat` + a
background `python screenshot_sink.py 8200 shots`.

### Verification harness (every judge pass)
- Dev server: `play.bat` (serve_nocache.py, port 8123). **It dies mid-session — if `curl -s -o /dev/null -w "%{http_code}" localhost:8123` ≠ 200, restart it in the background before shooting.**
- Load fresh: `navigate` to `localhost:8123/?v=<nonce>`; hidden tabs suspend rAF, so drive `window.game.debugStep(1/60)` in a loop for deterministic frames (ambience/whitecaps update only in the live rAF frame — seed them manually when shooting the tide).
- Spawn on demand: `game.debug.spawnBattleship/spawnBomber/spawnTank/spawnHeli/spawnBoat/spawnInfantry/spawnAmmo/nextRound/killAll/toggleGodMode`.
- Screenshot via the browser tool; zoom for detail. **Console errors:** the `"message channel closed"` EXCEPTION lines are a benign browser-extension artifact — ignore them; only game-origin errors count.

---

## 4. Workstreams (each loops to PASS)

### W1 — Bomber (Air-Raid) 3D model  [worker: Haiku/Sonnet drives Blender/Meshy, then Sonnet wires]
**Do:** generate a WWII/near-future heavy-bomber 3D model (Meshy, key at `C:\Claude\.credentials\meshy.key`), render a **top-down / nose-toward-viewer** frame set in Blender (`render_frames.py` pattern) sized for the z-approach (small→huge). Add a small fighter-escort model too. Install to `assets/frames/bomber*.png` (+ `bomber_escort*.png`), register paths in `main.js collectSpritePaths`, and swap the vector draw in `BomberBoss.draw`/`FighterEscort.draw` for the sprite (keep the vector as fallback, like the battleship).
**Accept (Opus screenshot):** at approachZ 0.1 / 0.5 / 0.95 the bomber reads as a 3D aircraft growing as it nears; escorts read as planes; no vector triangle; 0 game console errors. Headless: `spawnBomber` then `debugStep`, confirm `drawScale` ramps and the sprite path resolves.

### W2 — Air-Raid boss behavior: slower + fly-over-and-exit-top  [worker: Sonnet, code]
**Do:** in `BomberBoss`: (a) reduce `approachSpeed` (~0.045→~0.028; final ~0.06→~0.04) — data-drive it via a boss field if cheap. (b) Rework the end condition: keep the bomb-drop at `approachZ≥0.85`, but after the drop the bomber **keeps advancing past approachZ=1.0** — `drawY` continues from ~80 upward past `-spriteH` and `drawScale` keeps looming — i.e. it passes directly over the player and **exits the top of the screen**. Only when fully off the top (`drawY < -margin`) does the loss resolve (`nukeDetonated`/game-over). If the player kills it before it exits, it dies normally (no bomb loss). The overhead pass is the shoot-down window.
**Accept (Opus screenshot + headless):** drive `spawnBomber` + `debugStep` and log a trajectory — `drawY` decreases to ~80, then continues negative and the sprite leaves the top; `game.state` stays `playing` until `drawY < -<spriteH>`; killing it mid-pass (`boss.hp=0`) does NOT trigger `nukeDetonated`. Screenshot mid-flyover shows the huge bomber overhead. Approach visibly slower than before.

### W3 — Enemies fire *while advancing*  [worker: Sonnet, code + data]
**Do:** change the firing model so `advance_and_fire` (and heli) fire **during the approach**, not only at standoff. Add a data field (e.g. `fireWhileAdvancing: true` + optional `firstFireD`) so an enemy begins periodic fire once `d < firstFireD` while still closing to a (smaller/optional) standoff — or keep advancing all the way. No id branching — pure field dispatch in `movementBehaviors.js`. Tanks/infantry keep facing the player while firing.
**Accept (Opus screenshot + headless):** spawn a tank + infantry; step frames; confirm `fireTimer` triggers `startFiring` at multiple distinct `d` values during approach (not just at standoff). Screenshot shows an enemy mid-screen (still advancing) with a muzzle flash + tracer. Base damage still lands.

### W4 — Shots originate from the correct sprite part  [worker: Sonnet, code + data]
**Do:** add a per-enemy **muzzle offset** in `enemies.json` (e.g. `muzzle: {u,v}` in sprite-space, like the battleship's SHIP_FEATURES, and for the heli `muzzle` = the missile-pylon point). Route `notifyEnemyFire` (flash) and `spawnTracer` (tracer origin) through a shared helper that projects the entity position + the muzzle offset (scaled by sprite size, mirrored by heading) to screen space, so the flash/tracer/shell leaves the **gun barrel / missile pylon**, not the sprite center. Heli should visibly fire from under the stub wings.
**Accept (Opus zoomed screenshot):** tank tracer emerges from the turret barrel tip; infantry from the rifle; heli from the wing pylon — verified at both mirrored headings. Headless: assert the tracer `x1,y1` ≠ entity center projection by the expected offset.

### W5 — Hitbox audit + section mapping  [worker: Sonnet, code; judge: Opus]
**Do:** verify every enemy/boss is clickable across its whole life. Confirm land/sea enemies' `type.hitbox` circle tracks the sprite at all `d` (esp. when close — the R4 rack-occlusion fix). Confirm bomber + escorts are hittable across the flyover (W2 changes their path — update `hitTestScreen` to follow `drawY` past the top). Battleship sections already map via SHIP_FEATURES — regression-check all 5 still resolve and sand/sky miss.
**Accept (headless, scripted):** for each enemy, spawn → step to several `d` → call the boss/entity hit test at the sprite center and confirm a hit; at an off-sprite point confirm a miss. Battleship: all 5 sections hit, sand+sky miss (existing check). Bomber: hittable at approachZ 0.3/0.7/1.1(over-top).

### W6 — Facing + regression sweep  [worker: Sonnet; judge: Opus]
**Do:** confirm R2 facing (every enemy shows its FRONT to the player at all ranges/headings), and run the regression checklist (§6). Fix any enemy that turns its back/side.
**Accept (Opus screenshot montage):** one screenshot per enemy type at mid-approach, all facing the player; regression checklist green.

### W7 — Ship-readiness polish pass  [worker: Sonnet; judge: Opus, light]
**Do (only if Opus flags as blocker):** difficulty/balance sanity (can a competent player clear wave 1–3; is defense drain fair), juice consistency, audio coverage on the new events (bomber flyover, advancing fire). Do NOT scope-creep the single-file build here — that's a separate FINISH_PLAN Phase F/G effort.
**Accept:** Opus judges a full 60–90 s playthrough screenshot set as "looks shippable."

---

## 5. Loop protocol (per workstream)

1. Opus writes the worker brief (files, the ONE change, acceptance criteria, "forbid nested Agent spawning", "return your screenshot path + headless numbers").
2. Sonnet worker implements → `node --check` + grep contract → returns artifacts.
3. **Opus re-verifies independently:** restart server if down → reload no-cache → `debugStep`/spawn → screenshot → judge vs criteria.
4. PASS → commit (`Rn: …`), deploy if user-facing, mark workstream done in STATE.md. FAIL → new Sonnet worker with the failing screenshot + the specific defect; **cap 4 iterations**, then escalate to Opus doing it inline and logging why the loop stalled (no silent infinite loop).
5. After all workstreams PASS → full regression sweep (§6) → deploy → Opus final ship-readiness judgment.

Optional autonomy: the `goal` skill can run this unattended (judge=Opus, workers=Sonnet/Haiku) with the finish-line = "all §4 criteria + §6 green, Opus-confirmed from screenshots." Keep the per-workstream commit + deploy cadence so a crash resumes from STATE.md.

---

## 6. Regression checklist (must stay green every deploy)

- [ ] Battleship floats offshore, whole hull above the sloped waterline (no beaching); slides in horizontally; sits ~centre.
- [ ] Battleship 5 sections hit-test correctly; sand + sky clicks miss; damage FX (scorch/fire/smoke/embers) on the right features; damaged-hull swap when critical.
- [ ] Crates + beach enemies render IN FRONT of the battleship; boss HP panel on top.
- [ ] Tide/whitecaps hug the painted waterline slope (no diagonal cut, no foam on sand).
- [ ] MG weapon icon reads as a gun; all 4 weapon icons present.
- [ ] Win screen (stage 10) + loss decompress + Y/N retry work.
- [ ] Zero game-origin console errors on a fresh load + a boss fight.
- [ ] Grep contract: no NEW id-literal violations in `src/`.

---

## 7. Sequencing

- **Parallel-safe:** W1 (bomber model, art pipeline) ∥ W3+W4 (fire model+origin, code) ∥ W5 hitbox audit script. Different files mostly (bosses.js touched by W1+W2 — serialize those two).
- **Serial:** W2 depends on W1 (bomber sprite) for its screenshots; W6 after W2/W3/W4; W7 last.
- Suggested order: **W3+W4 (fire) → W1 (bomber art) → W2 (bomber behavior) → W5 (hitboxes) → W6 (facing+regression) → W7 (polish) → ship**.

## 8. Ship gate
Deploy `firebase deploy --only hosting` after each user-facing workstream (no-cache headers = instant). Final gate = Opus reviews a fresh live-site playthrough screenshot set and every §4 + §6 box is checked. Then update STATE.md + memory + Confluence project log (p.80511033) and tell Blaine it's shippable (NAME "SHORE PATROL" is still a Blaine gate before any monetized publish).
