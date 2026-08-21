// All canvas drawing. Domain-color-coded, shape-keyed glyph registry — no
// enemy/weapon id branching. Shapes come from data (enemy.shape), colors from
// data (enemy.color / weapon.color), domain-based background bands are fixed
// per SPEC (land/sea/air), not per specific enemy.
//
// Optional data-driven sprite rendering: entity/crate defs may carry a
// `sprite` (path, OR an array of paths for an animation frame sequence) +
// `spriteScale` (number) field. When present AND the image is fully loaded
// (per sprites.js), the sprite is drawn instead of the vector glyph.
// Missing/failed/not-yet-loaded sprite => vector glyph fallback, so the game
// renders identically to today when no `sprite` fields exist anywhere in
// the data.
//
// Animation: if `sprite` is an array, the current frame index is
// floor(entity.age * spriteFps) % frames.length (spriteFps defaults to 8).
// If that specific frame isn't loaded yet, fall back to the vector glyph —
// no partial-frame/hold-last-frame cleverness.

const DEFAULT_SPRITE_FPS = 8;

// resolveSpritePath(sprite, spriteFps, age) -> path string or null.
// sprite may be a static path string or an array of frame path strings.
export function resolveSpritePath(sprite, spriteFps, age) {
  if (!sprite) return null;
  if (!Array.isArray(sprite)) return sprite;
  if (sprite.length === 0) return null;
  const fps = spriteFps || DEFAULT_SPRITE_FPS;
  const idx = Math.floor((age || 0) * fps) % sprite.length;
  return sprite[idx];
}

import * as Sprites from './sprites.js';

// resolveOneShotFramePath(frames, fps, age) -> path string or null.
// Same frame-index math as resolveSpritePath but CLAMPED to the last frame
// instead of looping via modulo — used for one-shot animations (death) that
// must hold their final frame rather than restart.
export function resolveOneShotFramePath(frames, fps, age) {
  if (!frames || frames.length === 0) return null;
  const f = fps || DEFAULT_SPRITE_FPS;
  const idx = Math.min(frames.length - 1, Math.floor((age || 0) * f));
  return frames[idx];
}

