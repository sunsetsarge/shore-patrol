// Canvas-drawn HUD. Per-weapon ammo pips, score, wave name/number, defense
// bar, streak multiplier, "AMMO" flash on empty-fire attempt.
import * as Turret from '../engine/turret.js';
import { currentWaveInfo } from './waveDirector.js';

// Text with a dark drop shadow for legibility over the bright sky/sand.
function st(ctx, text, x, y) {
  const fill = ctx.fillStyle;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function render(ctx, game) {
  drawDefenseBar(ctx, game);
  drawScorePanel(ctx, game);
  drawWeaponPips(ctx, game);
  drawWaveInfo(ctx, game);
  drawEmptyFlash(ctx, game);
}

function drawDefenseBar(ctx, game) {
  const x = 40, y = 20, w = 320, h = 26;
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
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'left';
  st(ctx, `DEFENSE ${Math.ceil(game.defense)}%`, x + 6, y + h + 20);
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

  let label;
  if (info.isLooping) {
    label = `STAGE 10 (LOOP x${info.loopCount})`;
  } else {
    const total = info.total || 10;
    label = `STAGE ${info.id}/${total}`;
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
