// All canvas drawing. Domain-color-coded, shape-keyed glyph registry — no
// enemy/weapon id branching. Shapes come from data (enemy.shape), colors from
// data (enemy.color / weapon.color), domain-based background bands are fixed
// per SPEC (land/sea/air), not per specific enemy.
//
// Optional data-driven sprite rendering: entity/crate defs may carry a
// `sprite` (path) + `spriteScale` (number) field. When present AND the image
// is fully loaded (per sprites.js), the sprite is drawn instead of the
// vector glyph. Missing/failed/not-yet-loaded sprite => vector glyph
// fallback, so the game renders identically to today when no `sprite`
// fields exist anywhere in the data.

import * as Sprites from './sprites.js';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const HORIZON_Y = 260;
const SEA_Y = 420;
const BEACH_Y = 640;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// project(x, d, alt) -> {sx, sy, scale}
// domain optional: 'land' | 'sea' | 'air' (ground default = land band)
export function project(x, d, alt = 0, domain = 'land') {
  const scale = lerp(1.0, 0.18, clamp01(d));
  let sy;
  if (domain === 'air') {
    sy = lerp(320, 80, clamp01(alt)) - d * 120;
    sy = Math.max(40, sy);
  } else {
    const horizonYForDomain = domain === 'sea' ? 260 : 420;
    sy = lerp(640, horizonYForDomain, clamp01(d));
  }
  const sx = 640 + x * 640 * lerp(1.0, 0.55, clamp01(d));
  return { sx, sy, scale };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Invert projection: given a screen y and a domain band, estimate world d.
export function unprojectD(sy, domain) {
  if (domain === 'air') {
    // sy = lerp(320,80,alt) - d*120  => approximate with alt=0.3 default hover band
    const approxAlt = 0.5;
    const base = lerp(320, 80, approxAlt);
    const d = clamp01((base - sy) / 120);
    return clamp01(d);
  }
  const horizonYForDomain = domain === 'sea' ? 260 : 420;
  // sy = lerp(640, horizonYForDomain, d) => d = (640-sy)/(640-horizonYForDomain)
  const t = (640 - sy) / (640 - horizonYForDomain);
  return clamp01(t);
}

export function unprojectX(sx, d) {
  const factor = lerp(1.0, 0.55, clamp01(d));
  return (sx - 640) / (640 * factor);
}

// -------------------- glyph registry (shape -> draw fn) --------------------
// draw(ctx, screenX, screenY, scale, color, entity)
const glyphRegistry = {
  biped(ctx, sx, sy, scale, color) {
    const s = 26 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy - s * 1.3, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx - s * 0.22, sy - s * 1.0, s * 0.44, s * 0.9);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.15);
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.3, sy - s * 0.1);
    ctx.lineTo(sx - s * 0.35, sy + s * 0.6);
    ctx.moveTo(sx + s * 0.3, sy - s * 0.1);
    ctx.lineTo(sx + s * 0.35, sy + s * 0.6);
    ctx.stroke();
  },
  tank(ctx, sx, sy, scale, color) {
    const s = 40 * scale;
    ctx.fillStyle = color;
    ctx.fillRect(sx - s * 0.7, sy - s * 0.3, s * 1.4, s * 0.5);
    ctx.fillRect(sx - s * 0.35, sy - s * 0.55, s * 0.7, s * 0.3);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(sx, sy - s * 0.45);
    ctx.lineTo(sx + s * 0.7, sy - s * 0.55);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(sx - s * 0.7, sy - s * 0.3, s * 1.4, s * 0.5);
  },
  boat(ctx, sx, sy, scale, color) {
    const s = 46 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.8, sy);
    ctx.lineTo(sx - s * 0.55, sy - s * 0.35);
    ctx.lineTo(sx + s * 0.55, sy - s * 0.35);
    ctx.lineTo(sx + s * 0.8, sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(sx - s * 0.25, sy - s * 0.6, s * 0.5, s * 0.3);
  },
  heli(ctx, sx, sy, scale, color, entity) {
    const s = 34 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx + s * 0.5, sy - s * 0.06, s * 0.5, s * 0.12);
    const spin = (entity && entity.age ? entity.age * 18 : 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.save();
    ctx.translate(sx, sy - s * 0.35);
    ctx.rotate(spin);
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, 0);
    ctx.lineTo(s * 0.9, 0);
    ctx.stroke();
    ctx.restore();
  },
};

