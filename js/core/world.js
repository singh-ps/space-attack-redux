// The world is plain data: singletons for the player and game flow, and
// structure-of-arrays pools for everything that comes in numbers. Systems in
// js/systems/ are functions that read and write these arrays.
import { createPool, spawn, clear } from './pool.js';
import { mulberry32 } from './util.js';
import { artSize } from '../gfx/art.js';

// Enemy flight states.
export const ST = { FORMATION: 0, PEEL: 1, DIVE: 2, RETURN: 3 };

const F = Float32Array;

export function createWorld(cfg, seed) {
  const W = cfg.canvas.width;
  const H = cfg.canvas.height;
  const shipSize = artSize('player');
  const hitScale = cfg.player.hitboxScale;
  return {
    cfg,
    W,
    H,
    rng: mulberry32(seed),
    time: 0,
    mode: 'title',
    modeTime: 0,
    paused: false,
    godMode: false,
    levelIndex: 0,
    level: cfg.levels[0],
    score: 0,
    hiScore: 0,
    newHiScore: false,
    lives: 0,
    player: {
      x: W / 2,
      y: H - 62,
      vx: 0,
      vxSmooth: 0,
      alive: false,
      cooldown: 0,
      invuln: 0,
      halfW: (shipSize.w / 2) * hitScale,
      halfH: (shipSize.h / 2) * hitScale,
      minX: shipSize.w / 2 + 6,
      maxX: W - shipSize.w / 2 - 6,
    },
    // Per-type hitbox half extents, indexed by enemy type id.
    enemyHalfW: Float32Array.from(cfg.types.names, (n) => (artSize(n).w / 2) * 0.85),
    enemyHalfH: Float32Array.from(cfg.types.names, (n) => (artSize(n).h / 2) * 0.85),
    formation: { offset: 0, dir: 1 },
    diveTimer: 0,
    enemies: createPool(64, {
      type: Uint8Array,
      state: Uint8Array,
      col: Uint8Array,
      row: Uint8Array,
      x: F,
      y: F,
      vx: F,
      vy: F,
      desiredVx: F,
      turnTimer: F,
      fireTimer: F,
      stateTime: F,
      peelX: F,
      peelY: F,
      peelDir: Int8Array,
      weave: Int8Array,
      appear: F,
    }),
    playerBullets: createPool(16, { x: F, y: F }),
    enemyBullets: createPool(64, { x: F, y: F, vy: F, kind: Uint8Array }),
    blasts: createPool(48, { x: F, y: F, t: F, kind: Uint8Array }),
    particles: createPool(512, { x: F, y: F, vx: F, vy: F, life: F, maxLife: F, kind: Uint8Array, color: Uint8Array }),
    popups: createPool(24, { x: F, y: F, t: F, value: Uint32Array, kind: Uint8Array }),
    stars: createPool(96, { x: F, y: F, speed: F, size: F, phase: F, color: Uint8Array }),
    banner: null,
    shake: 0,
    // Things that happened this frame (shots, deaths, level changes) for the
    // audio layer to react to; main.js drains it every frame.
    events: [],
  };
}

export const playerKind = (w) => w.cfg.types.count;

export function slotX(w, col) {
  const f = w.cfg.formation;
  return w.W / 2 + w.formation.offset + (col - (f.columns - 1) / 2) * f.spacingX;
}

export function slotY(w, row) {
  const f = w.cfg.formation;
  return f.topY + row * f.spacingY;
}

// Fills the enemy pool with the level's formation. Rows come from the top of
// formation.rows, so the omegas always lead and deltas fill the bottom.
export function buildFormation(w) {
  const E = w.enemies;
  const f = w.cfg.formation;
  const centre = (f.columns - 1) / 2;
  clear(E);
  w.formation.offset = 0;
  w.formation.dir = 1;
  f.rows.slice(0, w.level.rows).forEach((row, r) => {
    const type = w.cfg.typeIndex[row.type];
    for (const col of row.cols) {
      const i = spawn(E);
      if (i < 0) return;
      E.type[i] = type;
      E.state[i] = ST.FORMATION;
      E.col[i] = col;
      E.row[i] = r;
      E.x[i] = slotX(w, col);
      E.y[i] = slotY(w, r);
      E.vx[i] = 0;
      E.vy[i] = 0;
      E.desiredVx[i] = 0;
      E.stateTime[i] = 0;
      // Staggered warp-in: top rows first, centre columns before the edges.
      E.appear[i] = -(r * 0.12 + Math.abs(col - centre) * 0.04) / f.appearSec;
    }
  });
}
