// src/systems/bosses.js
// Boss enemy system: BattleshipBoss + BomberBoss + FighterEscort.
// Bosses live in game.bosses[] (separate from game.entities).
// Hit-detection hooks registered on the game object:
//   game.bossHitCallback(weapon, screenX, screenY) -> pseudo-entity or null
//   game.bossSplashCallback(weapon, worldX, worldD)
//   game.bossAirTargetCallback(aimX, aimY, currentBestDist) -> {target,dist} or null
import { project, CONSTANTS } from '../engine/renderer.js';
import * as Sprites from '../engine/sprites.js';

const { CANVAS_W, CANVAS_H, SEA_Y, HORIZON_Y } = CONSTANTS;

// Rendered 3D battleship broadside sprite (bow to the right, matching the
// section layout). Drawn as the hull base; destructible sections + smoke +
// turret fire are layered on top so the destructible-section gameplay is
// unchanged. Falls back to the vector hull if the image isn't loaded.
const BATTLESHIP_SPRITE = 'assets/frames/battleship.png';

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function screenDist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// Create a section pseudo-entity. Works with weaponSystem.applyDamage because
// it exposes hp/maxHp/dead/dying/killedByPlayer and type.deathSprite = null.
function makeSection(name, hp, domain) {
  return {
    _sectionName: name,
    hp, maxHp: hp,
    dead: false, dying: false,
    killedByPlayer: false, killMoment: false, processedKill: false,
    type: { domain, hitbox: 0, deathSprite: null },
    flags: {}, data: {},
    x: 0, d: 0, alt: 0, // updated each frame to boss world pos
  };
}

// ─────────────────────────── BATTLESHIP BOSS ────────────────────────────────
class BattleshipBoss {
  constructor(stageId, bossScale) {
    this.stageId = stageId;
    this.scale   = bossScale || 1.0;    // 1.5 for the stage-9 dreadnought
    // Movement: sail in from OFF the right edge and stop on-station in the
    // water in front of the player (bow points left = direction of travel).
    // Fixed depth d keeps the hull in the sea band — it never beaches; you
    // sink it. (Old behaviour crept toward shore from the horizon, which put
    // the oversized superstructure up in the sky and read as "sliding".)
    this.d       = 0.52;               // fixed water depth (in the sea band)
    this.x       = 1.7;                // start off the right edge
    this.targetX = 0.28;              // stop slightly right of centre
    this.slideSpeed = 0.16;           // world-x/sec glide-in
    this.arrived = false;
    this.beached = false;             // kept for compatibility; never set true
    this.listAngle = 0;                 // visual tilt when hull destroyed
    this.muzzleFlashes = [];           // {x, y, life, big}

    // Ship dimensions (virtual world units, scaled to canvas in draw)
    // 5× bigger so the dreadnought fills ~55% of canvas width when beached
    this.worldW = 1400 * this.scale;
    this.worldH = 225  * this.scale;

    // Fire timers
    this.fwdFireTimer  = 2.5 + Math.random() * 2;
    this.rearFireTimer = 1.5 + Math.random() * 2;
    this.shells        = []; // { sx, sy, tx, ty, t, life, damage }

    // Damage smoke plumes on destroyed sections
    this.smokeParticles = []; // { rx, ry, life, maxLife, r }
    this.smokeTimer = 0;

    // Score value for complete destruction
    this.scoreValue = this.scale >= 1.5 ? 8000 : 5000;

    // ── Destructible sections ──────────────────────────────────────────────
    const S = this.scale;
    this.sections = {
      fwdTurret:  makeSection('fwdTurret',  Math.round(150 * S), 'sea'),
      rearTurret: makeSection('rearTurret', Math.round(120 * S), 'sea'),
      bridge:     makeSection('bridge',     Math.round(200 * S), 'sea'),
      hullPort:   makeSection('hullPort',   Math.round(300 * S), 'sea'),
      engine:     makeSection('engine',     Math.round(180 * S), 'sea'),
    };
  }

  get alive() {
    const s = this.sections;
    // Dead when hullPort destroyed, OR both turrets + bridge + engine all gone
    if (s.hullPort.dead) return false;
    if (s.bridge.dead && s.fwdTurret.dead && s.rearTurret.dead && s.engine.dead) return false;
    return true;
  }

  // Screen-space position of ship center
  screenPos() {
    return project(this.x, this.d, 0, 'sea');
  }

