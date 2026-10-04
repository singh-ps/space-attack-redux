// Canvas renderer. Reads the world and never changes it. All drawing is in
// logical canvas units; the transform maps them to device pixels.
import { FX } from './art.js';
import { ST } from '../core/world.js';
import { POPUP_SEC } from '../systems/fx.js';
import { clamp, pad } from '../core/util.js';

export const FONT_FAMILY = '"Press Start 2P", "Courier New", monospace';

const HUD = { label: '#ff5d73', value: '#ffffff', dim: '#8a93b8' };
const STAR_PALETTE = ['#ffffff', '#9fd3ff', '#ffd59f', '#ff9fd8', '#9fffc8', '#c8b8ff'];

const BANNER = {
  level: { title: '#3ee8ff', glow: '#0090ff', kicker: '#ffd23f', sub: '#c9d6ff', line: '#3ee8ff' },
  clear: { title: '#39ff88', glow: '#00b85c', kicker: '#ffffff', sub: '#b8ffd6', line: '#39ff88' },
  lost: { title: '#ff9a3c', glow: '#ff4d00', kicker: '#ffd1a6', sub: '#ffd1a6', alert: '#ff4d6d', line: '#ff9a3c' },
  gameover: { title: '#ff3355', glow: '#ff0030', kicker: '#ffb3c0', sub: '#ffe0e6', note: '#ffd23f', line: '#ff3355' },
  victory: { title: '#ffd23f', glow: '#ff8c00', kicker: '#39ff88', sub: '#fff3c4', note: '#3ee8ff', line: '#ffd23f' },
};

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const blink = (time, hz) => Math.floor(time * hz) % 2 === 0;

