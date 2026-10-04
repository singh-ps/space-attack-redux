// Player movement and firing, enemy fire, bullets and collisions.
import { ST, playerKind } from '../core/world.js';
import { spawn, remove } from '../core/pool.js';
import { clamp } from '../core/util.js';
import { spawnBlast, spawnDebris, spawnPopup, addShake } from './fx.js';
import { POWER, hasPower, absorbHit, clearPowers, maybeDropPickup } from './pickups.js';

export const PLAYER_BULLET = { halfW: 1.5, halfH: 6 };
export const ENEMY_BULLET = { halfW: 1.5, halfH: 4.5 };

export function updatePlayer(w, dt, input, firePressed) {
  const p = w.player;
  const P = w.cfg.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (!p.alive) {
    p.vx = 0;
    p.vxSmooth = 0;
    return;
  }
  const dir = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
  const prevX = p.x;
  p.x = clamp(p.x + dir * P.speed * dt, p.minX, p.maxX);
  p.vx = (p.x - prevX) / dt;
  // Smoothed velocity feeds the omega's predictive targeting.
  p.vxSmooth += (p.vx - p.vxSmooth) * Math.min(1, dt * 5);

  // A press fires as soon as the cooldown allows; with auto fire, holding the
  // key keeps firing at the cooldown rate. Presses during the cooldown are dropped.
  const wantsFire = firePressed || (P.autoFire && input.down('fire'));
  const WPN = w.cfg.weapon;
  if (wantsFire && p.cooldown <= 0) {
    fireVolley(w);
    p.cooldown = P.fireCooldownSec * (hasPower(w, POWER.attackSpeed) ? WPN.attackSpeedMul : 1);
    if (hasPower(w, POWER.multi)) {
      p.volleysLeft = WPN.multiVolleys;
      p.volleyTimer = WPN.multiGapSec;
    }
  }
  // Multi shot: extra volleys follow the main one in quick succession.
  if (p.volleysLeft > 0) {
    p.volleyTimer -= dt;
    if (p.volleyTimer <= 0) {
      fireVolley(w);
      p.volleysLeft -= 1;
      p.volleyTimer += WPN.multiGapSec;
    }
  }
}

// One volley: a centre shot (two side by side with double shot), plus the
// angled shots of scatter shot.
function fireVolley(w) {
  const p = w.player;
  const WPN = w.cfg.weapon;
  const speed = w.cfg.player.bulletSpeed;
  const y = p.y - p.halfH - 8;
  if (hasPower(w, POWER.double)) {
    addBullet(w, p.x - WPN.doubleHalfGap, y, 0, -speed);
    addBullet(w, p.x + WPN.doubleHalfGap, y, 0, -speed);
  } else {
    addBullet(w, p.x, y, 0, -speed);
  }
  if (hasPower(w, POWER.scatter)) {
    for (let k = 0; k < WPN.scatterSin.length; k++) {
      addBullet(w, p.x, y, WPN.scatterSin[k] * speed, -WPN.scatterCos[k] * speed);
    }
  }
  w.events.push({ type: 'playerFire' });
}

function addBullet(w, x, y, vx, vy) {
  const PB = w.playerBullets;
  const b = spawn(PB);
  if (b < 0) return;
  PB.x[b] = x;
  PB.y[b] = y;
  PB.vx[b] = vx;
  PB.vy[b] = vy;
}

// Enemies only shoot while diving, straight down, and never faster than their
// type's fire cooldown. The level also caps enemy bullets on screen.
export function updateEnemyFire(w, dt) {
  const E = w.enemies;
  const T = w.cfg.types;
  const F = w.cfg.enemyFire;
  const EB = w.enemyBullets;
  const p = w.player;
  const canShoot = w.mode === 'playing' && p.alive;
  for (let i = 0; i < E.n; i++) {
    if (E.state[i] !== ST.DIVE) continue;
    E.fireTimer[i] -= dt;
    if (!canShoot || E.fireTimer[i] > 0) continue;
    if (E.y[i] > p.y - F.minGapAbovePlayerPx) continue;
    if (Math.abs(E.x[i] - p.x) > F.rangeXPx) continue;
    if (EB.n >= w.level.maxEnemyBullets) continue;
    const b = spawn(EB);
    if (b < 0) continue;
    const type = E.type[i];
    EB.x[b] = E.x[i];
    EB.y[b] = E.y[i] + w.enemyHalfH[type];
    EB.vy[b] = T.bulletSpeed[type];
    EB.kind[b] = type;
    E.fireTimer[i] = T.fireCooldown[type] * (1 + 0.35 * w.rng());
    w.events.push({ type: 'enemyFire', tier: T.tier[type] });
  }
}

