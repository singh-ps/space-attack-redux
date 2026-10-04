// Boot: loads config.json, then wires input, audio and rendering to the game
// loop. Game rules live in game.js and js/systems/.
import { createGame } from './game.js';
import { buildSprites } from './gfx/sprites.js';
import { createRenderer, FONT_FAMILY } from './gfx/render.js';
import { createKeyboard } from './input.js';
import { createTouch, touchButtons } from './touch.js';
import { createAudio } from './audio.js';

const HI_SCORE_KEY = 'space-attack-redux:hiscore';

function loadHiScore() {
  try {
    return Number(localStorage.getItem(HI_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveHiScore(score) {
  try {
    localStorage.setItem(HI_SCORE_KEY, String(score));
  } catch {
    // Storage unavailable; the high score just won't persist.
  }
}

function showError(err) {
  const box = document.getElementById('error');
  box.textContent =
    location.protocol === 'file:'
      ? 'Serve this folder over HTTP (for example: python3 -m http.server) - browsers block loading config.json from file:// pages.'
      : String(err?.message ?? err);
  box.hidden = false;
}

async function loadConfig() {
  // no-cache revalidates, so config tweaks show up on the next reload.
  const res = await fetch('config.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load config.json (HTTP ${res.status})`);
  return res.json();
}

async function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let game;
  try {
    game = createGame(await loadConfig(), { seed: (Math.random() * 2 ** 32) >>> 0, hiScore: loadHiScore() });
  } catch (err) {
    showError(err);
    return;
  }
  const w = game.world;

  // Canvas text needs the web font loaded first, but don't hang if offline.
  await Promise.race([
    document.fonts?.load(`12px ${FONT_FAMILY}`),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).catch(() => {});

  const renderer = createRenderer(ctx, buildSprites());
  const audio = createAudio(w.cfg.audio);
  const buttons = touchButtons(w.W);
  const keyboard = createKeyboard(window);
  const touch = createTouch({ canvas, world: w, buttons });
  const input = {
    down: (action) => keyboard.down(action) || touch.down(action),
    pressed: (action) => keyboard.pressed(action) || touch.pressed(action),
    dragging: touch.dragging,
    dragDx: touch.dragDx,
    endFrame() {
      keyboard.endFrame();
      touch.endFrame();
    },
  };
  const view = {
    debug: new URLSearchParams(location.search).has('debug'),
    fps: 60,
    muted: audio.muted,
    musicOn: audio.musicOn,
    // Touch prompts and buttons show on touch screens, and follow whichever
    // of touch or keyboard was used last.
    touch: window.matchMedia('(pointer: coarse)').matches,
    buttons,
  };
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') view.touch = true;
  });
  window.addEventListener('keydown', () => {
    view.touch = false;
  });
  // No long-press menus or pinch zoom getting in the way of play.
  window.addEventListener('contextmenu', (e) => {
    if (view.touch) e.preventDefault();
  });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.min(window.innerWidth / w.W, window.innerHeight / w.H);
    canvas.style.width = `${Math.floor(w.W * s)}px`;
    canvas.style.height = `${Math.floor(w.H * s)}px`;
    canvas.width = Math.round(w.W * s * dpr);
    canvas.height = Math.round(w.H * s * dpr);
    renderer.setScale(canvas.width / w.W);
  }
  window.addEventListener('resize', fit);
  fit();

  // Browsers allow audio only after a user gesture; for touch, that is the
  // finger lifting, so listen for both ends of a tap.
  window.addEventListener('keydown', audio.unlock);
  window.addEventListener('pointerdown', audio.unlock);
  window.addEventListener('pointerup', audio.unlock);
  window.addEventListener('blur', game.pause);
  window.addEventListener('pagehide', () => saveHiScore(w.hiScore));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      audio.suspend();
    } else if (!w.paused) {
      audio.resume();
    }
  });
  if (view.debug) installDebugKeys(game, w);

  let last = performance.now();
  function frame(now) {
    // Queue the next frame first so one bad frame can't stop the loop.
    requestAnimationFrame(frame);
    // The first rAF timestamp can predate `last`, so never let dt go negative.
    const dt = Math.min(Math.max(now - last, 0) / 1000, 1 / 20);
    last = now;
    view.fps += (1 / Math.max(dt, 1e-3) - view.fps) * 0.05;
    if (input.pressed('mute')) view.muted = audio.toggleMute();
    if (input.pressed('music')) view.musicOn = audio.toggleMusic();
    game.frame(dt, input);
    for (const ev of w.events) {
      audio.handle(ev);
      if (ev.type === 'gameOver' || ev.type === 'victory') saveHiScore(ev.hiScore);
    }
    w.events.length = 0;
    renderer.draw(w, view);
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

// ?debug in the URL: G toggles invulnerability, K clears the wave, U drops a
// power-up, 1-5 jump to a level, and the game object is exposed as window.game.
function installDebugKeys(game, w) {
  window.game = game;
  const inGame = () => !['title', 'gameover', 'victory'].includes(w.mode);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyG') w.godMode = !w.godMode;
    if (e.code === 'KeyK' && w.mode === 'playing') game.clearWave();
    if (e.code === 'KeyU' && inGame()) game.dropPickup();
    const level = Number(e.key) - 1;
    if (e.code.startsWith('Digit') && level >= 0 && level < w.cfg.levels.length && inGame()) game.startLevel(level);
  });
}

boot();