  // Screen-space position of a named section, given ship's projected (sx,sy,scale)
  sectionScreenPos(name, sx, sy, scale) {
    const w = this.worldW * scale;
    const h = this.worldH * scale;
    // Offsets tuned to sit on the 3D battleship sprite's features (bow to the
    // LEFT — direction of travel): forward guns on the fore deck (-x), aft gun
    // (+x), bridge/masts just above center, hull weak-point at the waterline.
    const offsets = {
      fwdTurret:  { rx: -0.26, ry:  0.30 },
      rearTurret: { rx:  0.28, ry:  0.30 },
      bridge:     { rx: -0.03, ry: -0.25 },
      hullPort:   { rx:  0.00, ry:  0.60 },
      engine:     { rx:  0.12, ry:  0.05 },
    };
    const off = offsets[name] || { rx: 0, ry: 0 };
    return { x: sx + off.rx * w, y: sy + off.ry * h };
  }

  // Hit radii (fraction of ship height)
  sectionHitRadius(name, h) {
    const radii = {
      fwdTurret:  0.40, rearTurret: 0.38,
      bridge:     0.30, hullPort:   0.70,
      engine:     0.32,
    };
    return h * (radii[name] || 0.35);
  }

  // Test a screen click against all alive sections. Returns the section or null.
  hitTestScreen(weapon, clickX, clickY) {
    if (!weapon.targetDomains.includes('sea')) return null;
    const { sx, sy, scale } = this.screenPos();
    const h = this.worldH * scale;
    const w = this.worldW * scale;
    // Coarse rect guard first. Bounds match the 3D-sprite section layout:
    // hull weak-point sits at +0.60h (waterline), masts reach ~-0.6h.
    if (clickX < sx - w * 0.6 || clickX > sx + w * 0.6) return null;
    if (clickY > sy + h * 1.1  || clickY < sy - h * 1.3) return null;
    // Test each alive section
    for (const [name, sec] of Object.entries(this.sections)) {
      if (sec.dead) continue;
      const sp = this.sectionScreenPos(name, sx, sy, scale);
      const r  = this.sectionHitRadius(name, h);
      if (screenDist(clickX, clickY, sp.x, sp.y) <= r) return sec;
    }
    return null;
  }

  // Howitzer splash: check if impact is near enough to damage sections.
  // Depth tolerance is large because clicking the ship superstructure unprojects
  // to a depth shallower than the keel — we only care about horizontal distance.
  handleSplash(weapon, worldX, worldD) {
    const dx = Math.abs(worldX - this.x) * 640;
    const dd = Math.abs(worldD - this.d) * 900;
    if (dx + dd > weapon.splashRadius + 280) return; // generous dd tolerance
    for (const sec of Object.values(this.sections)) {
      if (sec.dead) continue;
      sec.hp -= weapon.damage * 0.5; // splash is half damage to each section
      if (sec.hp <= 0) { sec.dead = true; sec.killedByPlayer = true; }
    }
  }

  // Update all section world coords (for weaponSystem splashDamage ref)
  _syncSectionWorldPos() {
    for (const sec of Object.values(this.sections)) {
      sec.x = this.x; sec.d = this.d; sec.alt = 0;
    }
  }

  update(game, dt) {
    this._syncSectionWorldPos();

    // Glide in from off the right edge, then stop on-station in the water.
    if (!this.arrived) {
      this.x -= this.slideSpeed * dt;
      if (this.x <= this.targetX) { this.x = this.targetX; this.arrived = true; }
    }

    // Tick muzzle flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].life -= dt;
      if (this.muzzleFlashes[i].life <= 0) this.muzzleFlashes.splice(i, 1);
    }

    // List (tilt) if hull damaged
    if (this.sections.hullPort.dead) {
      this.listAngle = lerp(this.listAngle, 0.18, dt * 2);
    }

