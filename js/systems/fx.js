// Visual-only systems: starfield, warp and scrolling floor, explosions
// (blast sprites, flashes, shockwave rings, sparks, debris), engine exhaust,
// popups, and screen shake, flash and glitch. Randomness comes from w.fxRng
// so effects never change gameplay.
import { spawn, remove } from '../core/pool.js';
import { FX } from '../gfx/art.js';
import { TAU } from '../core/util.js';

export const STAR_COLORS = 6;
export const POPUP_SEC = 0.9;
export const LABEL_SEC = 1.4;

// Particle styles.
export const DEBRIS = 0; // pixel chunk, falls a little
export const SPARK = 1; // bright streak along its velocity
export const GLOW = 2; // soft light dot that fades and shrinks

const EXHAUST_EVERY = 1 / 70; // seconds between exhaust puffs
const ENGINE_OFFSETS = [-9, 0, 0, 9]; // the centre engine puffs twice as often

export function initStars(w) {
  const S = w.stars;
  const rnd = w.fxRng;
  while (S.n < S.capacity) {
    const i = spawn(S);
    const depth = rnd();
    S.x[i] = rnd() * w.W;
    S.y[i] = rnd() * w.H;
    S.speed[i] = 12 + depth * depth * 70;
    S.size[i] = depth > 0.85 ? 2 : 1;
    S.phase[i] = rnd() * TAU;
    S.color[i] = (rnd() * STAR_COLORS) | 0;
  }
}

export function updateFx(w, dt) {
  // Ease the warp factor toward its target: a quick punch in, a longer coast out.
  const warp = w.cfg.warp;
  const tau = w.warpTarget > w.warp ? warp.rampUpSec : warp.rampDownSec;
  w.warp += (w.warpTarget - w.warp) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)));
  w.scroll += dt * w.warp;

  const S = w.stars;
  for (let i = 0; i < S.n; i++) {
    S.y[i] += S.speed[i] * w.warp * dt;
    if (S.y[i] > w.H) {
      S.y[i] -= w.H;
      S.x[i] = w.fxRng() * w.W;
    }
  }

  const B = w.blasts;
  const kinds = w.cfg.fxKinds;
  for (let i = B.n - 1; i >= 0; i--) {
    B.t[i] += dt;
    if (B.t[i] >= FX[kinds[B.kind[i]]].duration) remove(B, i);
  }

  const P = w.particles;
  const debrisDrag = Math.exp(-2.5 * dt);
  const sparkDrag = Math.exp(-3.5 * dt);
  for (let i = P.n - 1; i >= 0; i--) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) {
      remove(P, i);
      continue;
    }
    if (P.style[i] === DEBRIS) {
      P.vx[i] *= debrisDrag;
      P.vy[i] = P.vy[i] * debrisDrag + 50 * dt;
    } else if (P.style[i] === SPARK) {
      P.vx[i] *= sparkDrag;
      P.vy[i] *= sparkDrag;
    }
    P.x[i] += P.vx[i] * dt;
    P.y[i] += P.vy[i] * dt;
  }

  const R = w.rings;
  for (let i = R.n - 1; i >= 0; i--) {
    R.t[i] += dt;
    if (R.t[i] >= R.dur[i]) remove(R, i);
  }

  const U = w.popups;
  for (let i = U.n - 1; i >= 0; i--) {
    U.t[i] += dt;
    U.y[i] -= 26 * dt;
    if (U.t[i] >= (U.label[i] >= 0 ? LABEL_SEC : POPUP_SEC)) remove(U, i);
  }

  emitExhaust(w, dt);

  w.shake = w.shake > 0.1 ? w.shake * Math.exp(-7 * dt) : 0;
  if (w.warp > 3) w.shake = Math.max(w.shake, 1.2); // engine rumble at warp speed
  w.flash = w.flash > 0.01 ? w.flash * Math.exp(-5 * dt) : 0;
  w.glitch = Math.max(0, w.glitch - dt);
  w.player.muzzle = Math.max(0, w.player.muzzle - dt);
}

