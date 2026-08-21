// Weapon upgrade crate system.
// Tracks per-category tiers, shows floating panel on landed crates,
// and applies stat boosts to live turret weapon defs.
import { project } from '../engine/renderer.js';

// ── Tier definitions ──────────────────────────────────────────────────────────
// Loaded from data/upgrades.json at init(). Kept as a live module-level object
// (same exported symbol other code binds to) whose keys are category keys and
// whose values are the tier arrays for that category. No weapon id appears as
// a literal in this file.
export const weaponTiers = {};

// Panel categories, in draw order. Populated from the same data file.
let CATEGORIES = [];

const PANEL_W     = 234;
const BTN_H       = 40;
let   PANEL_H     = 36 + BTN_H + 6 + 8; // recomputed in init() from CATEGORIES
const LANDED_TTL  = 10.0; // seconds before a landed crate vanishes

function screenDist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the upgrade system with loaded upgrade tier definitions.
 * @param {Object} game - Game state object to initialize
 * @param {Object} data - Loaded game data containing upgrade definitions
 * @returns {void}
 */
export function init(game, data) {
  const categories = (data && data.upgrades && data.upgrades.categories) || [];
  if (categories.length === 0) {
    throw new Error('upgradeSystem.init: data.upgrades.categories is empty — data/upgrades.json missing or malformed');
  }
  CATEGORIES = categories.map(c => ({ key: c.key, label: c.label, color: c.color }));
  for (const key of Object.keys(weaponTiers)) delete weaponTiers[key];
  for (const c of categories) weaponTiers[c.key] = c.tiers;
  PANEL_H = 36 + CATEGORIES.length * (BTN_H + 6) + 8;

  // Every category starts at tier 0 — keys derived from the loaded data.
  game.weaponTiers = {};
  for (const c of CATEGORIES) game.weaponTiers[c.key] = 0;
  game.upgradePanel = null; // { crate, sx, sy } when open
  game.activeUpgrades = {}; // upgradeType -> { remaining }
}

/**
 * Handle mouse clicks on upgrade crates and UI. Returns true if the click was consumed.
 * Call from main.js BEFORE WeaponSystem.handleInputEvent on 'fireStart' events.
 * @param {Object} game - Game state object with crates and panel state
 * @param {number} screenX - Screen-space X coordinate of click
 * @param {number} screenY - Screen-space Y coordinate of click
 * @returns {boolean} True if the click was consumed (panel interaction or crate collection)
 */
export function handleClick(game, screenX, screenY) {
  if (game.upgradePanel) {
    return _handlePanelClick(game, screenX, screenY);
  }

  // Check for a click on a landed crate
  if (game.crates) {
    for (const c of game.crates) {
      if (c.dead || !c.landed) continue;
      const { sx, sy, scale } = project(c.x, 0, 0.02, 'air');
      if (screenDist(screenX, screenY, sx, sy) <= 44 * scale) {
        if (c.type.upgradeType) {
          applyUpgrade(game, c.type);
          c.dead = true;
          c.collected = false; // already applied; skip the ammo path
          return true;
        }
        game.upgradePanel = { crate: c, sx, sy };
        return true; // consumed — don't fire weapon
      }
    }
  }
  return false;
}

/**
 * Draw the upgrade panel UI if it is open.
 * Call each frame from renderPlaying after HUD.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} game - Game state object with upgrade panel
 * @returns {void}
 */
export function draw(ctx, game) {
  if (!game.upgradePanel) return;
  _drawPanel(ctx, game);
}


// ── Non-weapon upgrade registry ───────────────────────────────────────────────
// Keyed by the crate's data-driven `upgradeType` string — never by crate id.
// Each handler: (game, def) => void. Timed effects register themselves in
// game.activeUpgrades with a `remaining` seconds counter and an `expire` hook.

const RAPID_FIRE_FACTOR = 0.5;
const MAX_UPGRADE_DURATION = 30; // seconds — hard bound on any timed effect

