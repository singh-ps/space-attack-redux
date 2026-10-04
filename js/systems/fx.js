// Visual-only systems: starfield and warp, blast sprites, debris, popups,
// screen shake and flash.
import { spawn, remove } from '../core/pool.js';
import { FX } from '../gfx/art.js';
import { TAU } from '../core/util.js';

export const STAR_COLORS = 6;
export const POPUP_SEC = 0.9;
export const LABEL_SEC = 1.4;

export function initStars(w) {
  const S = w.stars;
  while (S.n < S.capacity) {
    const i = spawn(S);
    const depth = w.rng();
    S.x[i] = w.rng() * w.W;
    S.y[i] = w.rng() * w.H;
    S.speed[i] = 12 + depth * depth * 70;
    S.size[i] = depth > 0.85 ? 2 : 1;
    S.phase[i] = w.rng() * TAU;
    S.color[i] = (w.rng() * STAR_COLORS) | 0;
  }
}

export function updateFx(w, dt) {
  // Ease the warp factor toward its target: a quick punch in, a longer coast out.
  const warp = w.cfg.warp;
  const tau = w.warpTarget > w.warp ? warp.rampUpSec : warp.rampDownSec;
  w.warp += (w.warpTarget - w.warp) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)));

  const S = w.stars;
  for (let i = 0; i < S.n; i++) {
    S.y[i] += S.speed[i] * w.warp * dt;
    if (S.y[i] > w.H) {
      S.y[i] -= w.H;
      S.x[i] = w.rng() * w.W;
    }
  }

  const B = w.blasts;
  const kinds = w.cfg.fxKinds;
  for (let i = B.n - 1; i >= 0; i--) {
    B.t[i] += dt;
    if (B.t[i] >= FX[kinds[B.kind[i]]].duration) remove(B, i);
  }

  const P = w.particles;
  const drag = Math.exp(-2.5 * dt);
  for (let i = P.n - 1; i >= 0; i--) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) {
      remove(P, i);
      continue;
    }
    P.vx[i] *= drag;
    P.vy[i] = P.vy[i] * drag + 50 * dt;
    P.x[i] += P.vx[i] * dt;
    P.y[i] += P.vy[i] * dt;
  }

  const U = w.popups;
  for (let i = U.n - 1; i >= 0; i--) {
    U.t[i] += dt;
    U.y[i] -= 26 * dt;
    if (U.t[i] >= (U.label[i] >= 0 ? LABEL_SEC : POPUP_SEC)) remove(U, i);
  }

  w.shake = w.shake > 0.1 ? w.shake * Math.exp(-7 * dt) : 0;
  if (w.warp > 3) w.shake = Math.max(w.shake, 1.2); // engine rumble at warp speed
  w.flash = w.flash > 0.01 ? w.flash * Math.exp(-5 * dt) : 0;
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

// Pixel debris in the exploding object's own colours.
export function spawnDebris(w, x, y, kind, count, speed) {
  const P = w.particles;
  const colors = FX[w.cfg.fxKinds[kind]].blast.length;
  for (let k = 0; k < count; k++) {
    const i = spawn(P);
    if (i < 0) return;
    const a = w.rng() * TAU;
    const v = speed * (0.35 + 0.65 * w.rng());
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = Math.cos(a) * v;
    P.vy[i] = Math.sin(a) * v;
    P.life[i] = P.maxLife[i] = 0.35 + w.rng() * 0.45;
    P.kind[i] = kind;
    P.color[i] = 1 + ((w.rng() * (colors - 1)) | 0);
  }
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
