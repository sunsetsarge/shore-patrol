// Canvas-drawn HUD. Per-weapon ammo pips, score, wave name/number, defense
// bar, streak multiplier, "AMMO" flash on empty-fire attempt.
import * as Turret from '../engine/turret.js';
import { currentWaveInfo } from './waveDirector.js';

export function render(ctx, game) {
  drawDefenseBar(ctx, game);
  drawScorePanel(ctx, game);
  drawWeaponPips(ctx, game);
  drawWaveInfo(ctx, game);
  drawEmptyFlash(ctx, game);
}

function drawDefenseBar(ctx, game) {
  const x = 40, y = 20, w = 300, h = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#3a1010';
  ctx.fillRect(x, y, w, h);
  const pct = Math.max(0, game.defense) / 100;
  const color = pct > 0.5 ? '#4ade4a' : pct > 0.25 ? '#e0c040' : '#e04040';
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * pct, h);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`DEFENSE ${Math.ceil(game.defense)}%`, x + 6, y + h + 16);
}

function drawScorePanel(ctx, game) {
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`SCORE ${game.score}`, 1240, 32);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#aad';
  ctx.fillText(`BEST ${game.bestScore}`, 1240, 52);
  ctx.fillStyle = game.streak > 1 ? '#ffd24a' : '#888';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`STREAK x${game.streak.toFixed(1)}`, 1240, 72);
}

function drawWeaponPips(ctx, game) {
  const turret = game.turret;
  const baseX = 40;
  const baseY = 660;
  const spacing = 150;
  turret.weapons.forEach((w, i) => {
    const x = baseX + i * spacing;
    const active = i === turret.activeIndex;
    ctx.fillStyle = active ? 'rgba(255,210,74,0.25)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, baseY, 140, 46);
    ctx.strokeStyle = active ? '#ffd24a' : '#555';
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(x, baseY, 140, 46);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`[${w.key}] ${w.name}`, x + 6, baseY + 16);

    const ammo = turret.ammo[w.id];
    ctx.font = '12px monospace';
    ctx.fillStyle = ammo === null ? '#8f8' : (ammo === 0 ? '#f66' : '#ddd');
    ctx.fillText(ammo === null ? 'INF' : `${ammo}`, x + 6, baseY + 34);

    if (ammo !== null) {
      // pip bar
      const capacity = w.ammo || 1;
      const pipW = 128;
      const pct = Math.max(0, ammo / capacity);
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 6, baseY + 38, pipW, 4);
      ctx.fillStyle = pct > 0.3 ? '#4ade4a' : '#e04040';
      ctx.fillRect(x + 6, baseY + 38, pipW * pct, 4);
    }
  });
}

function drawWaveInfo(ctx, game) {
  const info = currentWaveInfo(game);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  const label = info.isLooping ? `WAVE ${info.id} (LOOP x${info.loopCount + 1})` : `WAVE ${info.id}/5`;
  ctx.fillText(label, 640, 30);

  if (info.banner) {
    const alpha = Math.min(1, info.banner.timer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(340, 140, 600, 70);
    ctx.strokeStyle = '#ffd24a';
    ctx.strokeRect(340, 140, 600, 70);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(info.banner.text.toUpperCase(), 640, 185);
    ctx.restore();
  }
}

function drawEmptyFlash(ctx, game) {
  if (game.turret.emptyFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = game.turret.emptyFlashTimer / 0.15 * 0.5;
    ctx.fillStyle = '#ff3030';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AMMO', game.turret.aimX, game.turret.aimY - 30);
    ctx.restore();
  }
}
