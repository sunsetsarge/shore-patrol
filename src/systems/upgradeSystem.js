// Weapon upgrade crate system.
// Tracks per-category tiers, shows floating panel on landed crates,
// and applies stat boosts to live turret weapon defs.
import { project } from '../engine/renderer.js';

// ── Tier definitions ──────────────────────────────────────────────────────────
export const weaponTiers = {
  mg: [
    { name: 'M60 MG',       damage: 3,  ammo: 300, cooldown: 0.12 },
    { name: '.50 Cal',       damage: 5,  ammo: 350, cooldown: 0.10 },
    { name: 'Twin .50/30mm', damage: 7,  ammo: 400, cooldown: 0.08 },
    { name: 'M134 Minigun',  damage: 10, ammo: 500, cooldown: 0.05 },
    { name: 'Twin Minigun',  damage: 14, ammo: 600, cooldown: 0.04 },
  ],
  howitzer: [
    { name: 'Bazooka',       damage: 30,  ammo: 6,  splashRadius: 60  },
    { name: 'Mortar',        damage: 45,  ammo: 8,  splashRadius: 80  },
    { name: '75mm Howitzer', damage: 60,  ammo: 12, splashRadius: 120 },
    { name: '105mm How.',    damage: 90,  ammo: 16, splashRadius: 160 },
  ],
  sam: [
    { name: 'LAW Rocket',   damage: 40,  ammo: 4  },
    { name: 'RPG-7',        damage: 55,  ammo: 6  },
    { name: 'Stinger SAM',  damage: 80,  ammo: 8  },
    { name: 'ICBM',         damage: 999, ammo: 1  }, // one-shot screen-clear
  ],
  pistol: [
    { name: 'Revolver',     damage: 1,  ammo: null },
    { name: 'M1911',        damage: 2,  ammo: null },
    { name: 'Desert Eagle', damage: 3,  ammo: null },
    { name: 'Golden Gun',   damage: 99, ammo: null }, // "Licensed to Kill"
  ],
};

const CATEGORIES = [
  { key: 'mg',       label: '🔫 MG',         color: '#44aa44' },
  { key: 'howitzer', label: '💣 Explosive',  color: '#ff6600' },
  { key: 'sam',      label: '🚀 Missile',    color: '#4488ff' },
  { key: 'pistol',   label: '🔒 Sidearm',    color: '#cc88ff' },
];

const PANEL_W     = 234;
const BTN_H       = 40;
const PANEL_H     = 36 + CATEGORIES.length * (BTN_H + 6) + 8;
const LANDED_TTL  = 10.0; // seconds before a landed crate vanishes

function screenDist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function init(game) {
  game.weaponTiers  = { mg: 0, howitzer: 0, sam: 0, pistol: 0 };
  game.upgradePanel = null; // { crate, sx, sy } when open
}

// Call from main.js BEFORE WeaponSystem.handleInputEvent on 'fireStart' events.
// Returns true if the click was consumed (no weapon fire should happen).
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
        game.upgradePanel = { crate: c, sx, sy };
        return true; // consumed — don't fire weapon
      }
    }
  }
  return false;
}

// Call each frame from renderPlaying after HUD.
export function draw(ctx, game) {
  if (!game.upgradePanel) return;
  _drawPanel(ctx, game);
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

        // Golden Gun easter egg
        if (cat.key === 'pistol' && game.weaponTiers.pistol >= 3) {
          game.scoreApi && game.scoreApi.onKill(1000);
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