const CANVAS_W = 1280;
const CANVAS_H = 720;
const HORIZON_Y = 260;
const SEA_Y = 420;
const BEACH_Y = 640;

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// project(x, d, alt) -> {sx, sy, scale}
// domain optional: 'land' | 'sea' | 'air' (ground default = land band)
// Sea has its own y-band (WATERLINE_Y..HORIZON_Y) and scale range distinct
// from land, so craft hand off plausibly in size to land units at d=0.
export function project(x, d, alt = 0, domain = 'land') {
  const d01 = clamp01(d);
  let sy, scale;
  if (domain === 'air') {
    scale = lerp(1.0, 0.18, d01);
    sy = lerp(320, 80, clamp01(alt)) - d * 120;
    sy = Math.max(40, sy);
  } else if (domain === 'sea') {
    scale = lerp(0.9, 0.18, d01);
    sy = lerp(SEA_Y, HORIZON_Y, d01);
  } else {
    scale = lerp(1.0, 0.18, d01);
    sy = lerp(640, 420, d01);
  }
  const sx = 640 + x * 640 * lerp(1.0, 0.55, d01);
  return { sx, sy, scale };
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Invert projection: given a screen y and a domain band, estimate world d.
// Must mirror project()'s per-domain y formula exactly (used by ballistic
// aiming so shells aimed at the sea band land where the cursor is).
export function unprojectD(sy, domain) {
  if (domain === 'air') {
    // sy = lerp(320,80,alt) - d*120  => approximate with alt=0.3 default hover band
    const approxAlt = 0.5;
    const base = lerp(320, 80, approxAlt);
    const d = clamp01((base - sy) / 120);
    return clamp01(d);
  }
  if (domain === 'sea') {
    // sy = lerp(SEA_Y, HORIZON_Y, d) => d = (SEA_Y-sy)/(SEA_Y-HORIZON_Y)
    const t = (SEA_Y - sy) / (SEA_Y - HORIZON_Y);
    return clamp01(t);
  }
  // sy = lerp(640, 420, d) => d = (640-sy)/(640-420)
  const t = (640 - sy) / (640 - 420);
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
  boat(ctx, sx, sy, scale, color, entity) {
    // LCVP / Higgins boat — 3/4-above view.
    // Bow (ramp side) faces SHORE = bottom of screen (sy); stern toward horizon (top).
    const rampDown = entity && entity.flags && entity.flags.rampDown;
    const w = 34 * scale;   // hull beam
    const h = 22 * scale;   // hull depth stern→bow on screen

    // Hull body — tapered at stern, square at bow
    ctx.fillStyle = '#56563a';
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.48, sy);           // bow port
    ctx.lineTo(sx - w * 0.50, sy - h * 0.80); // port mid
    ctx.lineTo(sx - w * 0.40, sy - h);        // stern port
    ctx.lineTo(sx + w * 0.40, sy - h);        // stern star
    ctx.lineTo(sx + w * 0.50, sy - h * 0.80); // star mid
    ctx.lineTo(sx + w * 0.48, sy);            // bow star
    ctx.closePath();
    ctx.fill();

    // Gunwale outline
    ctx.strokeStyle = '#3a3a28';
    ctx.lineWidth = Math.max(1, scale * 1.5);
    ctx.stroke();

    // Vertical rib lines along hull
    ctx.strokeStyle = '#44442e';
    ctx.lineWidth = Math.max(0.5, scale * 0.8);
    for (let i = 1; i < 4; i++) {
      const rx = sx - w * 0.44 + i * (w * 0.88 / 4);
      ctx.beginPath();
      ctx.moveTo(rx, sy - h * 0.05);
      ctx.lineTo(rx, sy - h * 0.90);
      ctx.stroke();
    }

    // Engine housings at stern corners
    ctx.fillStyle = '#303020';
    const eW = w * 0.18, eH = h * 0.14;
    ctx.fillRect(sx - w * 0.50, sy - h - eH, eW, eH);
    ctx.fillRect(sx + w * 0.50 - eW, sy - h - eH, eW, eH);

    // Bow ramp
    ctx.fillStyle = '#484830';
    if (rampDown) {
      // Ramp dropped flat ahead of bow onto beach/water
      const rampW = w * 0.75;
      ctx.fillRect(sx - rampW / 2, sy, rampW, Math.max(3, 7 * scale));
      ctx.strokeStyle = '#28281a';
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      ctx.moveTo(sx - rampW / 2, sy + scale);
      ctx.lineTo(sx + rampW / 2, sy + scale);
      ctx.stroke();
    } else {
      // Ramp upright at bow face
      ctx.fillRect(sx - w * 0.44, sy - h * 0.18, w * 0.88, Math.max(2, h * 0.12));
      // Ramp slat lines
      ctx.strokeStyle = '#282818';
      ctx.lineWidth = Math.max(0.5, scale * 0.7);
      for (let j = 1; j < 3; j++) {
        const ry = sy - h * 0.18 + j * (h * 0.12 / 3);
        ctx.beginPath();
        ctx.moveTo(sx - w * 0.44, ry);
        ctx.lineTo(sx + w * 0.44, ry);
        ctx.stroke();
      }
    }
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

// Round 4 §3: draws a part overlay (rotor/turret/etc.) at the SAME centered
// destination rect as the base sprite it's layered on. Dispatches purely on
// def field presence:
//   partMode 'spin' — continuous rotor-style spin, frame = floor(time*fps)%n
//   partMode 'aim'  — frame chosen by the entity's angle toward the bunker
//                     (screen bottom-center 640,700), clamped to partAimRange
//                     (default [-24,24] degrees) and mapped to the nearest frame.
// `bank`/`mirror` are re-applied identically to the base sprite's transform
// so the part stays pixel-locked to it through banking/mirroring.
// While entity.firing (Round 4 §4), the part kicks back a few px for a
// recoil-on-fire flourish — generic, dispatched on entity.firing + partSprite
// presence, not on any content id.
function drawPartOverlay(ctx, entity, type, sx, sy, drawW, drawH, centerY, bank, mirror) {
  const frames = type.partSprite;
  const mode = type.partMode || 'spin';
  let idx = 0;
  if (mode === 'aim') {
    const [minA, maxA] = type.partAimRange || [-24, 24];
    const dx = 640 - sx;
    const dy = 700 - sy;
    let angleDeg = Math.atan2(dx, dy) * 180 / Math.PI;
    angleDeg = Math.max(minA, Math.min(maxA, angleDeg));
    idx = frames.length > 1 ? Math.round((angleDeg - minA) / (maxA - minA) * (frames.length - 1)) : 0;
  } else {
    const fps = type.partFps || 10;
    idx = Math.floor((entity.age || 0) * fps) % frames.length;
  }
  const path = frames[idx];
  const img = path ? Sprites.get(path) : null;
  if (!img) return;

  let recoilY = 0;
  if (entity.firing) {
    const rt = Math.max(0, 1 - (entity.fireAge || 0) / 0.12);
    recoilY = 3 * rt;
  }

  ctx.save();
  ctx.translate(sx, centerY + recoilY);
  if (bank) ctx.rotate(bank);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

// Screen-space point of an enemy's MUZZLE (gun barrel / missile pylon), so
// shots + flashes originate from the right part of the sprite, not its centre.
// `type.muzzle = {u,v}` is a fraction of the drawn sprite rect (u: left→right,
// v: top→bottom). Replicates drawEntityGlyph's placement (size, per-domain
// anchor, mirror, bank) so it stays locked to the drawn sprite. Returns the
// sprite centre if no muzzle is defined.
export function entityMuzzlePoint(entity, sx, sy, scale) {
  const type = entity.type || {};
  const spriteScale = type.spriteScale || 1.0;
  const drawH = (type.hitbox || 26) * 2.4 * scale * spriteScale;
  const path = resolveSpritePath(type.sprite, type.spriteFps, entity.age);
  const img = path ? Sprites.get(path) : null;
  const aspect = img ? (img.naturalWidth / img.naturalHeight) : 1;
  const drawW = drawH * aspect;
  const domain = type.domain;
  let top;
  if (domain === 'air') top = sy - drawH / 2;
  else if (domain === 'sea') { const d01 = clamp01(entity.d || 0); top = sy - drawH * lerp(-0.2, 0.55, 1 - d01); }
  else top = sy - drawH; // land: bottom-anchored
  const centerY = top + drawH / 2;
  const m = type.muzzle;
  if (!m) return { x: sx, y: centerY };
  let dx = (m.u - 0.5) * drawW;
  let dy = (m.v - 0.5) * drawH;
  if (type.mirrorByHeading && entity.mirrorState) dx = -dx; // face-flip
  if (type.bankFactor) {                                    // heli body roll
    const bank = Math.max(-0.17, Math.min(0.17, (entity.headX || 0) * type.bankFactor));
    if (bank) { const c = Math.cos(bank), s = Math.sin(bank); const rx = dx*c - dy*s, ry = dx*s + dy*c; dx = rx; dy = ry; }
  }
  return { x: sx + dx, y: centerY + dy };
}

// Ground contact shadow. Without this, composited 3D sprites read as "pasted on"
// the painted background instead of standing on the beach. Generic + data-driven:
// every entity gets one sized from its drawn width; `shadowScale` / `shadowAlpha`
// in the def can tune it, and `noShadow: true` opts out. Air units cast their
// shadow on the GROUND below them (sells altitude), shrinking with height.
function drawContactShadow(ctx, entity, sx, sy, drawW, scale) {
  const type = entity.type || {};
  if (type.noShadow) return;
  const domain = type.domain;
  if (domain === 'sea') return;            // sea craft already get a foam wake
  let cx = sx, cy = sy, k = 1, alpha = (type.shadowAlpha || 0.46);
  if (domain === 'air') {
    const alt = clamp01(entity.alt || 0);
    const gp = project(entity.x, entity.d, 0, 'land');
    cx = gp.sx; cy = gp.sy;
    k = 0.62 - alt * 0.34;                 // higher up = smaller, fainter
    alpha *= (1 - alt * 0.55);
  }
  const rx = drawW * 0.33 * (type.shadowScale || 1) * k;
  const ry = Math.max(1.5, rx * 0.30);
  if (rx <= 0.5 || alpha <= 0.02) return;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0,   `rgba(28,22,14,${alpha})`);
  g.addColorStop(0.55, `rgba(28,22,14,${alpha * 0.62})`);
  g.addColorStop(1,   'rgba(28,22,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Static beach scenery (obstacles, defences, wreckage). Pure data — every prop
// comes from data/scenery.json, so nothing here branches on a content id.
// Bottom-anchored like a land entity and drawn inside the same depth-sorted
// pass, so advancing enemies correctly pass in front of / behind it.
const SCENERY_BASE_H = 120;
export function drawSceneryProp(ctx, prop, sx, sy, scale) {
  const img = prop.sprite ? Sprites.get(prop.sprite) : null;
  if (!img) return;
  const drawH = SCENERY_BASE_H * scale * (prop.scale || 1);
  const drawW = drawH * (img.naturalWidth / img.naturalHeight);
  // contact shadow so props sit on the sand rather than float on it
  const rx = drawW * 0.34, ry = Math.max(1.5, rx * 0.30);
  ctx.save();
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx);
  g.addColorStop(0, 'rgba(28,22,14,0.46)');
  g.addColorStop(0.55, 'rgba(28,22,14,0.28)');
  g.addColorStop(1, 'rgba(28,22,14,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.drawImage(img, sx - drawW / 2, sy - drawH, drawW, drawH);
}

export function drawEntityGlyph(ctx, entity, sx, sy, scale) {
  const type = entity.type || {};
  const shape = type.shape;
  const color = type.color || '#ffffff';

  // Dying entities (deathSprite present, entity.dying set by weaponSystem on
  // kill) play a one-shot death animation instead of the normal sprite/glyph.
  // Same height rule as normal sprites (hitbox*2.4*scale*spriteScale),
  // aspect-correct width from the loaded frame, always bottom-anchored
  // (death frames show the subject falling sideways, regardless of domain).
  if (entity.dying && type.deathSprite) {
    const deathPath = resolveOneShotFramePath(type.deathSprite, type.deathFps, entity.deathAge);
    const deathImg = deathPath ? Sprites.get(deathPath) : null;
    if (deathImg) {
      const spriteScale = type.spriteScale || 1.0;
      const drawH = (type.hitbox || 26) * 2.4 * scale * spriteScale;
      const drawW = drawH * (deathImg.naturalWidth / deathImg.naturalHeight);
      ctx.drawImage(deathImg, sx - drawW / 2, sy - drawH, drawW, drawH);
      return;
    }
    // death frame not loaded yet — fall through to normal sprite/glyph so
    // nothing pops out of existence while the image loads.
  }

  // Round 4 §3: sea-domain gentle sine bob, visual only — never touches the
  // hit-test (weaponSystem.js projects its own sx/sy independently of this
  // renderer call, so this offset can't desync hitboxes from what's drawn).
  let drawSy = sy;
  if (type.bobAmp) {
    const hz = type.bobHz || 0.2;
    drawSy = sy + Math.sin((entity.age || 0) * 2 * Math.PI * hz + (entity.uid || 0)) * type.bobAmp;
  }

  // Round 4 §4: a unit with fireSprite fires a brief one-shot animation
  // (entity.firing/fireAge set by movementBehaviors' advance_and_fire /
  // hover_and_dive) instead of its normal looping walk/idle sprite.
  let spritePath;
  if (entity.firing && type.fireSprite) {
    spritePath = resolveOneShotFramePath(type.fireSprite, type.fireFps, entity.fireAge);
  } else if (type.beachedSprite && entity.flags && (entity.flags.rampDown || entity.flags.beached)) {
    // Beached craft hold their ramp-down frame (generic def field).
    spritePath = type.beachedSprite;
  } else {
    spritePath = resolveSpritePath(type.sprite, type.spriteFps, entity.age);
  }
  const img = spritePath ? Sprites.get(spritePath) : null;
  if (img) {
    const spriteScale = type.spriteScale || 1.0;
    const domain = type.domain;
    const drawH = (type.hitbox || 26) * 2.4 * scale * spriteScale;
    const drawW = drawH * (img.naturalWidth / img.naturalHeight);

    let top;
    let waterClipY = null; // sea craft: y of the water surface to clip the hull at
    if (domain === 'air') {
      // center-anchored at (sx, sy)
      top = drawSy - drawH / 2;
    } else if (domain === 'sea') {
      // FIX 2: depth-varying anchor so ships sit IN the water at all stages.
      // At spawn (d=1, sy=HORIZON_Y=260): anchor=-0.2 pushes the sprite top to
      // sy - drawH*(-0.2) = 260+5.6 = 265.6px — right at the visual sky/sea
      // boundary, so the hull sits entirely in the sea zone, not the sky.
      // At shore (d≈0.1, sy≈404): anchor=0.55 gives the correct beaching look,
      // hull straddling the waterline with bow grounding on the beach.
      // Formula: lerp(-0.2, 0.55, 1-d01) → -0.2 when far, 0.55 when near.
      const d01sea = clamp01(entity.d || 0);
      // Sea craft sit ON the water: the sprite's hull bottom lands just BELOW the
      // craft's own projected water surface (sy), submerged by a small fraction
      // of its drawn height. Expressed as a SUBMERSION FRACTION rather than a
      // hand-tuned anchor ramp, because the old ramp was calibrated against the
      // 0.55 sea-scale cap - when that cap was raised to 0.9 every offset scaled
      // with drawH, which put the waterline up at deck level and left the whole
      // hull hanging in the air. Deriving from submersion keeps this correct for
      // any future scale change.
      // Submersion is deliberately DEEP: the Meshy craft sprites include the
      // full below-waterline V-hull down to the keel. A shallow value moved the
      // boat down but still drew the whole underwater hull over the sea, which
      // reads as a boat perched on the surface rather than floating in it.
      // Paired with the waterline CLIP below, this hides the keel so the water
      // visually cuts across the hull the way it does on a real vessel.
      const submersion = lerp(0.30, 0.24, 1 - d01sea); // far -> near
      top = drawSy - drawH * (1 - submersion);
      // Everything below the craft's own water surface is underwater and must
      // be occluded, not painted on top of the sea. Beached craft are sitting
      // on sand, so they are never clipped.
      if (!(entity.flags && (entity.flags.beached || entity.flags.rampDown))) {
        waterClipY = sy;
      }
      // Foam wake at the hull's waterline so approaching craft read as
      // sitting IN the water rather than floating (bow-on hulls have no
      // visible water contact without it). Skip once beached.
      if (!(entity.flags && (entity.flags.beached || entity.flags.rampDown))) {
        const wlY = sy; // the true water surface for this depth (unbobbed)
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#e8f4f0';
        ctx.beginPath();
        ctx.ellipse(sx, wlY, drawW * 0.62, Math.max(2.5, drawH * 0.06), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // land: bottom-anchored — feet/tracks sit at sy
      top = drawSy - drawH;
    }
    const centerY = top + drawH / 2;

    // Round 4 §2: mirror horizontally when moving screen-right, with
    // hysteresis on entity.headX (world x-units/sec, tracked generically in
    // spawnSystem.js) so the facing doesn't flicker right at zero drift.
    let mirror = false;
    if (type.mirrorByHeading) {
      const hx = entity.headX || 0;
      const band = 0.01;
      if (entity.mirrorState === undefined) entity.mirrorState = false;
      if (hx > band) entity.mirrorState = true;
      else if (hx < -band) entity.mirrorState = false;
      mirror = entity.mirrorState;
    }

    // Round 4 §3: code-driven body roll ("bank") proportional to smoothed
    // horizontal heading, clamped to +-~10deg.
    let bank = 0;
    if (type.bankFactor) {
      const hx = entity.headX || 0;
      const maxBank = 0.17;
      bank = Math.max(-maxBank, Math.min(maxBank, hx * type.bankFactor));
    }

    // Ground contact shadow first, so the sprite sits on top of it.
    drawContactShadow(ctx, entity, sx, sy, drawW, scale);

    ctx.save();
    if (waterClipY !== null) {
      // Clip to everything ABOVE the waterline before drawing the hull.
      ctx.beginPath();
      ctx.rect(0, 0, CANVAS_W, waterClipY);
      ctx.clip();
    }
    ctx.translate(sx, centerY);
    if (bank) ctx.rotate(bank);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Round 4 §3: part-composited overlay (rotor spin / turret aim), drawn
    // at the EXACT same destination rect as the base sprite — the base/part
    // asset pairs share one bbox so they're pixel-aligned as pure overlays.
    if (type.partSprite && type.partSprite.length) {
      drawPartOverlay(ctx, entity, type, sx, sy, drawW, drawH, centerY, bank, mirror);
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
// Rack geometry constants (SPEC_PHASE2_POLISH.md section F): slots evenly
// spaced across ~440px centered at x=640, baseline y~712.
// Rack sits bottom-right, clear of the HUD weapon pips (x 40..630, y 660+).
const RACK_WIDTH = 400;
const RACK_CENTER_X = 900;
const RACK_BASELINE_Y = 712;
const RACK_DRAW_H = 72;
const RACK_RISE_PX = 18; // active sprite rises this many px over riseT 0->1
const RACK_RECOIL_PX = 6; // active sprite recoils down/back this many px at recoilTimer=1

// BUG FIX (Round 4 §5): the weapon rack HUD (drawTurret) used to be painted
// unconditionally on top of every entity, including land/sea entities close
// enough to the bunker that their sprite footprint overlaps the rack's
// screen band (~x 700..1100, y ~600..712). Their hit-rect (weaponSystem.js
// pointHitsSprite, same geometry as here) was ALWAYS correct — this was a
// pure z-order/visibility bug: at close range the rack visually erased the
// lower body of the target, so players couldn't see what they were aiming
// at and perceived the hitbox as "gone". RACK_NEAR_Y is the highest y the
// risen active-weapon sprite can reach; callers (main.js renderPlaying)
// redraw any entity whose projected bottom edge is below this line AFTER
// the rack, restoring the "near occludes far" rule the rest of the scene
// already follows.
export const RACK_NEAR_Y = RACK_BASELINE_Y - RACK_RISE_PX - RACK_DRAW_H * 1.25;

function drawVectorBarrel(ctx, turret) {
  if (!turret || turret.barrelAngle === undefined) return;
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

// drawTurret: renders the weapon rack along the bottom-center parapet — one
// slot per weapon in weapons.json order. Weapons with a `turretSprite` draw
// that sprite (active = raised + full opacity + color glow + recoil offset;
// inactive = lowered + 55% opacity). The active weapon, if it has NO
// turretSprite, falls back to the original vector barrel glyph so nothing
// regresses for data without turret art.
export function drawTurret(ctx, turret) {
  const weapons = turret.weapons;
  const n = weapons.length;
  const slotSpacing = n > 1 ? RACK_WIDTH / (n - 1) : 0;
  const startX = n > 1 ? RACK_CENTER_X - RACK_WIDTH / 2 : RACK_CENTER_X;

  let activeHasSprite = false;

  weapons.forEach((w, i) => {
    if (!w.turretSprite) return;
    const img = Sprites.get(w.turretSprite);
    if (!img) return;
    const active = i === turret.activeIndex;
    if (active) activeHasSprite = true;

    const slotX = n > 1 ? startX + i * slotSpacing : RACK_CENTER_X;
    const turretScale = w.turretScale || 1.0;
    const drawH = RACK_DRAW_H * turretScale * (active ? 1.25 : 1);
    const drawW = drawH * (img.naturalWidth / img.naturalHeight);

    const riseOffset = active ? -RACK_RISE_PX * clamp01(turret.riseT || 0) : 0;
    const recoilOffset = active ? RACK_RECOIL_PX * recoilT01(turret) : 0;
    const slotY = RACK_BASELINE_Y + riseOffset + recoilOffset;

    ctx.save();
    if (active) {
      // soft glow ellipse behind/under the active weapon, tinted with its color
      ctx.save();
      ctx.globalAlpha = 0.5;
      const grad = ctx.createRadialGradient(slotX, slotY, 0, slotX, slotY, drawW * 0.6);
      grad.addColorStop(0, w.color || '#ffffff');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(slotX, slotY, drawW * 0.6, drawH * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.55;
    }
    ctx.drawImage(img, slotX - drawW / 2, slotY - drawH, drawW, drawH);
    ctx.restore();
  });

  if (!activeHasSprite) {
    drawVectorBarrel(ctx, turret);
  }
}

function recoilT01(turret) {
  if (!turret) return 0;
  return clamp01((turret.recoilTimer || 0) / 0.12);
}

export function drawMuzzleFlash(ctx, turret, alpha) {
  if (!turret || turret.barrelAngle === undefined) return;
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

export function drawCrate(ctx, sx, sy, scale, color, crateType, age) {
  const sprite = crateType && crateType.sprite;
  const spritePath = resolveSpritePath(sprite, crateType && crateType.spriteFps, age);
  const img = spritePath ? Sprites.get(spritePath) : null;
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

// -------------------- FIX 4: explosion particle draw --------------------
export function drawParticles(ctx, particles) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.smoke) {
      ctx.fillStyle = `rgba(30,30,30,${alpha})`;
    } else {
      ctx.fillStyle = p.color;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// -------------------- FIX 5: impact splash draw --------------------
export function drawSplashes(ctx, splashes) {
  for (const sp of splashes) {
    const alpha = Math.max(0, sp.life / sp.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sp.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, Math.max(0.5, sp.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// -------------------- NEW: whitecaps on the sea --------------------
export function drawWhitecaps(ctx, whitecaps) {
  for (const w of whitecaps) {
    // Fade in for first 30% of life, fade out for last 30%
    const t = w.life / w.maxLife;
    const alpha = Math.min(t / 0.3, (1 - t) / 0.3, 1) * 0.7;
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, w.w / 2, w.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// -------------------- NEW: parallax drifting clouds in sky --------------------
export function drawClouds(ctx, clouds) {
  for (const c of clouds) {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = '#f0f4ff';
    for (const p of c.puffs) {
      ctx.beginPath();
      ctx.arc(c.x + p.dx, c.y + p.dy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// -------------------- Tidal wave wash — perspective-angled shoreline ----------
// The painted background waterline (blue water → wet sand) is NOT flat and NOT
// symmetric: measured across the art it runs high on the LEFT (y≈345) down to
// low on the RIGHT (y≈440). Match those endpoints exactly so the animated foam
// line rides on the painted surf instead of cutting across it diagonally.
export function drawTidal(ctx, tidalPhase) {
  const washExtent = 12;
  const phase      = tidalPhase;
  const leftY      = 345;   // upper-left (surf recedes into the distance)
  const rightY     = 440;   // lower-right (surf nearest the player)

  function waveY(px) {
    const t    = px / CANVAS_W;
    const base = leftY + (rightY - leftY) * t;         // perspective slope
    const wave = Math.sin(px * 0.015 + phase)  * 4
               + Math.sin(px * 0.03  - phase * 1.3) * 2;
    return base - washExtent * Math.max(0, Math.sin(phase * 0.7)) + wave;
  }

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#c8eeff';

  // Animated wash body
  ctx.beginPath();
  ctx.moveTo(0, leftY);
  for (let px = 0; px <= CANVAS_W; px += 4) {
    ctx.lineTo(px, waveY(px));
  }
  ctx.lineTo(CANVAS_W, rightY + 8);
  ctx.lineTo(0, leftY + 8);
  ctx.closePath();
  ctx.fill();

  // Foam line along the wave edge
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let px = 0; px <= CANVAS_W; px += 4) {
    px === 0 ? ctx.moveTo(px, waveY(px)) : ctx.lineTo(px, waveY(px));
  }
  ctx.stroke();
  ctx.restore();
}

// -------------------- FIX 6: enemy muzzle flash draw --------------------
// Called for helicopter / enemy fire. sx/sy are projected screen coords.
export function drawEnemyMuzzleFlash(ctx, sx, sy, scale, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  const r = Math.max(9, 26 * scale); // prominent so it reads as the shot's origin
  // Outer glow
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  grad.addColorStop(0, 'rgba(255,240,60,1)');
  grad.addColorStop(0.5, 'rgba(255,120,0,0.6)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  // Bright core
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = 'rgba(255,255,200,1)';
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const CONSTANTS = { CANVAS_W, CANVAS_H, HORIZON_Y, SEA_Y, BEACH_Y, RACK_NEAR_Y };
