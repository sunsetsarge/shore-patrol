// Canvas-drawn HUD. Per-weapon ammo pips, score, wave name/number, defense
// bar, streak multiplier, "AMMO" flash on empty-fire attempt.
import * as Turret from '../engine/turret.js';
import { currentWaveInfo } from './waveDirector.js';
import { drawTierStrip } from './upgradeSystem.js';

/**
 * Helper to draw text with a dark drop shadow for legibility over bright backgrounds.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {string} text - Text to draw
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {void}
 */
function st(ctx, text, x, y) {
  const fill = ctx.fillStyle;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * Render all HUD elements each frame.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} game - Game state object
 * @returns {void}
 */
export function render(ctx, game) {
  drawDefenseBar(ctx, game);
  drawScorePanel(ctx, game);
  drawTierStrip(ctx, game);   // weapon upgrade tiers above the pips
  drawWeaponPips(ctx, game);
  drawWaveInfo(ctx, game);
  drawComboReadout(ctx, game);
  drawWaveBonus(ctx, game);
  drawEmptyFlash(ctx, game);
}

function drawDefenseBar(ctx, game) {
  const x = 40, y = 20, w = 320, h = 26;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

  // Threat zones behind the fill: safe / warning / critical banding so the
  // 50% and 25% thresholds the colour already switches on are readable.
  ctx.fillStyle = '#3a1010';           // critical zone (0-25%)
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#3a2f10';           // warning zone (25-50%)
  ctx.fillRect(x + w * 0.25, y, w * 0.25, h);
  ctx.fillStyle = '#122a12';           // safe zone (50-100%)
  ctx.fillRect(x + w * 0.5, y, w * 0.5, h);

  const pct = Math.max(0, game.defense) / 100;
  const color = pct > 0.5 ? '#4ade4a' : pct > 0.25 ? '#e0c040' : '#e04040';

  // Below the critical threshold the whole bar pulses to build tension.
  ctx.save();
  if (pct <= 0.25) {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 160));
    ctx.globalAlpha = pulse;
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * pct, h);
  ctx.restore();

  // Threshold tick marks at 50% and 25%.
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  [0.5, 0.25].forEach((t) => {
    const tx = Math.round(x + w * t) + 0.5;
    ctx.beginPath();
    ctx.moveTo(tx, y - 3);
    ctx.lineTo(tx, y + h + 3);
    ctx.stroke();
  });
  ctx.restore();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'left';
  let label = `DEFENSE ${Math.ceil(game.defense)}%`;
  if (pct <= 0.25) {
    ctx.fillStyle = (Math.floor(Date.now() / 300) % 2) ? '#ff6a6a' : '#fff';
    label += '  CRITICAL';
  }
  st(ctx, label, x + 6, y + h + 20);
}

function drawScorePanel(ctx, game) {
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px monospace';
  st(ctx, `SCORE ${game.score}`, 1240, 38);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#aad';
  st(ctx, `BEST ${game.bestScore}`, 1240, 62);
  ctx.fillStyle = game.streak > 1 ? '#ffd24a' : '#999';
  ctx.font = 'bold 18px monospace';
  st(ctx, `STREAK x${game.streak.toFixed(1)}`, 1240, 86);
}

function drawWeaponPips(ctx, game) {
  const turret = game.turret;
  const baseX = 40;
  const baseY = 656;
  const spacing = 162;
  const boxW = 150, boxH = 58;
  turret.weapons.forEach((w, i) => {
    const x = baseX + i * spacing;
    const active = i === turret.activeIndex;
    ctx.fillStyle = active ? 'rgba(255,210,74,0.28)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, baseY, boxW, boxH);
    ctx.strokeStyle = active ? '#ffd24a' : '#666';
    ctx.lineWidth = active ? 3 : 1;
    ctx.strokeRect(x, baseY, boxW, boxH);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    st(ctx, `[${w.key}] ${w.name}`, x + 8, baseY + 22);

    const ammo = turret.ammo[w.id];
    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = ammo === null ? '#8f8' : (ammo === 0 ? '#f66' : '#ddd');
    st(ctx, ammo === null ? 'INF' : `${ammo}`, x + 8, baseY + 44);

    if (ammo !== null) {
      const capacity = w.ammo || 1;
      const pipW = boxW - 16;
      const pct = Math.max(0, ammo / capacity);
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 8, baseY + 50, pipW, 5);
      ctx.fillStyle = pct > 0.3 ? '#4ade4a' : '#e04040';
      ctx.fillRect(x + 8, baseY + 50, pipW * pct, 5);
    }
  });
}

function drawWaveInfo(ctx, game) {
  const info = currentWaveInfo(game);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';

  const loopCount = (game.waveState && game.waveState.loopCount) || info.loopCount || 0;
  let label;
  if (info.isLooping) {
    label = `STAGE 10 (LOOP x${loopCount})`;
  } else {
    const total = info.total || 10;
    label = `STAGE ${info.id}/${total}`;
    if (loopCount > 0) label += ` (LOOP x${loopCount})`;
  }
  // Highlight boss stages in orange
  if (info.hasBoss && !info.isLooping) {
    ctx.fillStyle = '#ff9944';
  }
  st(ctx, label, 640, 36);
  ctx.fillStyle = '#fff'; // reset

  if (info.banner) {
    const alpha = Math.min(1, info.banner.timer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(340, 140, 600, 74);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 2;
    ctx.strokeRect(340, 140, 600, 74);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(info.banner.text.toUpperCase(), 640, 188);
    ctx.restore();
  }
}

/**
 * Draw the combo readout and timer bar.
 * Combo state lives on the game object (scoring system). Everything here is
 * guarded so the HUD still renders if those fields are absent.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} game - Game state object with combo and comboTimer properties
 * @returns {void}
 */
function drawComboReadout(ctx, game) {
  const combo = game.combo || 0;
  if (combo <= 1) return;
  // Kept clear of the SCORE/BEST/STREAK stack (x 1100-1264, y 20-96).
  const right = 1240, y = 116;
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = combo >= 10 ? '#ff8a3a' : '#ffd24a';
  st(ctx, `COMBO x${combo}`, right, y);

  // Remaining combo window as a draining bar under the readout.
  const win = game.comboWindow || 2.5;
  const left = Math.max(0, Math.min(win, game.comboTimer || 0));
  if (left > 0) {
    const barW = 120, barH = 6, bx = right - barW, by = y + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = left / win > 0.35 ? '#ffd24a' : '#e04040';
    ctx.fillRect(bx, by, barW * (left / win), barH);
  }
}

/**
 * Draw end-of-wave bonus flash. Uses a timer when the scoring system supplies one,
 * otherwise shows the value while it stays non-zero.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} game - Game state object with lastWaveBonus and lastWaveBonusTimer properties
 * @returns {void}
 */
function drawWaveBonus(ctx, game) {
  const bonus = game.lastWaveBonus || 0;
  if (!bonus) return;
  const t = game.lastWaveBonusTimer;
  let alpha = 1;
  if (typeof t === 'number') {
    if (t <= 0) return;
    alpha = Math.min(1, t / 0.6);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#8fe08f';
  st(ctx, `WAVE BONUS +${bonus}`, 1240, 148);
  ctx.restore();
}

function drawEmptyFlash(ctx, game) {
  if (game.turret.emptyFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = game.turret.emptyFlashTimer / 0.15 * 0.5;
    ctx.fillStyle = '#ff3030';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AMMO', game.turret.aimX, game.turret.aimY - 32);
    ctx.restore();
  }
}
