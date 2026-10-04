// Power-up pickups: random drops from destroyed enemies, collection, the
// power timers they start, and the shield's hit absorption.
import { POWERS } from '../core/config.js';
import { spawn, remove, clear } from '../core/pool.js';
import { clamp } from '../core/util.js';
import { PICKUP_ART_SIZE, PIXEL } from '../gfx/art.js';
import { explode, spawnRing, spawnSparks, spawnLabel } from './fx.js';

export const POWER = Object.fromEntries(POWERS.map((name, i) => [name, i]));
const PICKUP_HALF = (PICKUP_ART_SIZE * PIXEL) / 2;

export const hasPower = (w, k) => w.powerTime[k] > 0;

// Rolls the destroyed enemy's drop chance; on success a random power capsule
// starts falling from where it died.
export function maybeDropPickup(w, x, y, type) {
  const K = w.pickups;
  const cfg = w.cfg.pickups;
  if (w.rng() >= w.cfg.types.dropChance[type]) return;
  if (K.n >= cfg.maxOnScreen || w.time - w.lastDropTime < cfg.minGapSec) return;
  const kind = pickPower(w);
  if (kind >= 0 && spawnPickup(w, x, y, kind)) w.lastDropTime = w.time;
}

export function spawnPickup(w, x, y, kind) {
  const K = w.pickups;
  const i = spawn(K);
  if (i < 0) return false;
  K.x[i] = clamp(x, PICKUP_HALF + 4, w.W - PICKUP_HALF - 4);
  K.y[i] = y;
  K.t[i] = 0;
  K.kind[i] = kind;
  return true;
}

function pickPower(w) {
  const weight = w.cfg.powers.weight;
  let total = 0;
  for (let k = 0; k < weight.length; k++) total += weight[k];
  if (total <= 0) return -1;
  let r = w.rng() * total;
  let last = -1;
  for (let k = 0; k < weight.length; k++) {
    if (weight[k] <= 0) continue;
    last = k;
    r -= weight[k];
    if (r < 0) return k;
  }
  return last;
}

export function updatePickups(w, dt) {
  const K = w.pickups;
  const p = w.player;
  const fall = w.cfg.pickups.fallSpeed;
  for (let i = K.n - 1; i >= 0; i--) {
    K.t[i] += dt;
    K.y[i] += fall * dt;
    const touching =
      p.alive && Math.abs(K.x[i] - p.x) <= PICKUP_HALF + p.halfW && Math.abs(K.y[i] - p.y) <= PICKUP_HALF + p.halfH;
    if (touching) {
      grantPower(w, K.kind[i]);
      remove(K, i);
    } else if (K.y[i] > w.H + PICKUP_HALF) {
      remove(K, i);
    }
  }
}

// Collecting a power starts (or restarts) its timer; powers stack.
export function grantPower(w, k) {
  const duration = w.cfg.powers.duration[k];
  w.powerTime[k] = duration > 0 ? duration : Infinity;
  if (k === POWER.shield) w.player.shieldHits = w.cfg.weapon.shieldHits;
  const p = w.player;
  const kind = w.cfg.fxKind[POWERS[k]];
  spawnRing(w, p.x, p.y, kind, 10, 50, 0.4, 3);
  spawnSparks(w, p.x, p.y, kind, 10, 160);
  spawnLabel(w, p.x, p.y - 34, k);
  w.events.push({ type: 'powerUp', power: k });
}

// Timers only run during active play, so level transitions don't eat them.
export function updatePowers(w, dt) {
  for (let k = 0; k < w.powerTime.length; k++) {
    if (w.powerTime[k] <= 0) continue;
    w.powerTime[k] = Math.max(0, w.powerTime[k] - dt);
    if (w.powerTime[k] > 0) continue;
    if (k === POWER.shield) w.player.shieldHits = 0;
    w.events.push({ type: 'powerDown', power: k });
  }
}

export function clearPowers(w) {
  w.powerTime.fill(0);
  w.player.shieldHits = 0;
  w.player.volleysLeft = 0;
}

export function clearPickups(w) {
  clear(w.pickups);
  w.lastDropTime = -Infinity;
}

// Returns true when an active shield soaks up a hit. The hit that breaks it
// leaves a short grace period so a bullet spread can't kill on the next frame.
export function absorbHit(w) {
  const p = w.player;
  if (!hasPower(w, POWER.shield) || p.shieldHits <= 0) return false;
  p.shieldHits -= 1;
  const kind = w.cfg.fxKind.shield;
  if (p.shieldHits > 0) {
    spawnRing(w, p.x, p.y, kind, 20, 34, 0.25, 2);
    w.events.push({ type: 'shieldHit' });
    return true;
  }
  w.powerTime[POWER.shield] = 0;
  p.invuln = Math.max(p.invuln, w.cfg.weapon.shieldGraceSec);
  explode(w, p.x, p.y, kind, 1.4);
  spawnRing(w, p.x, p.y, kind, 24, 72, 0.4, 3);
  w.events.push({ type: 'shieldBreak' });
  return true;
}