// Neon exhaust puffs from the ship's engines, longer and faster at warp.
function emitExhaust(w, dt) {
  const p = w.player;
  if (!p.alive || w.mode === 'title') return;
  const boost = 1 + (w.warp - 1) * 0.12;
  w.exhaustClock += dt * boost;
  const rnd = w.fxRng;
  const kind = w.cfg.fxKind.player;
  while (w.exhaustClock >= EXHAUST_EVERY) {
    w.exhaustClock -= EXHAUST_EVERY;
    const i = spawn(w.particles);
    if (i < 0) return;
    const P = w.particles;
    P.x[i] = p.x + ENGINE_OFFSETS[(rnd() * ENGINE_OFFSETS.length) | 0];
    P.y[i] = p.y + 18;
    P.vx[i] = (rnd() - 0.5) * 24;
    P.vy[i] = (90 + rnd() * 60) * boost;
    P.life[i] = P.maxLife[i] = 0.18 + rnd() * 0.14;
    P.size[i] = 6 + rnd() * 4;
    P.kind[i] = kind;
    P.color[i] = rnd() < 0.7 ? 1 : 3;
    P.style[i] = GLOW;
  }
}

export function spawnBlast(w, x, y, kind) {
  const B = w.blasts;
  const i = spawn(B);
  if (i < 0) return;
  B.x[i] = x;
  B.y[i] = y;
  B.t[i] = 0;
  B.kind[i] = kind;
}

function spawnBurst(w, x, y, kind, count, speed, style, lifeMin, lifeSpread) {
  const P = w.particles;
  const rnd = w.fxRng;
  const colors = FX[w.cfg.fxKinds[kind]].blast.length;
  for (let k = 0; k < count; k++) {
    const i = spawn(P);
    if (i < 0) return;
    const a = rnd() * TAU;
    const v = speed * (0.35 + 0.65 * rnd());
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = Math.cos(a) * v;
    P.vy[i] = Math.sin(a) * v;
    P.life[i] = P.maxLife[i] = lifeMin + rnd() * lifeSpread;
    P.size[i] = 3;
    P.kind[i] = kind;
    P.color[i] = 1 + ((rnd() * (colors - 1)) | 0);
    P.style[i] = style;
  }
}

// Pixel debris in the exploding object's own colours.
export const spawnDebris = (w, x, y, kind, count, speed) => spawnBurst(w, x, y, kind, count, speed, DEBRIS, 0.35, 0.45);

// Fast bright streaks flying out of an explosion.
export const spawnSparks = (w, x, y, kind, count, speed) => spawnBurst(w, x, y, kind, count, speed, SPARK, 0.25, 0.3);

// A short burst of light.
export function spawnFlash(w, x, y, kind, size, life) {
  const P = w.particles;
  const i = spawn(P);
  if (i < 0) return;
  P.x[i] = x;
  P.y[i] = y;
  P.vx[i] = 0;
  P.vy[i] = 0;
  P.life[i] = P.maxLife[i] = life;
  P.size[i] = size;
  P.kind[i] = kind;
  P.color[i] = 1;
  P.style[i] = GLOW;
}

// An expanding neon shockwave.
export function spawnRing(w, x, y, kind, r0, r1, dur, width = 3) {
  const R = w.rings;
  const i = spawn(R);
  if (i < 0) return;
  R.x[i] = x;
  R.y[i] = y;
  R.t[i] = 0;
  R.dur[i] = dur;
  R.r0[i] = r0;
  R.r1[i] = r1;
  R.width[i] = width;
  R.kind[i] = kind;
}

// A full explosion; size is about 1 for a small enemy and 2.5 for the player.
export function explode(w, x, y, kind, size) {
  if (FX[w.cfg.fxKinds[kind]].size) spawnBlast(w, x, y, kind);
  spawnFlash(w, x, y, kind, 30 * size, 0.12 + 0.04 * size);
  spawnRing(w, x, y, kind, 4 * size, 14 + 18 * size, 0.28 + 0.08 * size, 2 + size);
  spawnSparks(w, x, y, kind, Math.round(6 + 7 * size), 150 + 60 * size);
  spawnDebris(w, x, y, kind, Math.round(3 + 4 * size), 60 + 30 * size);
}

export function spawnPopup(w, x, y, value, kind) {
  const U = w.popups;
  const i = spawn(U);
  if (i < 0) return;
  U.x[i] = x;
  U.y[i] = y;
  U.t[i] = 0;
  U.value[i] = value;
  U.kind[i] = kind;
  U.label[i] = -1;
}

// Announces a collected power-up by name above the player. Earlier labels
// still on screen move up a line so quick pickups don't overprint.
export function spawnLabel(w, x, y, power) {
  const U = w.popups;
  for (let k = 0; k < U.n; k++) if (U.label[k] >= 0) U.y[k] -= 12;
  const i = spawn(U);
  if (i < 0) return;
  U.x[i] = x;
  U.y[i] = y;
  U.t[i] = 0;
  U.value[i] = 0;
  U.kind[i] = 0;
  U.label[i] = power;
}

export function addShake(w, magnitude) {
  w.shake = Math.max(w.shake, magnitude);
}