export function updateBullets(w, dt) {
  const PB = w.playerBullets;
  for (let i = PB.n - 1; i >= 0; i--) {
    PB.x[i] += PB.vx[i] * dt;
    PB.y[i] += PB.vy[i] * dt;
    if (PB.y[i] < -20 || PB.x[i] < -20 || PB.x[i] > w.W + 20) remove(PB, i);
  }
  const EB = w.enemyBullets;
  for (let i = EB.n - 1; i >= 0; i--) {
    EB.y[i] += EB.vy[i] * dt;
    if (EB.y[i] > w.H + 20) remove(EB, i);
  }
}

export function updateCollisions(w) {
  const E = w.enemies;
  const PB = w.playerBullets;
  for (let b = PB.n - 1; b >= 0; b--) {
    for (let i = E.n - 1; i >= 0; i--) {
      if (E.appear[i] < 1) continue;
      const type = E.type[i];
      if (
        Math.abs(PB.x[b] - E.x[i]) <= w.enemyHalfW[type] + PLAYER_BULLET.halfW &&
        Math.abs(PB.y[b] - E.y[i]) <= w.enemyHalfH[type] + PLAYER_BULLET.halfH
      ) {
        destroyEnemy(w, i, true);
        remove(PB, b);
        break;
      }
    }
  }

  // An active shield soaks up hits; its last hit starts a short grace period,
  // which ends the checks for this step via the invuln test.
  const p = w.player;
  if (!p.alive || p.invuln > 0 || w.godMode) return;
  const EB = w.enemyBullets;
  for (let b = EB.n - 1; b >= 0; b--) {
    if (
      Math.abs(EB.x[b] - p.x) <= p.halfW + ENEMY_BULLET.halfW &&
      Math.abs(EB.y[b] - p.y) <= p.halfH + ENEMY_BULLET.halfH
    ) {
      remove(EB, b);
      if (!absorbHit(w)) return killPlayer(w);
      if (p.invuln > 0) return;
    }
  }
  for (let i = E.n - 1; i >= 0; i--) {
    if (E.state[i] === ST.FORMATION) continue;
    const type = E.type[i];
    if (
      Math.abs(E.x[i] - p.x) <= w.enemyHalfW[type] + p.halfW &&
      Math.abs(E.y[i] - p.y) <= w.enemyHalfH[type] + p.halfH
    ) {
      // Ramming with a shield up counts as your kill.
      const shielded = absorbHit(w);
      destroyEnemy(w, i, shielded);
      if (!shielded) return killPlayer(w);
      if (p.invuln > 0) return;
    }
  }
}

// One hit destroys any enemy. Shots score more against higher tiers and
// against enemies out of formation.
export function destroyEnemy(w, i, byPlayer) {
  const E = w.enemies;
  const T = w.cfg.types;
  const type = E.type[i];
  const tier = T.tier[type];
  const inFlight = E.state[i] !== ST.FORMATION;
  if (byPlayer) {
    const points = inFlight ? T.scoreFlight[type] : T.scoreFormation[type];
    w.score += points;
    if (w.score > w.hiScore) {
      w.hiScore = w.score;
      w.newHiScore = true;
    }
    if (inFlight) spawnPopup(w, E.x[i], E.y[i], points, type);
    maybeDropPickup(w, E.x[i], E.y[i], type);
  }
  spawnBlast(w, E.x[i], E.y[i], type);
  spawnDebris(w, E.x[i], E.y[i], type, 8 + tier * 4, 70 + tier * 30);
  if (tier >= 3) addShake(w, 3);
  w.events.push({ type: 'enemyDeath', tier, inFlight });
  remove(E, i);
}

function killPlayer(w) {
  const p = w.player;
  const kind = playerKind(w);
  p.alive = false;
  w.lives -= 1;
  clearPowers(w);
  spawnBlast(w, p.x, p.y, kind);
  spawnDebris(w, p.x, p.y, kind, 30, 170);
  addShake(w, 8);
  w.events.push({ type: 'playerDeath', livesLeft: w.lives });
}
