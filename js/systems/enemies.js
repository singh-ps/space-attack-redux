// Enemy systems: formation sway, dive launches, and the shared dive/steer
// motion. Every enemy type runs the same code; per-type differences (turn
// cooldown, targeting strategy) are looked up from the compiled config tables.
import { ST, slotX, slotY } from '../core/world.js';
import { remove } from '../core/pool.js';
import { approach, clamp } from '../core/util.js';
import { TARGETING } from './targeting.js';

const EDGE = 18; // divers stay this far inside the side walls
const EXIT_PAD = 24; // how far past the bottom edge a diver goes before it exits
const STEER_STOP = 30; // divers stop turning once this close above the player

export function updateFormation(w, dt) {
  const f = w.cfg.formation;
  const form = w.formation;
  form.offset += form.dir * f.swaySpeed * w.level.speedMul * dt;
  if (form.offset > f.swayRangePx) {
    form.offset = f.swayRangePx;
    form.dir = -1;
  } else if (form.offset < -f.swayRangePx) {
    form.offset = -f.swayRangePx;
    form.dir = 1;
  }
  const E = w.enemies;
  const appearStep = dt / f.appearSec;
  for (let i = 0; i < E.n; i++) {
    if (E.appear[i] < 1) E.appear[i] = Math.min(1, E.appear[i] + appearStep);
    if (E.state[i] === ST.FORMATION) {
      E.x[i] = slotX(w, E.col[i]);
      E.y[i] = slotY(w, E.row[i]);
    }
  }
}

// Enemies peeling off or diving, i.e. currently attacking.
export function countAttacking(w) {
  const E = w.enemies;
  let n = 0;
  for (let i = 0; i < E.n; i++) if (E.state[i] === ST.PEEL || E.state[i] === ST.DIVE) n++;
  return n;
}

// Periodically detaches an enemy from the formation to start a dive.
export function updateDiveLaunches(w, dt) {
  if (w.mode !== 'playing' || !w.player.alive) return;
  w.diveTimer -= dt;
  if (w.diveTimer > 0) return;
  w.diveTimer = w.level.diveIntervalSec * (0.7 + 0.6 * w.rng());
  if (countAttacking(w) >= w.level.maxDivers) return;
  const i = pickDiver(w);
  if (i >= 0) launch(w, i);
}

function pickDiver(w) {
  const E = w.enemies;
  const weight = w.cfg.types.diveWeight;
  const ready = (i) => E.state[i] === ST.FORMATION && E.appear[i] >= 1;
  let total = 0;
  for (let i = 0; i < E.n; i++) if (ready(i)) total += weight[E.type[i]];
  if (total <= 0) return -1;
  let r = w.rng() * total;
  let last = -1;
  for (let i = 0; i < E.n; i++) {
    if (!ready(i)) continue;
    last = i;
    r -= weight[E.type[i]];
    if (r <= 0) return i;
  }
  return last;
}

function launch(w, i) {
  const E = w.enemies;
  const centre = (w.cfg.formation.columns - 1) / 2;
  const type = E.type[i];
  E.state[i] = ST.PEEL;
  E.stateTime[i] = 0;
  E.peelX[i] = E.x[i];
  E.peelY[i] = E.y[i];
  // Peel outward, away from the middle of the formation.
  E.peelDir[i] = E.col[i] < centre ? -1 : E.col[i] > centre ? 1 : w.rng() < 0.5 ? -1 : 1;
  E.weave[i] = w.rng() < 0.5 ? -1 : 1;
  E.turnTimer[i] = 0;
  E.fireTimer[i] = w.cfg.enemyFire.firstShotDelaySec + w.rng() * w.cfg.types.fireCooldown[type];
}

export function updateEnemyMotion(w, dt) {
  const E = w.enemies;
  const T = w.cfg.types;
  const D = w.cfg.dive;
  const p = w.player;
  const mul = w.level.speedMul;
  const fallSpeed = D.speed * mul;
  const lateralMax = D.lateralSpeed * mul;
  const steerStep = D.steerAccel * mul * dt;

  // Backwards so an enemy removed on exit doesn't skip the one swapped in.
  for (let i = E.n - 1; i >= 0; i--) {
    const state = E.state[i];
    if (state === ST.PEEL) {
      // Half loop up and outward, ending pointed straight down.
      E.stateTime[i] += dt;
      const k = Math.min(E.stateTime[i] / D.peelSec, 1);
      const a = k * Math.PI;
      E.x[i] = E.peelX[i] + E.peelDir[i] * D.peelRadius * (1 - Math.cos(a));
      E.y[i] = E.peelY[i] - D.peelRadius * Math.sin(a);
      if (k >= 1) {
        E.state[i] = ST.DIVE;
        E.stateTime[i] = 0;
        E.vx[i] = 0;
        E.desiredVx[i] = 0;
        E.vy[i] = fallSpeed;
      }
    } else if (state === ST.DIVE) {
      // Falls at a constant speed; turns only change the horizontal component,
      // and a new turn decision waits for the type's turn cooldown.
      E.stateTime[i] += dt;
      E.vy[i] = fallSpeed;
      if (p.alive && E.y[i] < p.y - STEER_STOP) {
        E.turnTimer[i] -= dt;
        if (E.turnTimer[i] <= 0) {
          const type = E.type[i];
          const targetX = clamp(TARGETING[T.targetMode[type]](w, i), EDGE, w.W - EDGE);
          E.desiredVx[i] = clamp((targetX - E.x[i]) * D.steerGain, -lateralMax, lateralMax);
          E.turnTimer[i] = T.turnCooldown[type];
        }
      }
      E.vx[i] = approach(E.vx[i], E.desiredVx[i], steerStep);
      E.x[i] += E.vx[i] * dt;
      E.y[i] += E.vy[i] * dt;
      if (E.x[i] < EDGE || E.x[i] > w.W - EDGE) {
        E.x[i] = clamp(E.x[i], EDGE, w.W - EDGE);
        E.vx[i] = 0;
        E.desiredVx[i] = 0;
      }
      if (E.y[i] > w.H + EXIT_PAD) exitBottom(w, i);
    } else if (state === ST.RETURN) {
      // Fly back into the (moving) formation slot.
      E.stateTime[i] += dt;
      const dx = slotX(w, E.col[i]) - E.x[i];
      const dy = slotY(w, E.row[i]) - E.y[i];
      const dist = Math.hypot(dx, dy);
      const step = D.returnSpeed * mul * dt;
      if (dist <= step) {
        E.x[i] += dx;
        E.y[i] += dy;
        E.state[i] = ST.FORMATION;
        E.stateTime[i] = 0;
      } else {
        E.x[i] += (dx / dist) * step;
        E.y[i] += (dy / dist) * step;
      }
    }
  }
}

function exitBottom(w, i) {
  const E = w.enemies;
  if (w.cfg.dive.onExitBottom === 'remove') {
    remove(E, i);
    return;
  }
  // As in the original arcade game: wrap to the top and rejoin the formation.
  E.state[i] = ST.RETURN;
  E.stateTime[i] = 0;
  E.y[i] = -EXIT_PAD;
  E.vx[i] = 0;
  E.desiredVx[i] = 0;
}