export function drawEntityGlyph(ctx, entity, sx, sy, scale) {
  const type = entity.type || {};
  const shape = type.shape;
  const color = type.color || '#ffffff';

  const img = type.sprite ? Sprites.get(type.sprite) : null;
  if (img) {
    const spriteScale = type.spriteScale || 1.0;
    const domain = type.domain;
    const drawH = (type.hitbox || 26) * 2.4 * scale * spriteScale;
    const drawW = drawH * (img.naturalWidth / img.naturalHeight);
    if (domain === 'air') {
      // center-anchored at (sx, sy)
      ctx.drawImage(img, sx - drawW / 2, sy - drawH / 2, drawW, drawH);
    } else {
      // bottom-anchored at (sx, sy) for land/sea domains
      ctx.drawImage(img, sx - drawW / 2, sy - drawH, drawW, drawH);
    }
  } else {
    const fn = glyphRegistry[shape];
    if (fn) {
      fn(ctx, sx, sy, scale, color, entity);
    } else {
      // fallback glyph for unknown shapes — still domain-agnostic, no crash
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, 20 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // simple hp bar above entity if damaged (kept working regardless of sprite/glyph)
  if (entity.maxHp > 0 && entity.hp < entity.maxHp) {
    const w = 40 * scale;
    const h = 4;
    const barY = sy - 46 * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - w / 2, barY, w, h);
    ctx.fillStyle = '#5aff5a';
    ctx.fillRect(sx - w / 2, barY, w * clamp01(entity.hp / entity.maxHp), h);
  }
}

// -------------------- background --------------------
const BACKGROUND_SPRITE = 'assets/background.png';

export function drawBackground(ctx, t) {
  const bgImg = Sprites.get(BACKGROUND_SPRITE);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
    // Keep the animated waterline shimmer overlay even with the background
    // image in place — everything else (procedural sky/sea/beach fills) is
    // skipped since the image already covers the full canvas.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = HORIZON_Y + (i + 1) * ((SEA_Y - HORIZON_Y) / 9);
      const offset = Math.sin(t * 1.2 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(0, y + offset);
      for (let x = 0; x <= CANVAS_W; x += 40) {
        ctx.lineTo(x, y + Math.sin(t * 1.5 + x * 0.02 + i) * 3);
      }
      ctx.stroke();
    }
    return;
  }

  // sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  skyGrad.addColorStop(0, '#0a0e1a');
  skyGrad.addColorStop(1, '#1c2b40');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y);

  // stars (static twinkle by position hash)
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % CANVAS_W;
    const y = (i * 53) % HORIZON_Y;
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
    ctx.globalAlpha = 0.3 + 0.4 * tw;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // sea
  const seaGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, SEA_Y);
  seaGrad.addColorStop(0, '#13324a');
  seaGrad.addColorStop(1, '#0d4a5c');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, HORIZON_Y, CANVAS_W, SEA_Y - HORIZON_Y);

  // sea wave lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const y = HORIZON_Y + (i + 1) * ((SEA_Y - HORIZON_Y) / 9);
    const offset = Math.sin(t * 1.2 + i) * 6;
    ctx.beginPath();
    ctx.moveTo(0, y + offset);
    for (let x = 0; x <= CANVAS_W; x += 40) {
      ctx.lineTo(x, y + Math.sin(t * 1.5 + x * 0.02 + i) * 3);
    }
    ctx.stroke();
  }

  // beach
  const beachGrad = ctx.createLinearGradient(0, SEA_Y, 0, BEACH_Y);
  beachGrad.addColorStop(0, '#c2a35a');
  beachGrad.addColorStop(1, '#8a6f3a');
  ctx.fillStyle = beachGrad;
  ctx.fillRect(0, SEA_Y, CANVAS_W, BEACH_Y - SEA_Y);

  // beach texture dots
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % CANVAS_W;
    const y = SEA_Y + ((i * 53) % (BEACH_Y - SEA_Y));
    ctx.fillRect(x, y, 3, 3);
  }

  // bunker foreground
  const bunkerGrad = ctx.createLinearGradient(0, BEACH_Y, 0, CANVAS_H);
  bunkerGrad.addColorStop(0, '#2b2b2b');
  bunkerGrad.addColorStop(1, '#131313');
  ctx.fillStyle = bunkerGrad;
  ctx.fillRect(0, BEACH_Y, CANVAS_W, CANVAS_H - BEACH_Y);

  // parapet crenellations
  ctx.fillStyle = '#1a1a1a';
  const crenW = 60;
  for (let x = 0; x < CANVAS_W; x += crenW * 2) {
    ctx.fillRect(x, BEACH_Y - 14, crenW, 14);
  }

  // sandbags either side
  ctx.fillStyle = '#5a4a30';
  ctx.beginPath();
  ctx.ellipse(60, BEACH_Y + 30, 90, 26, 0, 0, Math.PI * 2);
  ctx.ellipse(1220, BEACH_Y + 30, 90, 26, 0, 0, Math.PI * 2);
  ctx.fill();
}