    // Spawn persistent smoke from destroyed sections
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.15 + Math.random() * 0.2;
      for (const [name, sec] of Object.entries(this.sections)) {
        if (!sec.dead) continue;
        const { sx, sy, scale } = this.screenPos();
        const sp = this.sectionScreenPos(name, sx, sy, scale);
        this.smokeParticles.push({
          x: sp.x + (Math.random() - 0.5) * 14,
          y: sp.y,
          vx: (Math.random() - 0.5) * 12,
          vy: -20 - Math.random() * 25,
          life: 1.4 + Math.random() * 0.6, maxLife: 2.0,
          r: 9 + Math.random() * 8,
        });
      }
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.smokeParticles.splice(i, 1);
    }

    // Forward turret fire (slow, heavy) — only once on-station
    if (this.alive && this.arrived && !this.sections.fwdTurret.dead) {
      this.fwdFireTimer -= dt;
      const rate = this.sections.bridge.dead ? 0.5 : 1.0;
      if (this.fwdFireTimer <= 0) {
        this.fwdFireTimer = (3.5 + Math.random() * 2.0) / rate;
        this._fireShell(game, 'fwdTurret', 18, 'heavy');
      }
    }
    // Rear turret fire (faster, lighter) — only once on-station
    if (this.alive && this.arrived && !this.sections.rearTurret.dead) {
      this.rearFireTimer -= dt;
      const rate = this.sections.bridge.dead ? 0.5 : 1.0;
      if (this.rearFireTimer <= 0) {
        this.rearFireTimer = (2.0 + Math.random() * 1.5) / rate;
        this._fireShell(game, 'rearTurret', 9, 'light');
      }
    }

    // Advance in-flight shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.t += dt / sh.life;
      if (sh.t >= 1) {
        // Impact
        if (!game.godMode) game.defense = Math.max(0, game.defense - sh.damage);
        game.effects && game.effects.push({
          kind: 'explosion', x: (sh.tx - 640) / 640, d: 0,
          alt: 0, domain: 'land',
          radiusWorld: sh.heavy ? 90 : 50, life: 0.5, age: 0,
        });
        game.audio && game.audio.play('heavyBoom');
        if (sh.heavy && game.screenShake !== undefined) game.screenShake = (game.screenShake||0) + 0.04;
        this.shells.splice(i, 1);
      }
    }

    // Process section kills (score, smoke effect)
    for (const [name, sec] of Object.entries(this.sections)) {
      if (sec.dead && sec.killedByPlayer && !sec.processedKill) {
        sec.processedKill = true;
        const sectionScores = { fwdTurret:500, rearTurret:400, bridge:700, hullPort:900, engine:500 };
        game.scoreApi && game.scoreApi.onKill(sectionScores[name] || 400);
        game.audio && game.audio.play('explode');
        const { sx, sy, scale } = this.screenPos();
        const sp = this.sectionScreenPos(name, sx, sy, scale);
        game.effects && game.effects.push({ kind:'explosion', x:(sp.x-640)/640,
          d:this.d, alt:0, domain:'sea', radiusWorld:60, life:0.5, age:0 });
      }
    }
  }

  _fireShell(game, turretName, damage, kind) {
    const { sx, sy, scale } = this.screenPos();
    const w = this.worldW * scale;
    const h = this.worldH * scale;
    const sp = this.sectionScreenPos(turretName, sx, sy, scale);
    // Shell muzzle point: from the turret, nudged toward the player (down) so
    // it clearly leaves the gun rather than the deck.
    const muzX = sp.x;
    const muzY = sp.y + h * 0.12;
    // Target: the beach/shore line in front of the player.
    const tx = 200 + Math.random() * 880;
    const ty = 650 + Math.random() * 40;
    this.shells.push({
      sx: muzX, sy: muzY, tx, ty,
      t: 0, life: 2.0 + Math.random() * 0.5,
      damage, heavy: kind === 'heavy',
    });
    // Muzzle flash at the gun, angled down toward the player.
    this.muzzleFlashes.push({ x: muzX, y: muzY, life: 0.12, big: kind === 'heavy' });
    game.audio && game.audio.play(kind === 'heavy' ? 'heavyBoom' : 'rapidFire');
  }

  draw(ctx) {
    const { sx, sy, scale } = this.screenPos();
    const w = this.worldW * scale;
    const h = this.worldH * scale;
    const s = this.sections;

    ctx.save();
    ctx.translate(sx, sy);
    if (s.hullPort.dead) ctx.rotate(this.listAngle);

    const bsImg = Sprites.get(BATTLESHIP_SPRITE);
    if (bsImg) {
      // ── 3D battleship sprite (bow to the right) ────────────────────────
      // Anchor so the sprite's waterline (~12% up from its bottom) sits at
      // y=0; the superstructure/masts rise above. drawW spans the hull
      // footprint (worldW). Section hit-zones + damage overlays layer on top.
      const drawW = w * 1.04;
      const drawH = drawW * (bsImg.naturalHeight / bsImg.naturalWidth);
      const waterFrac = 0.12; // fraction of sprite height below the waterline
      ctx.drawImage(bsImg, -drawW / 2, -drawH * (1 - waterFrac), drawW, drawH);

      // Destroyed sections: dark blast scar over the sprite (smoke handled
      // below). Section offsets are in the same local space as the sprite.
      const scars = {
        fwdTurret:  { rx: -0.26, ry:  0.30, r: 0.34 },
        rearTurret: { rx:  0.28, ry:  0.30, r: 0.30 },
        bridge:     { rx: -0.03, ry: -0.25, r: 0.34 },
        hullPort:   { rx:  0.00, ry:  0.55, r: 0.50 },
        engine:     { rx:  0.12, ry:  0.05, r: 0.28 },
      };
      for (const [name, sec] of Object.entries(s)) {
        if (!sec.dead) continue;
        const sc = scars[name]; if (!sc) continue;
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#141414';
        ctx.beginPath();
        ctx.arc(sc.rx * w, sc.ry * h, sc.r * h, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ff6a2a'; // ember glow
        ctx.beginPath();
        ctx.arc(sc.rx * w, sc.ry * h, sc.r * h * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Fallback: original vector hull (unchanged) if the sprite isn't loaded.
      ctx.fillStyle = '#3a3a45';
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w / 2 + 12 * scale, -h * 0.48);
      ctx.lineTo(w / 2 - 16 * scale, -h * 0.48);
      ctx.lineTo(w / 2, 0);
      ctx.closePath();
      ctx.fill();
      if (!s.bridge.dead) {
        ctx.fillStyle = '#4a4a58';
        ctx.fillRect(-w * 0.065, -h * 1.75, w * 0.13, h * 1.35);
      }
      if (!s.fwdTurret.dead) {
        ctx.fillStyle = '#555566';
        ctx.beginPath(); ctx.arc(w*0.32, -h*0.65, h*0.35, 0, Math.PI*2); ctx.fill();
      }
      if (!s.rearTurret.dead) {
        ctx.fillStyle = '#555566';
        ctx.beginPath(); ctx.arc(-w*0.32, -h*0.65, h*0.30, 0, Math.PI*2); ctx.fill();
      }
    }

    ctx.restore();

    // ── Damage smoke plumes ─────────────────────────────────────────────
    ctx.save();
    for (const p of this.smokeParticles) {
      const alpha = Math.max(0, p.life / p.maxLife) * 0.6;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Muzzle flashes (at the guns, angled down toward the player) ──────
    ctx.save();
    for (const m of this.muzzleFlashes) {
      const t = m.life / 0.12; // 1→0
      const R = (m.big ? 26 : 16) * (0.6 + t * 0.6);
      ctx.globalAlpha = t;
      // bright core
      ctx.fillStyle = '#fff4c0';
      ctx.beginPath(); ctx.arc(m.x, m.y, R * 0.5, 0, Math.PI*2); ctx.fill();
      // orange flame cone pointing down at the player
      ctx.fillStyle = '#ffae2e';
      ctx.beginPath();
      ctx.moveTo(m.x - R * 0.5, m.y);
      ctx.lineTo(m.x + R * 0.5, m.y);
      ctx.lineTo(m.x, m.y + R * 1.6);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── In-flight shells ────────────────────────────────────────────────
    ctx.save();
    for (const sh of this.shells) {
      const x = lerp(sh.sx, sh.tx, sh.t);
      const y = lerp(sh.sy, sh.ty, sh.t) - Math.sin(sh.t * Math.PI) * 80;
      ctx.fillStyle = sh.heavy ? '#ffcc44' : '#ffaa22';
      ctx.beginPath(); ctx.arc(x, y, sh.heavy ? 6 : 4, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // ── Section HP bars ─────────────────────────────────────────────────
    this._drawHpBars(ctx);
  }

  _drawHpBars(ctx) {
    // Compact corner panel – top-right of screen, never over the ship
    const panelX = ctx.canvas.width - 180;
    const panelY = 10;
    const barW   = 120;
    const barH   = 10;

    const rows = [
      { key: 'fwdTurret',  label: 'FWD TURRET', color: '#ff6600' },
      { key: 'rearTurret', label: 'RR TURRET',  color: '#ff8800' },
      { key: 'bridge',     label: 'BRIDGE',      color: '#4488ff' },
      { key: 'hullPort',   label: 'HULL',        color: '#cc2222' },
      { key: 'engine',     label: 'ENGINE',      color: '#ffcc00' },
    ];

    ctx.save();
    // Background panel (172 × 110)
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(panelX - 8, panelY, 172, 110);

    // Title
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff3333';
    ctx.fillText(this.scale >= 1.5 ? '⚓ DREADNOUGHT' : '⚓ BATTLESHIP',
                 panelX - 4, panelY + 12);

    let y = panelY + 18;
    for (const { key, label, color } of rows) {
      const sec = this.sections[key];
      const pct = clamp01(sec.hp / sec.maxHp);

      // Section label
      ctx.font = '9px monospace';
      ctx.fillStyle = sec.dead ? '#555' : '#aaa';
      ctx.fillText(label, panelX - 4, y + 9);
      y += 11;

      // Bar background
      ctx.fillStyle = '#222';
      ctx.fillRect(panelX - 4, y, barW, barH);
      // Bar fill
      ctx.fillStyle = sec.dead ? '#333' : color;
      ctx.fillRect(panelX - 4, y, barW * pct, barH);
      y += barH + 4;
    }
    ctx.restore();
  }
} // end BattleshipBoss

// ──────────────────────────── FIGHTER ESCORT ────────────────────────────────
class FighterEscort {
  constructor(offsetX, offsetAlt, bomber) {
    this._bomber    = bomber;
    this.offsetX    = offsetX;   // lateral offset from bomber x
    this.offsetAlt  = offsetAlt; // vertical offset from bomber alt
    this.hp         = 60; this.maxHp = 60;
    this.dead       = false; this.dying = false;
    this.killedByPlayer = false; this.killMoment = false; this.processedKill = false;
    this.type       = { domain: 'air', hitbox: 14, deathSprite: null };
    this.flags      = {}; this.data  = {};
    this.orbitPhase = Math.random() * Math.PI * 2;
    this.orbitSpeed = 1.8 + Math.random() * 0.8;
    this.attackTimer = 6 + Math.random() * 8;
    this.attacking   = false;
    this.attackY     = 0;
    this.age         = 0;
  }

  get x()   { return this._bomber.x + this.offsetX + Math.cos(this.orbitPhase) * 0.06; }
  get d()   { return 0.05; }
  get alt() { return this._bomber.alt + this.offsetAlt + Math.sin(this.orbitPhase*1.3)*0.03; }

  update(game, dt) {
    if (this.dead) return;
    this.age += dt;
    this.orbitPhase += this.orbitSpeed * dt;
    // Periodic attack dive: deal minor damage then return
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && !this.attacking) {
      this.attacking  = true;
      this.attackTimer = 5 + Math.random() * 6;
      this.attackY    = 0;
    }
    if (this.attacking) {
      this.attackY += dt * 0.3;
      if (this.attackY >= 1) {
        this.attacking = false;
        this.attackY   = 0;
        if (!game.godMode) game.defense = Math.max(0, game.defense - 3);
        game.audio && game.audio.play('hit');
      }
    }
  }

  draw(ctx) {
    if (this.dead) return;
    // Position relative to bomber's z-approach screen coords
    const bomber = this._bomber;
    const S   = bomber.drawScale;
    const dip = this.attacking ? this.attackY * 40 * S : 0;
    const sx  = bomber.drawX + this.offsetX * 100 * S
              + Math.cos(this.orbitPhase) * 30 * S;
    const sy  = bomber.drawY + this.offsetAlt * 80 * S
              + Math.sin(this.orbitPhase * 1.3) * 15 * S + dip;
    const s   = 11 * S;
    ctx.save();
    ctx.fillStyle = '#2a3040';
    // Fuselage
    ctx.beginPath(); ctx.ellipse(sx, sy, s*0.8, s*0.2, 0, 0, Math.PI*2); ctx.fill();
    // Wings
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx - s*1.2, sy + s*0.5);
    ctx.lineTo(sx - s*0.5, sy); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + s*1.2, sy + s*0.5);
    ctx.lineTo(sx + s*0.5, sy); ctx.closePath(); ctx.fill();
    // HP bar (only when damaged)
    if (this.hp < this.maxHp) {
      const pct = clamp01(this.hp / this.maxHp);
      ctx.fillStyle = '#333'; ctx.fillRect(sx-14, sy-12, 28, 4);
      ctx.fillStyle = '#5ad'; ctx.fillRect(sx-14, sy-12, 28*pct, 4);
    }
    ctx.restore();
  }
} // end FighterEscort

// ─────────────────────────────── BOMBER BOSS ────────────────────────────────
class BomberBoss {
  constructor(stageId, bossScale) {
    this.stageId  = stageId;
    this.scale    = bossScale || 1.0;   // 1.2 for stage-10 B-2
    this.isFinal  = stageId >= 10;

    // World position (kept for SAM/escort compatibility; d synced from approachZ)
    this.x   = 0;        // centered world-x
    this.d   = 1.0;      // starts at horizon
    this.alt = 0.80;

    // Z-approach state: 0 = tiny speck at horizon, 1 = looming overhead
    this.approachZ     = 0;
    this.approachSpeed = this.isFinal ? 0.06 : 0.045; // z-units/sec

    // Screen-space draw state (updated every frame in update())
    this.drawX     = CANVAS_W * 0.5;
    this.drawY     = HORIZON_Y - 20;
    this.drawScale = 0.04;

    // Pseudo-entity fields (applyDamage targets this directly)
    this.hp           = this.isFinal ? 900 : 550;
    this.maxHp        = this.hp;
    this.dead         = false; this.dying = false;
    this.killedByPlayer = false; this.killMoment = false; this.processedKill = false;
    this.type         = { domain: 'air', hitbox: 42, deathSprite: null };
    this.flags        = {}; this.data = {};

    this.nukeArmed    = true;
    this.bombBayOpen  = false;
    this.bombBayTimer = 0;
    this.nukeDropped  = false;
    this.nuke         = null;
    this.scoreValue   = this.isFinal ? 10000 : 6000;

    // Fighter escorts
    this.escorts    = [];
    this.maxEscorts = this.isFinal ? 4 : 2;
    this._initEscorts();

    // Debris particles after destruction
    this.deathParticles = [];
    this.destroyed      = false;    // visual-only destroyed state (before removed)
  }

  _initEscorts() {
    for (let i = 0; i < this.maxEscorts; i++) {
      const side    = i % 2 === 0 ? 1 : -1;
      const offsetX = side * (0.12 + Math.floor(i/2) * 0.08);
      const offsetA = -0.04 - Math.floor(i/2) * 0.04;
      const escort  = new FighterEscort(offsetX, offsetA, this);
      this.escorts.push(escort);
    }
  }

  get alive() {
    // Dead once hp==0 AND nuke resolved (either dropped or averted)
    return !this.dead && !this.nukeDropped;
  }

  hitTestScreen(weapon, clickX, clickY) {
    if (!weapon.targetDomains.includes('air')) return null;
    if (this.dead) return null;
    // Use screen-space draw position (z-approach canonical state)
    if (screenDist(clickX, clickY, this.drawX, this.drawY) <= 80 * this.drawScale) return this;
    // Check escorts (positioned relative to bomber draw coords)
    for (const esc of this.escorts) {
      if (esc.dead) continue;
      const ex = this.drawX + esc.offsetX * 100 * this.drawScale;
      const ey = this.drawY + esc.offsetAlt * 80  * this.drawScale;
      if (screenDist(clickX, clickY, ex, ey) <= 20 * this.drawScale) return esc;
    }
    return null;
  }

  update(game, dt) {
    if (this.dead) {
      // Drift debris
      for (const p of this.deathParticles) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt; p.alpha = Math.max(0, p.life / p.maxLife);
      }
      this.deathParticles = this.deathParticles.filter(p => p.life > 0);
      return;
    }

    // Z-approach: advance from horizon toward player
    this.approachZ = Math.min(1.0, this.approachZ + this.approachSpeed * dt);

    // Update canonical screen-space draw state
    this.drawScale = lerp(0.04, 1.2, this.approachZ) * this.scale;
    this.drawX     = CANVAS_W * 0.5;
    this.drawY     = lerp(HORIZON_Y - 20, 80, this.approachZ);

    // Sync world-d so SAM targeting & escorts get a sensible depth
    this.d = lerp(1.0, 0.04, this.approachZ);

    // Open bomb bay when close enough (approachZ >= 0.85)
    if (!this.nukeDropped && !this.dead && this.approachZ >= 0.85 && !this.bombBayOpen) {
      this.bombBayOpen = true;
      this.bombBayTimer = 0;
    }
    if (this.bombBayOpen) {
      this.bombBayTimer += dt;
      if (this.bombBayTimer >= 2.0 && !this.nukeDropped) {
        this.nukeDropped = true;
        game.nukeDetonated = true;
      }
    }

    // Update escorts
    for (const esc of this.escorts) {
      if (!esc.dead) esc.update(game, dt);
    }

    // Death check
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.killedByPlayer = true;
      this.killMoment = true;
      // Spawn debris particles at current screen position
      for (let i = 0; i < 22; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 80;
        this.deathParticles.push({
          x: this.drawX, y: this.drawY,
          vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
          life: 1.2 + Math.random()*1.5, maxLife: 2.5,
          alpha: 1, size: 3 + Math.random()*6,
          color: Math.random() < 0.5 ? '#ff6600' : '#ffcc00',
        });
      }
    }
  }

  draw(ctx) {
    // Debris particles from death
    for (const p of this.deathParticles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (this.dead) return;

    const S  = this.drawScale; // canonical draw scale (z-based)
    const cx = this.drawX;
    const cy = this.drawY;

    ctx.save();
    ctx.translate(cx, cy);

    // ── FRONT-FACING SILHOUETTE (approaching from horizon) ────────────
    // Fuselage: tall narrow ellipse (foreshortened front view)
    ctx.fillStyle = '#2a2a35';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6*S, 22*S, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings: wide swept (front view — full wingspan visible)
    ctx.fillStyle = '#1e1e28';
    // Right wing
    ctx.beginPath();
    ctx.moveTo(0,    -5*S);
    ctx.lineTo(90*S,  8*S);
    ctx.lineTo(90*S, 16*S);
    ctx.lineTo(0,    12*S);
    ctx.closePath();
    ctx.fill();
    // Left wing
    ctx.beginPath();
    ctx.moveTo(0,     -5*S);
    ctx.lineTo(-90*S,  8*S);
    ctx.lineTo(-90*S, 16*S);
    ctx.lineTo(0,     12*S);
    ctx.closePath();
    ctx.fill();

    // Wing highlight
    ctx.strokeStyle = '#3a3a50';
    ctx.lineWidth = 1.5 * Math.max(0.5, S);
    ctx.beginPath();
    ctx.moveTo(0, -2*S); ctx.lineTo(80*S, 10*S);
    ctx.moveTo(0, -2*S); ctx.lineTo(-80*S, 10*S);
    ctx.stroke();

    // 8 engine pods (4 per wing) — front-view: circles with glow
    const podX = [18, 34, 52, 68];
    for (const px of podX) {
      for (const side of [1, -1]) {
        const ex = px * S * side;
        const ey = (3 + px * 0.10) * S;
        ctx.fillStyle = '#111118';
        ctx.beginPath();
        ctx.arc(ex, ey, 4 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,140,0,0.55)';
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5 * S, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Nose (front view: slightly pointed ellipse)
    ctx.fillStyle = '#3a3a50';
    ctx.beginPath();
    ctx.ellipse(0, -20*S, 5*S, 7*S, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cockpit window
    ctx.fillStyle = '#7799cc';
    ctx.beginPath();
    ctx.ellipse(0, -13*S, 3*S, 4*S, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bomb bay doors
    if (this.bombBayOpen) {
      const openAmt = Math.min(1, this.bombBayTimer / 1.5);
      ctx.fillStyle = `rgba(10,10,10,${openAmt * 0.85})`;
      ctx.fillRect(-5*S, 4*S, 10*S, 20*S * openAmt);
      if (openAmt > 0.5) {
        const bAlpha = (openAmt - 0.5) * 2;
        ctx.fillStyle = `rgba(40,40,50,${bAlpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 14*S, 2.5*S, 8*S, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,0,0,${bAlpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, 14*S, 10*S, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // HP bar
    if (this.hp < this.maxHp) {
      const bw = 90 * S, bh = 7 * S;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-bw / 2, -36*S, bw, bh);
      ctx.fillStyle = this.hp > this.maxHp * 0.5 ? '#00dd44'
                    : this.hp > this.maxHp * 0.25 ? '#ffaa00' : '#ff3300';
      ctx.fillRect(-bw / 2, -36*S, bw * (this.hp / this.maxHp), bh);
      ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1;
      ctx.strokeRect(-bw / 2, -36*S, bw, bh);
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, Math.round(9 * S))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('BOMBER', 0, -36*S - 3);
    }

    ctx.restore();

    // Draw escorts (screen-relative to this bomber)
    for (const esc of this.escorts) {
      if (!esc.dead) esc.draw(ctx);
    }
  }
} // end BomberBoss


// ═══════════════════════════ MODULE-LEVEL API ════════════════════════════════

/**
 * Register boss hit-detection callbacks on the game object.
 * Called once from main.js initSystems().
 */
export function init(game, _data) {
  if (!game.bosses) game.bosses = [];

  // Click/hit test: returns a pseudo-entity (section or bomber) or null
  game.bossHitCallback = (weapon, screenX, screenY) => {
    for (const boss of game.bosses) {
      if (!boss.alive) continue;
      const hit = boss.hitTestScreen(weapon, screenX, screenY);
      if (hit) return hit;
    }
    return null;
  };

  // Splash damage: distribute to all sections near impact point
  game.bossSplashCallback = (weapon, worldX, worldD) => {
    for (const boss of game.bosses) {
      if (!boss.alive) continue;
      if (typeof boss.handleSplash === 'function') {
        boss.handleSplash(weapon, worldX, worldD);
      }
    }
  };

  // SAM guided missile targeting: find bomber targets using z-approach screen coords
  game.bossAirTargetCallback = (aimX, aimY, currentBestDist) => {
    let best = null; let bestDist = currentBestDist;
    for (const boss of game.bosses) {
      if (!(boss instanceof BomberBoss) || !boss.alive) continue;
      // Use canonical draw position (z-approach state)
      const dx = boss.drawX - aimX; const dy = boss.drawY - aimY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < bestDist) { bestDist = dist; best = boss; }
      // Escorts positioned relative to bomber draw coords
      for (const esc of boss.escorts) {
        if (esc.dead) continue;
        const ex = boss.drawX + esc.offsetX * 100 * boss.drawScale;
        const ey = boss.drawY + esc.offsetAlt * 80  * boss.drawScale;
        const ed = Math.sqrt((ex-aimX)**2 + (ey-aimY)**2);
        if (ed < bestDist) { bestDist = ed; best = esc; }
      }
    }
    return best ? { target: best, dist: bestDist } : null;
  };
}

/**
 * Spawn a boss and push it into game.bosses[].
 * Called from waveDirector.js.
 * @param {object} game
 * @param {'battleship'|'bomber'|'battleship_final'|'final'} type
 * @param {number} stageId
 * @param {number} [scale] - override scale (default: auto from type)
 */
export function spawnBoss(game, type, stageId, scale) {
  if (!game.bosses) game.bosses = [];
  let boss;
  if (type === 'battleship') {
    boss = new BattleshipBoss(stageId, scale || 1.0);
  } else if (type === 'battleship_final') {
    boss = new BattleshipBoss(stageId, scale || 1.5);
  } else if (type === 'bomber') {
    boss = new BomberBoss(stageId, scale || 1.0);
  } else if (type === 'final') {
    // Stage 10: bomber spawns immediately, battleship added after infantry clear
    // (waveDirector calls spawnBoss twice — once for 'bomber', once for 'battleship_final')
    boss = new BomberBoss(stageId, 1.2);
  }
  if (boss) game.bosses.push(boss);
}

/**
 * Update all bosses. Call every game tick from main.js update().
 */
export function update(game, dt) {
  if (!game.bosses) return;
  for (let i = game.bosses.length - 1; i >= 0; i--) {
    const boss = game.bosses[i];
    boss.update(game, dt);

    // Score + remove fully dead bosses
    if (!boss.alive) {
      if (boss.killedByPlayer && !boss.processedKill) {
        boss.processedKill = true;
        game.scoreApi && game.scoreApi.onKill(boss.scoreValue);
        game.audio && game.audio.play('explode');
      }
      // Remove: BomberBoss waits for deathParticles; BattleshipBoss removes immediately
      const hasParticles = boss.deathParticles && boss.deathParticles.length > 0;
      if (!hasParticles) {
        game.bosses.splice(i, 1);
      }
    }
  }
}

/**
 * Draw all bosses. Call from main.js renderPlaying() after entity draw loop.
 */
export function draw(ctx, game) {
  if (!game.bosses) return;
  for (const boss of game.bosses) {
    boss.draw(ctx);
  }
}

/**
 * Returns true if any boss is still alive (blocking wave completion).
 */
export function hasBossAlive(game) {
  if (!game.bosses || game.bosses.length === 0) return false;
  return game.bosses.some(b => b.alive);
}
