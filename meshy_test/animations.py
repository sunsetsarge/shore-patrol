"""Meshy animation action-id registry for the SHORE PATROL pipeline.

Before this module the action ids were five hardcoded magic numbers spread
across four scripts. Each entry below records the script and line the value
was read from, so the mapping stays auditable.

    from animations import ACTIONS, action_id
    meshy_api.create("/openapi/v1/animations",
                     {"rig_task_id": rig, "action_id": action_id("death")})
"""

from typing import Dict

# name -> Meshy action_id
ACTIONS: Dict[str, int] = {
    # Shot_and_Fall_Backward.
    # Read from run_p2_batch.py:39 (comment at run_p2_batch.py:36);
    # same value reused at run_soldiers_v2.py:48.
    "death": 183,

    # Walk_Forward_While_Shooting.
    # Read from run_p3_batch.py:36 (comment at run_p3_batch.py:35);
    # same value at run_p3b.py:7 and run_soldiers_v2.py:48.
    "combat_walk": 234,

    # Side_Shot.
    # Read from run_r4_anims.py:27 (comment at run_r4_anims.py:26).
    "fire": 104,

    # Rifle_Charge.
    # Read from run_p3_batch.py:36 (comment at run_p3_batch.py:35).
    # WARNING: 511 has UNUSABLE ROOT MOTION -- the rig translates away from the
    # origin over the clip, so rendered frames drift out of the sprite bbox.
    # Prefer "combat_walk" (234) unless the root motion is stripped in Blender
    # first. See okf/research/confluence-mirror-audit.md.
    "rifle_charge": 511,
}

# Action names that must not be rendered straight out of Meshy.
UNUSABLE_ROOT_MOTION: frozenset[str] = frozenset({"rifle_charge"})


def action_id(name: str) -> int:
    """Look up an action id by name; raise KeyError with the valid names listed."""
    try:
        return ACTIONS[name]
    except KeyError:
        raise KeyError(f"unknown action {name!r}; known: {sorted(ACTIONS)}")
