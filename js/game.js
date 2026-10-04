// Game flow and the per-frame system schedule. Modes run
// title → intro → playing ⇄ dying → cleared (warp jump) → intro … → victory | gameover.
import { compileConfig } from './core/config.js';
import { createWorld, buildFormation } from './core/world.js';
import { clear } from './core/pool.js';
import { pad } from './core/util.js';
import { updatePlayer, updateEnemyFire, updateBullets, updateCollisions, destroyEnemy } from './systems/combat.js';
import { updateFormation, updateDiveLaunches, updateEnemyMotion, countAttacking } from './systems/enemies.js';
import { initStars, updateFx } from './systems/fx.js';
import { updatePickups, updatePowers, clearPowers, clearPickups, spawnPickup } from './systems/pickups.js';
import { POWERS } from './core/config.js';

const MAX_STEP = 1 / 120; // simulation substep; keeps fast bullets from tunnelling
export const PAUSABLE = new Set(['intro', 'playing', 'dying', 'cleared']);

export function createGame(rawConfig, { seed = 1, hiScore = 0 } = {}) {
  const cfg = compileConfig(rawConfig);
  const w = createWorld(cfg, seed);
  const lastLevel = cfg.levels.length - 1;
  w.hiScore = hiScore;
  initStars(w);

  function setMode(mode, banner = null) {
    w.mode = mode;
    w.modeTime = 0;
    w.banner = banner;
    w.warpTarget = 1; // only the level-clear jump runs at warp speed
  }

  function newGame() {
    w.score = 0;
    w.lives = cfg.player.lives;
    w.newHiScore = false;
    clearPowers(w);
    clearPickups(w);
    startLevel(0);
  }

  function startLevel(index) {
    w.levelIndex = index;
    w.level = cfg.levels[index];
    buildFormation(w);
    clear(w.playerBullets);
    clear(w.enemyBullets);
    resetPlayer(0);
    w.diveTimer = w.level.diveIntervalSec * 0.5;
    w.levelScroll = w.scroll; // each level is a new sector of space
    if (w.warpTarget > 1) {
      // Dropping out of warp into the new sector.
      w.flash = 0.5;
      w.events.push({ type: 'warpEnd' });
    }
    setMode('intro', {
      style: 'level',
      kicker: index === 0 ? 'GET READY' : 'LEVEL UP',
      title: `LEVEL ${index + 1}`,
      sub: index === lastLevel ? 'FINAL LEVEL' : index === 0 ? 'DESTROY EVERY INVADER' : 'ENEMIES ARE FASTER',
      duration: cfg.timing.levelIntroSec,
    });
    w.events.push({ type: 'levelStart', level: index });
  }

  function resetPlayer(invuln) {
    const p = w.player;
    p.x = w.W / 2;
    p.vx = 0;
    p.vxSmooth = 0;
    p.cooldown = 0;
    p.invuln = invuln;
    p.alive = true;
  }

  function respawn() {
    clear(w.enemyBullets);
    resetPlayer(cfg.player.respawnInvulnSec);
    w.diveTimer = w.level.diveIntervalSec * 0.5;
    setMode('playing');
    w.events.push({ type: 'respawn' });
  }

  function enterDying() {
    if (w.lives <= 0) return setMode('dying');
    setMode('dying', {
      style: 'lost',
      title: 'SHIP DESTROYED',
      sub: w.lives === 1 ? 'LAST SHIP - STAY SHARP!' : `${w.lives} SHIPS LEFT`,
      alert: w.lives === 1,
      duration: cfg.player.respawnDelaySec,
    });
  }

  function enterCleared() {
    clear(w.enemyBullets);
    if (w.levelIndex >= lastLevel) return enterVictory();
    setMode('cleared', {
      style: 'clear',
      kicker: `LEVEL ${w.levelIndex + 1} COMPLETE`,
      title: 'SECTOR CLEARED',
      sub: `WARPING TO LEVEL ${w.levelIndex + 2}`,
      duration: cfg.timing.levelClearSec,
    });
    w.events.push({ type: 'levelClear', level: w.levelIndex });
  }

  function enterGameOver() {
    setMode('gameover', {
      style: 'gameover',
      kicker: 'ALL SHIPS LOST',
      title: 'GAME OVER',
      sub: `FINAL SCORE ${pad(w.score, 6)}`,
      note: w.newHiScore ? 'NEW HIGH SCORE!' : '',
      restart: true,
    });
    w.events.push({ type: 'gameOver', score: w.score, hiScore: w.hiScore });
  }

  function enterVictory() {
    setMode('victory', {
      style: 'victory',
      kicker: `ALL ${cfg.levels.length} LEVELS CLEARED`,
      title: 'VICTORY!',
      sub: `FINAL SCORE ${pad(w.score, 6)}`,
      note: w.newHiScore ? 'NEW HIGH SCORE!' : '',
      restart: true,
    });
    w.events.push({ type: 'victory', score: w.score, hiScore: w.hiScore });
  }

  function updateFlow() {
    const t = w.modeTime;
    switch (w.mode) {
      case 'intro':
        if (!w.player.alive) enterDying();
        else if (t >= cfg.timing.levelIntroSec) setMode('playing');
        break;
      case 'playing':
        if (!w.player.alive) enterDying();
        else if (w.enemies.n === 0) enterCleared();
        break;
      case 'dying':
        if (t < cfg.player.respawnDelaySec) break;
        if (w.lives <= 0) enterGameOver();
        // As in the arcade original, the next ship waits for attackers to clear.
        else if (countAttacking(w) > 0 && t < cfg.player.respawnDelaySec + 5) break;
        else if (w.enemies.n === 0) enterCleared();
        else respawn();
        break;
      case 'cleared':
        if (w.warpTarget === 1 && t >= cfg.warp.engageDelaySec) {
          w.warpTarget = cfg.warp.speedMul;
          w.flash = 0.6;
          w.events.push({ type: 'warpStart' });
        }
        if (t >= cfg.timing.levelClearSec) startLevel(w.levelIndex + 1);
        break;
    }
  }

  function step(dt, input, firePressed, dragDx) {
    w.time += dt;
    w.modeTime += dt;
    updateFx(w, dt);
    if (w.mode === 'title') return;
    updatePlayer(w, dt, input, firePressed, dragDx);
    updateFormation(w, dt);
    updateDiveLaunches(w, dt);
    updateEnemyMotion(w, dt);
    updateEnemyFire(w, dt);
    updateBullets(w, dt);
    updatePickups(w, dt);
    updateCollisions(w);
    if (w.mode === 'playing') updatePowers(w, dt);
    updateFlow();
  }

  function setPaused(paused) {
    if (paused === w.paused || (paused && !PAUSABLE.has(w.mode))) return;
    w.paused = paused;
    w.events.push({ type: paused ? 'pause' : 'resume' });
  }

  return {
    world: w,
    newGame,
    startLevel,
    pause: () => setPaused(true),

    frame(dt, input) {
      if (input.pressed('pause')) setPaused(!w.paused);
      if (w.paused) return;
      const ended = w.mode === 'gameover' || w.mode === 'victory';
      if (input.pressed('start') && (w.mode === 'title' || (ended && w.modeTime >= cfg.timing.endScreenLockSec))) {
        newGame();
        return;
      }
      if (!(dt > 0)) return;
      // Substep so collisions stay reliable on slow frames; a fire press and
      // the frame's touch-drag movement only count once.
      const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
      let firePressed = input.pressed('fire');
      let dragDx = input.dragDx?.() ?? 0;
      for (let s = 0; s < steps; s++) {
        step(dt / steps, input, firePressed, dragDx);
        firePressed = false;
        dragDx = 0;
      }
    },

    // Debug helper: destroys every enemy without scoring.
    clearWave() {
      for (let i = w.enemies.n - 1; i >= 0; i--) destroyEnemy(w, i, false);
    },

    // Debug helper: drops the next power-up capsule in turn above the player.
    dropPickup() {
      w.debugPower = ((w.debugPower ?? -1) + 1) % POWERS.length;
      spawnPickup(w, w.player.x, w.player.y - 160, w.debugPower);
    },
  };
}