export const upgradeEffects = {
  // Turret armour repair: raise defense, clamped to 100.
  repair(game, def) {
    const amount = def.amount || 0;
    game.defense = Math.min(100, (game.defense || 0) + amount);
  },

  // Timed power-up: temporarily scale every weapon's cooldown down.
  rapidFire(game, def) {
    const duration = Math.min(MAX_UPGRADE_DURATION, def.amount || 0);
    if (duration <= 0) return;
    const existing = game.activeUpgrades.rapidFire;
    if (existing) {
      // Already active — refresh the timer, don't stack the cooldown scaling.
      existing.remaining = Math.min(MAX_UPGRADE_DURATION, duration);
      return;
    }
    const weapons = (game.turret && game.turret.weapons) || [];
    const saved = [];
    for (const w of weapons) {
      if (typeof w.cooldown === 'number') {
        saved.push({ weapon: w, cooldown: w.cooldown });
        w.cooldown = w.cooldown * RAPID_FIRE_FACTOR;
      }
    }
    game.activeUpgrades.rapidFire = {
      remaining: duration,
      expire() {
        for (const s of saved) s.weapon.cooldown = s.cooldown;
      },
    };
  },
};

// Apply a crate definition carrying an `upgradeType`. Returns true if handled.
export function applyUpgrade(game, def) {
  const handler = def && def.upgradeType && upgradeEffects[def.upgradeType];
  if (!handler) return false;
  if (!game.activeUpgrades) game.activeUpgrades = {};
  handler(game, def);
  game.scoreApi && game.scoreApi.onCrateCollected(250);
  game.audio && game.audio.play('crate');
  return true;
}