// -------------------- turret --------------------
export function drawTurret(ctx, turret) {
  const originX = 640;
  const originY = 700;
  const barrelLen = 90;
  let angle = turret.barrelAngle;
  // clamp visible elevation so barrel never points below parapet
  const maxDown = Math.PI * 0.42; // roughly downward clamp
  const minUp = -Math.PI * 0.95;
  angle = Math.max(minUp, Math.min(maxDown, angle));

  ctx.save();
  ctx.translate(originX, originY);
  // mount base
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(0, 0, 34, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle);
  ctx.fillStyle = '#444';
  ctx.fillRect(0, -8, barrelLen, 16);
  ctx.fillStyle = '#222';
  ctx.fillRect(barrelLen - 10, -10, 10, 20);
  ctx.restore();
}

export function drawMuzzleFlash(ctx, turret, alpha) {
  const originX = 640;
  const originY = 700;
  let angle = turret.barrelAngle;
  const maxDown = Math.PI * 0.42;
  const minUp = -Math.PI * 0.95;
  angle = Math.max(minUp, Math.min(maxDown, angle));
  const tipX = originX + Math.cos(angle) * 90;
  const tipY = originY + Math.sin(angle) * 90;
  ctx.save();
  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 26);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(1, 'rgba(255,140,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawTracer(ctx, x1, y1, x2, y2, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function drawExplosion(ctx, sx, sy, radiusPx, t01, color = '#ffb347') {
  ctx.save();
  const r = radiusPx * (0.3 + 0.7 * t01);
  const alpha = 1 - t01;
  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  grad.addColorStop(0, '#fff6d0');
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawProjectile(ctx, sx, sy, color, size = 5) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCrate(ctx, sx, sy, scale, color, crateType) {
  const sprite = crateType && crateType.sprite;
  const img = sprite ? Sprites.get(sprite) : null;
  if (img) {
    const spriteScale = (crateType && crateType.spriteScale) || 1.0;
    const drawH = 90 * scale * spriteScale;
    const drawW = drawH * (img.naturalWidth / img.naturalHeight);
    // bottom-anchored at (sx, sy)
    ctx.drawImage(img, sx - drawW / 2, sy - drawH, drawW, drawH);
    return;
  }
  const s = 30 * scale;
  // parachute
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - s, sy - s * 1.6);
  ctx.lineTo(sx - s * 0.35, sy - s * 0.5);
  ctx.moveTo(sx + s, sy - s * 1.6);
  ctx.lineTo(sx + s * 0.35, sy - s * 0.5);
  ctx.moveTo(sx, sy - s * 1.8);
  ctx.lineTo(sx, sy - s * 0.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(sx - s, sy - s * 1.6);
  ctx.quadraticCurveTo(sx, sy - s * 2.4, sx + s, sy - s * 1.6);
  ctx.closePath();
  ctx.fill();
  // crate box
  ctx.fillStyle = color;
  ctx.fillRect(sx - s * 0.4, sy - s * 0.5, s * 0.8, s * 0.7);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(sx - s * 0.4, sy - s * 0.5, s * 0.8, s * 0.7);
}

export function drawReticle(ctx, x, y, shape, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else if (shape === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x + 16, y);
    ctx.lineTo(x, y + 16);
    ctx.lineTo(x - 16, y);
    ctx.closePath();
    ctx.stroke();
  } else {
    // cross
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 6, y);
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 6);
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

export const CONSTANTS = { CANVAS_W, CANVAS_H, HORIZON_Y, SEA_Y, BEACH_Y };
