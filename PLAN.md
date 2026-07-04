# Beachhead — PLAN v1.0 (2026-07-03)

Companion to SPEC.md (same folder — SPEC is the source of truth for all schemas,
contracts, and acceptance criteria). Repo: C:\Claude\Projects\Active\Beachhead
(off-OneDrive). Copy of both docs in OneDrive Projects\Beachhead.

## Model routing
- Fable (this session): SPEC/PLAN + final judging only.
- Sonnet executor: builds every file in one pass against SPEC §4 layout.
- Judge (Fable now; Opus in later sessions): runs SPEC §5 acceptance criteria against
  the RUNNING game + grep test — never trusts executor prose.

## Phases
- **P0 — Scaffold + docs** ✅ repo, git, SPEC, PLAN.
- **P1 — Full v1 build (Sonnet, one shot):** all files per SPEC §4, placeholder vector
  art, Web Audio synth, 5 waves, README with three worked "Adding new content" examples,
  play.bat/play.ps1. Exit = executor self-checks criteria 1–7 locally.
- **P2 — Judge pass (top model):** serve via preview tools, console-error check,
  interaction checks, modularity proof (criterion 8), grep test (criterion 9). Fix loop:
  small fixes inline, big fixes back to Sonnet.
- **P3 — Commit + memory + Confluence log.**

## Future (seams already in v1, do NOT build now)
Bosses via behaviorScript; new fireModes (beam, mine, airstrike); camera pan for true 360°;
endless/campaign mode selection; sprite art via browser-game-builder pipeline (game is
multi-file by design — sprite step would add /assets frames + a sprites registry);
high-score table; mobile touch. If it ever ships commercially: RESKIN_MAP.md pass
(names/art only — mechanics are not copyrightable; "Beachhead" title itself is fine,
but avoid Digital Fusion trade dress).