export function createRenderer(ctx, sprites) {
  let scale = 1;
  let bg = null;

  function text(str, x, y, size, color, align = 'left') {
    ctx.font = `${size}px ${FONT_FAMILY}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function glowText(str, x, y, size, color, glow, blur = 14) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur * scale;
    text(str, x, y, size, color, 'center');
    ctx.shadowBlur = 0;
  }

  // Largest 8px-multiple font size that fits the canvas width.
  const fitSize = (str, width, max) => Math.max(8, Math.min(max, Math.floor(width / str.length / 8) * 8));

  function drawSprite(img, x, y) {
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
  }

  function drawStars(w) {
    const S = w.stars;
    for (let i = 0; i < S.n; i++) {
      const twinkle = 0.55 + 0.45 * Math.sin(w.time * 3 + S.phase[i]);
      ctx.globalAlpha = S.size[i] > 1 ? twinkle : twinkle * 0.7;
      ctx.fillStyle = STAR_PALETTE[S.color[i]];
      ctx.fillRect(S.x[i], S.y[i], S.size[i], S.size[i]);
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemies(w) {
    const E = w.enemies;
    const names = w.cfg.types.names;
    for (let i = 0; i < E.n; i++) {
      const appear = E.appear[i];
      if (appear <= 0) continue;
      const frames = sprites[names[E.type[i]]];
      // Wings beat in a checkerboard in formation, faster when attacking.
      const rate = E.state[i] === ST.FORMATION ? 2.5 : 7;
      const img = frames[(Math.floor(w.time * rate) + E.col[i] + E.row[i]) % frames.length];
      if (appear < 1) {
        // Warp-in: the sprite stretches in vertically while fading up.
        const sy = 1 + (1 - appear) * 2.5;
        ctx.globalAlpha = appear;
        ctx.drawImage(img, E.x[i] - img.width / 2, E.y[i] - (img.height * sy) / 2, img.width, img.height * sy);
        ctx.globalAlpha = 1;
      } else {
        drawSprite(img, E.x[i], E.y[i]);
      }
    }
  }

  function drawBullets(w) {
    const PB = w.playerBullets;
    for (let i = 0; i < PB.n; i++) {
      ctx.fillStyle = 'rgba(255, 210, 63, 0.35)';
      ctx.fillRect(PB.x[i] - 2.5, PB.y[i] - 7, 5, 14);
      ctx.fillStyle = FX.player.bullet;
      ctx.fillRect(PB.x[i] - 1.5, PB.y[i] - 6, 3, 12);
    }
    const EB = w.enemyBullets;
    const names = w.cfg.types.names;
    for (let i = 0; i < EB.n; i++) {
      ctx.fillStyle = FX[names[EB.kind[i]]].bullet;
      ctx.fillRect(EB.x[i] - 1.5, EB.y[i] - 4.5, 3, 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(EB.x[i] - 0.5, EB.y[i] - 1.5, 1, 5);
    }
  }

  function drawPlayer(w) {
    const p = w.player;
    if (!p.alive || (p.invuln > 0 && blink(w.time, 12))) return;
    const img = sprites.player[0];
    const bottom = Math.round(p.y + img.height / 2);
    const flame = Math.floor(w.time * 24) % 2;
    ctx.fillStyle = flame ? '#ffd23f' : '#ff8a1f';
    ctx.fillRect(Math.round(p.x) - 1.5, bottom, 3, 4 + flame * 3);
    ctx.fillRect(Math.round(p.x) - 7.5, bottom - 3, 3, 3 + flame * 2);
    ctx.fillRect(Math.round(p.x) + 4.5, bottom - 3, 3, 3 + flame * 2);
    drawSprite(img, p.x, p.y);
  }

  function drawFx(w) {
    const kinds = w.cfg.fxKinds;
    const B = w.blasts;
    for (let i = 0; i < B.n; i++) {
      const kind = kinds[B.kind[i]];
      const frames = sprites.blast[kind];
      const f = Math.min(frames.length - 1, Math.floor((B.t[i] / FX[kind].duration) * frames.length));
      drawSprite(frames[f], B.x[i], B.y[i]);
    }
    const P = w.particles;
    for (let i = 0; i < P.n; i++) {
      ctx.globalAlpha = P.life[i] / P.maxLife[i];
      ctx.fillStyle = FX[kinds[P.kind[i]]].blast[P.color[i]];
      ctx.fillRect(P.x[i] - 1.5, P.y[i] - 1.5, 3, 3);
    }
    const U = w.popups;
    for (let i = 0; i < U.n; i++) {
      ctx.globalAlpha = 1 - U.t[i] / POPUP_SEC;
      text(String(U.value[i]), U.x[i], U.y[i], 8, FX[kinds[U.kind[i]]].blast[1], 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(w, view) {
    const { W, H } = w;
    text('SCORE', 12, 18, 8, HUD.label);
    text(pad(w.score, 6), 12, 36, 12, HUD.value);
    text('HI-SCORE', W / 2, 18, 8, HUD.label, 'center');
    text(pad(w.hiScore, 6), W / 2, 36, 12, HUD.value, 'center');
    if (w.mode !== 'title') {
      text('LEVEL', W - 12, 18, 8, HUD.label, 'right');
      text(`${w.levelIndex + 1}/${w.cfg.levels.length}`, W - 12, 36, 12, HUD.value, 'right');
      const icon = sprites.lifeIcon;
      for (let k = 0; k < w.lives; k++) ctx.drawImage(icon, 10 + k * (icon.width + 6), H - icon.height - 8);
    }
    if (view.muted) text('SOUND OFF', W - 10, H - 12, 8, HUD.dim, 'right');
    else if (!view.musicOn) text('MUSIC OFF', W - 10, H - 12, 8, HUD.dim, 'right');
  }

  function drawTitle(w) {
    const { W } = w;
    const cx = W / 2;
    glowText('SPACE ATTACK', cx, 138, 32, '#3ee8ff', '#0090ff');
    glowText('REDUX', cx, 184, 24, '#ff4fd8', '#c000ff');

    const T = w.cfg.types;
    const order = [...T.names.keys()].sort((a, b) => T.tier[b] - T.tier[a]);
    text('SCORE TABLE', cx, 246, 10, '#ffd23f', 'center');
    text('FORMATION', 330, 274, 8, HUD.dim, 'right');
    text('IN FLIGHT', 442, 274, 8, HUD.dim, 'right');
    order.forEach((type, k) => {
      const y = 312 + k * 42;
      const frames = sprites[T.names[type]];
      drawSprite(frames[Math.floor(w.time * 2.5) % frames.length], 70, y - 5);
      text(T.names[type].toUpperCase(), 108, y, 10, FX[T.names[type]].blast[1]);
      text(String(T.scoreFormation[type]), 330, y, 10, HUD.value, 'right');
      text(String(T.scoreFlight[type]), 442, y, 10, HUD.value, 'right');
    });

    text('ARROWS / A D   MOVE', cx, 462, 8, HUD.dim, 'center');
    text('SPACE / Z   FIRE', cx, 482, 8, HUD.dim, 'center');
    text('P PAUSE   M MUTE   N MUSIC', cx, 502, 8, HUD.dim, 'center');
    if (blink(w.time, 1.6)) text('PRESS ENTER TO START', cx, 566, 12, HUD.value, 'center');
  }

  function drawBanner(w) {
    const b = w.banner;
    const s = BANNER[b.style];
    const t = w.modeTime;
    const enter = clamp(t / 0.35, 0, 1);
    const leave = b.duration ? clamp((b.duration - t) / 0.4, 0, 1) : 1;
    const alpha = Math.min(enter, leave);
    if (alpha <= 0) return;
    const { W } = w;
    const cx = W / 2;
    const cy = 364; // just below the deepest (7-row) formation
    const tall = b.prompt ? 176 : 112;
    const bandH = tall * easeOut(enter);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(4, 6, 20, 0.82)';
    ctx.fillRect(0, cy - bandH / 2, W, bandH);
    ctx.fillStyle = s.line;
    ctx.fillRect(0, cy - bandH / 2, W, 2);
    ctx.fillRect(0, cy + bandH / 2 - 2, W, 2);

    const top = cy - tall / 2;
    if (b.kicker) text(b.kicker, cx, top + 30, 8, s.kicker, 'center');
    const size = fitSize(b.title, W - 40, 32);
    const pop = 1 + (1 - easeOut(enter)) * 0.5;
    ctx.save();
    ctx.translate(cx, top + 48 + size);
    ctx.scale(pop, pop);
    glowText(b.title, 0, 0, size, s.title, s.glow, 18);
    ctx.restore();
    const subY = top + 48 + size + 28;
    text(b.sub, cx, subY, 10, b.alert && blink(t, 4) ? s.alert : s.sub, 'center');
    if (b.note && blink(t, 3)) text(b.note, cx, subY + 24, 10, s.note, 'center');
    if (b.prompt && t > w.cfg.timing.endScreenLockSec && blink(t, 1.6)) {
      text(b.prompt, cx, subY + 52, 8, HUD.value, 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawPause(w) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w.W, w.H);
    glowText('PAUSED', w.W / 2, w.H / 2, 24, '#ffffff', '#3ee8ff');
    text('PRESS P TO RESUME', w.W / 2, w.H / 2 + 32, 8, HUD.dim, 'center');
  }

  function drawDebug(w, view) {
    const lines = [
      `FPS ${view.fps.toFixed(0)} ${w.mode.toUpperCase()}${w.godMode ? ' GOD' : ''}`,
      `EN ${w.enemies.n} EB ${w.enemyBullets.n} FX ${w.particles.n}`,
    ];
    lines.forEach((line, k) => text(line, 12, 56 + k * 11, 8, '#9fffc8'));
  }

  return {
    setScale(s) {
      scale = s;
    },

    draw(w, view) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (!bg) {
        bg = ctx.createLinearGradient(0, 0, 0, w.H);
        bg.addColorStop(0, '#0b1030');
        bg.addColorStop(1, '#020309');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w.W, w.H);
      drawStars(w);

      if (w.mode === 'title') {
        drawTitle(w);
      } else {
        ctx.save();
        if (w.shake > 0) ctx.translate((Math.random() * 2 - 1) * w.shake, (Math.random() * 2 - 1) * w.shake);
        drawEnemies(w);
        drawBullets(w);
        drawPlayer(w);
        drawFx(w);
        ctx.restore();
      }
      drawHud(w, view);
      if (w.paused) drawPause(w);
      else if (w.banner) drawBanner(w);
      if (view.debug) drawDebug(w, view);
    },
  };
}