// Tick timed upgrades. Called from crateSystem.update (already runs each frame).
export function updateTimedUpgrades(game, dt) {
  const active = game.activeUpgrades;
  if (!active) return;
  for (const key of Object.keys(active)) {
    const entry = active[key];
    entry.remaining -= dt;
    if (entry.remaining <= 0) {
      if (typeof entry.expire === 'function') entry.expire();
      delete active[key];
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _handlePanelClick(game, screenX, screenY) {
  const panel  = game.upgradePanel;
  // Must match the formula in _drawPanel exactly
  const panelX = Math.max(8, Math.min(panel.sx - PANEL_W / 2, 1280 - PANEL_W - 8));
  const panelY = Math.max(8, panel.sy - PANEL_H - 24);

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat  = CATEGORIES[i];
    const btnY = panelY + 32 + i * (BTN_H + 6);
    if (screenX >= panelX + 6 && screenX <= panelX + PANEL_W - 6 &&
        screenY >= btnY       && screenY <= btnY + BTN_H) {
      const currentTier = game.weaponTiers[cat.key];
      const maxTier     = weaponTiers[cat.key].length - 1;
      if (currentTier < maxTier) {
        game.weaponTiers[cat.key] = currentTier + 1;
        _applyTier(game, cat.key);
        game.audio && game.audio.play('crate');

        // Data-driven reach bonus (e.g. the top sidearm tier's easter egg):
        // any tier def may carry `onReachBonus` = score awarded on reaching it.
        const reached = weaponTiers[cat.key][game.weaponTiers[cat.key]];
        if (reached && typeof reached.onReachBonus === 'number') {
          game.scoreApi && game.scoreApi.onKill(reached.onReachBonus);
        }
      }
      // Consume the crate (not shot, no ammo refill)
      if (panel.crate) {
        panel.crate.dead      = true;
        panel.crate.collected = false;
      }
      game.upgradePanel = null;
      return true;
    }
  }

  // Click outside panel — close without upgrading
  if (screenX < panelX - 12 || screenX > panelX + PANEL_W + 12 ||
      screenY < panelY - 12  || screenY > panelY + PANEL_H + 12) {
    game.upgradePanel = null;
  }
  return true; // always consume clicks when panel is open
}

function _applyTier(game, weaponKey) {
  const tier    = game.weaponTiers[weaponKey];
  const tierDef = weaponTiers[weaponKey][tier];
  const turret  = game.turret;
  const weaponDef = turret.weapons.find(w => w.id === weaponKey);
  if (!weaponDef) return;

  weaponDef.name = tierDef.name;
  if (tierDef.damage     !== undefined) weaponDef.damage     = tierDef.damage;
  if (tierDef.cooldown   !== undefined) weaponDef.cooldown   = tierDef.cooldown;
  if (tierDef.splashRadius !== undefined) weaponDef.splashRadius = tierDef.splashRadius;

  if (tierDef.ammo !== undefined) {
    const prevAmmo = turret.ammo[weaponKey] || 0;
    weaponDef.ammo = tierDef.ammo;
    if (tierDef.ammo !== null) {
      // Top up by half the new capacity, but don't exceed it
      turret.ammo[weaponKey] = Math.min(
        tierDef.ammo,
        prevAmmo + Math.ceil(tierDef.ammo * 0.5),
      );
    }
  }
}

function _drawPanel(ctx, game) {
  const panel   = game.upgradePanel;
  const CW      = ctx.canvas.width;
  const panelX  = Math.max(8, Math.min(panel.sx - PANEL_W / 2, CW - PANEL_W - 8));
  const panelY  = Math.max(8, panel.sy - PANEL_H - 24);

  ctx.save();

  // Background
  ctx.fillStyle = 'rgba(8,12,20,0.92)';
  ctx.fillRect(panelX, panelY, PANEL_W, PANEL_H);
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, PANEL_W, PANEL_H);

  // Title
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#ffd24a';
  ctx.textAlign = 'center';
  ctx.fillText('⬆  WEAPON UPGRADE', panelX + PANEL_W / 2, panelY + 20);

  ctx.textAlign = 'left';
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat         = CATEGORIES[i];
    const currentTier = game.weaponTiers[cat.key];
    const maxTier     = weaponTiers[cat.key].length - 1;
    const isMaxed     = currentTier >= maxTier;
    const btnX        = panelX + 6;
    const btnY        = panelY + 30 + i * (BTN_H + 6);
    const btnW        = PANEL_W - 12;

    // Button bg
    ctx.fillStyle = isMaxed ? 'rgba(60,60,60,0.5)' : `${cat.color}28`;
    ctx.fillRect(btnX, btnY, btnW, BTN_H);
    ctx.strokeStyle = isMaxed ? '#444' : cat.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, BTN_H);

    // Category label
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = isMaxed ? '#555' : '#eee';
    ctx.fillText(cat.label, btnX + 8, btnY + 14);

    // Tier arrow (current → next)
    ctx.font = '9px monospace';
    if (isMaxed) {
      ctx.fillStyle = '#555';
      ctx.fillText('MAX TIER', btnX + 8, btnY + 30);
    } else {
      const cur  = weaponTiers[cat.key][currentTier];
      const next = weaponTiers[cat.key][currentTier + 1];
      ctx.fillStyle = cat.color;
      ctx.fillText(`${cur.name}  →  ${next.name}`, btnX + 8, btnY + 30);
    }
  }

  // Connector line to crate
  ctx.strokeStyle = '#ffd24a88';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(panelX + PANEL_W / 2, panelY + PANEL_H);
  ctx.lineTo(panel.sx, panel.sy - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ── Tier strip for HUD ────────────────────────────────────────────────────────
// Draw a compact strip showing current tier name for each category.
// Call from hud.js render() passing game.weaponTiers.
export function drawTierStrip(ctx, game) {
  if (!game.weaponTiers) return;
  const stripY  = 618;  // just above the weapon pip boxes (which start at 656)
  const spacing = 162;
  const baseX   = 40;

  ctx.save();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat   = CATEGORIES[i];
    const tier  = game.weaponTiers[cat.key] || 0;
    const tDef  = weaponTiers[cat.key][tier];
    const x     = baseX + i * spacing;
    const isMax = tier >= weaponTiers[cat.key].length - 1;

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = isMax ? '#ffd24a' : cat.color;
    ctx.textAlign = 'left';
    ctx.fillText(tDef.name, x + 4, stripY);

    // Tier pips (dots)
    const maxT = weaponTiers[cat.key].length - 1;
    for (let t = 0; t <= maxT; t++) {
      ctx.fillStyle = t <= tier ? cat.color : '#333';
      ctx.beginPath();
      ctx.arc(x + 4 + t * 10, stripY + 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
