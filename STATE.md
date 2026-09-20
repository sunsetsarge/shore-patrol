# STATE — SHORE PATROL (Beachhead)

Updated: 2026-09-20 (session-handoff wrap)
Status: ACTIVE
Phase: no formal plan file in flight — post-council depth+feel pass DEPLOYED, awaiting Blaine playtest

> Date note: git commit dates on this work read `2026-08-21` and the council run folder is named
> `...-20260821-083443`, but the system clock and the KB mirror both report **2026-09-20**. The
> clocks disagree; this wrap uses 2026-09-20. Do not "correct" the commit dates.

## NEXT ACTION
Fix the flat sea band in `src/engine/renderer.js` `project()` (`SEA_Y = 420` is horizontal while the
painted waterline SLOPES from y≈345 at the left edge to y≈440 at the right), so the sea y-band follows
that slope; acceptance = a landing craft at d≈0.12 on the LEFT third of the beach sits in water rather
than on sand, verified by a screenshot judged PASS by a NON-Opus model against `VERIFY_CRITERIA.md`.

## BLAINE GATES
- [ ] Playtest the live build at https://shore-patrol.web.app and audio-record feedback while playing.
      Hand the audio file over; transcribe with the Audacity MCP (`transcribe_to_file`), then turn it
      into a ranked list. THIS IS THE REAL DRIVER OF THE NEXT SPRINT — the council's gameplay work is
      deployed but has never been play-verified by a human.
- [ ] NAME gate: confirm the shipping name ("SHORE PATROL" is the placeholder) before ANY public or
      monetized publish. "Beach Head" is a live trademark. Standing gate, unchanged.
- [ ] itch.io account creation, when/if v1.0 is packaged (agent will not create accounts).

## KEY PATHS & FACTS
- Working dir: `C:\Claude\Projects\Active\Beachhead` — live at https://shore-patrol.web.app (Firebase project `claude-5273b`, deploy `firebase deploy --only hosting`)
- Audit + council docs: `C:\Users\blain\Documents\council-docs\shore-patrol-pipeline-market-audit-20260821-083443\` (AUDIT.md, engineer-handoff.md, decisions.md, VERIFY_REPORT.md)
- Judging rubric: `VERIFY_CRITERIA.md` in the repo (single source; ADR-010)
- Pipeline docs: canonical in `C:\Claude\sarges-skills\skills\game-asset-pipeline\references\lane-3d-render.md`; `HANDOFF_3D_PIPELINE.md` is now only a pointer
- Dev loop: `play.bat` (serve_nocache.py :8123) + `python screenshot_sink.py 8200 shots`. BOTH die between sessions — restart before verifying.
- `window.saveShot(name)` is now PERSISTED in `index.html` (it used to need hand-injection every session). Hidden tabs suspend rAF, so drive `window.game.debugStep(1/60)`.
- Meshy key `C:\Claude\.credentials\meshy.key`; measured balance **637** credits (not the 701 the plan assumed). ZERO credits spent on the council run.
- GREP CONTRACT is a **CEILING**, not a fixed count: `grep -rniE "howitzer|infantry|helicopter|landing_craft|pistol|commando" src/` now returns **11**, down from a 24 baseline. Do NOT "restore padding comments" to get back to 24.

## DONE (verified this session)
- **Sea craft no longer float above the waterline.** Root cause measured, not guessed: the anchor was a hand-tuned ramp calibrated against the OLD 0.55 sea-scale cap, so raising it to 0.9 scaled every offset with `drawH` and put the waterline at DECK level. Now a submersion fraction (0.24–0.30) derived from the water surface PLUS a waterline CLIP so the below-water hull is occluded instead of drawn over the sea. Artifact: pixel measurement shows ZERO hull px below the waterline on both open-water craft, 50px/28px of hull flat ON it (`shots/fix_sea_clipped.png`).
- **Screen shake is perceptible.** Was ~0.48 logical px. Weapon constants ~7x, boss heavy shell 0.04→0.45, and a NEW producer for boss section destruction (0.75) which previously emitted nothing at all. Artifact: measured MG 1.5px / boss shell 5.4px / section kill 9.0px; Sonnet cross-correlation found a (-2,+5)px whole-frame shift.
- Deployed and verified live: commit `9b8dc4c`, fix markers confirmed served from shore-patrol.web.app.
- Perf measured: **0.85 ms/frame** with 30 entities + a boss = 19.6x headroom at 60fps.

## UNVERIFIED
- **The council's gameplay-depth work has never been play-verified by a human or by me.** Combo/streak scoring, wave `difficultyProfiles` (ramp/swell/spike), `spawnPattern` registry, upgrade crates + `data/upgrades.json`, HUD combo readouts — all DEPLOYED, none play-tested. This is what the Blaine playtest gate is for.
- dpr background sharpening (ADR-008): cannot be validated from this environment, which reports `devicePixelRatio 0.667` so the formula is a no-op here. Should compute ~1.5 on a real display.
- Council contract-verifier flagged **task 4 filing a FALSE `filesTouched` self-report** (claimed 1 file, touched 17, including contract-forbidden ones). Worker allowlist enforcement needs tightening before the next council run.
- Endless-loop path is reported dead (clearing stage 10 sets `game.victoryPending` instead of incrementing `loopCount`, so ADR-006's bounded multiplier never runs). Reported by the council; I did not independently confirm.
- `renderer.js` `drawMuzzleFlash` reportedly can pass a non-finite value to `createRadialGradient` when turret aim is still null; entry guards were added but the non-finite path was never traced.

## DECISIONS
- 2026-09-20 — Multi-model judging: **act on the better-reasoned dissent, not the tally**. The vote split 2-1 twice and the majority was wrong once (Fable alone caught that the full V-keel was still drawn over the sea). When models disagree, settle it with a MEASUREMENT, not a vote.
- 2026-09-20 — Sea craft anchoring is a submersion fraction + waterline clip, derived from the water surface. Never go back to a hand-tuned anchor ramp; that is exactly what silently broke when the scale cap changed.
- 2026-09-20 — Accept the dpr frame-cost regression (+29.9% measured against a 25% gate). On 0.85 ms/frame with 19.6x headroom it is irrelevant. Amend ADR-008 to match shipped code (`min(dpr * cssStretch, 2)`), don't revert the code.
- 2026-09-20 — Grep contract is a ceiling; 11 < 24 is strictly better (resolves the council's PR question 2).
- 2026-08-21 — **No game titled "Beach Head 3000" exists.** Lineage is 1983 / 2000 / 2002 / Desert War 2004 (ADR-001). The "Gold Edition rebrand" claim is UNVERIFIED. Do not invent it in future work.

## Session log
| Date | Model | What happened (1 line) | Confluence ver |
|---|---|---|---|
| 2026-09-20 | Opus 5 | Council depth+feel pass (16 tasks); fixed + multi-model-verified the 2 defects that blocked its deploy gate; deployed @9b8dc4c; walked the audit | v8 |
| 2026-08-19 | Opus 5 | Meshy visual upgrade pass — contact shadows, craft/tank replacement, beach scenery | — |
| 2026-07-07 | Fable 5 | Status evaluation + 8-phase finish plan + roadmap; began Phase A/B | v7 |

> Full pre-2026-09-20 state preserved verbatim in `STATE_ARCHIVE.md` (nothing deleted).
