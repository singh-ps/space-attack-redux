// Canvas renderer, neo-retro style: a synthwave backdrop, chunky pixel
// sprites lit by additive neon glow, light trails, shockwaves and sparks,
// chrome display type, and a glitch on big hits. It reads the world and never
// changes it. All drawing is in world units; the transform maps them to
// device pixels.
import { FX, NEON, POWER_STYLE } from './art.js';
import { glowDot } from './glow.js';
import { createBackground } from './background.js';
import { ST } from '../core/world.js';
import { POWERS } from '../core/config.js';
import { POPUP_SEC, LABEL_SEC, DEBRIS, SPARK } from '../systems/fx.js';
import { POWER } from '../systems/pickups.js';
import { BUTTON_HALF, buttonVisible } from '../touch.js';
import { clamp, pad, TAU } from '../core/util.js';

export const FONT_FAMILY = '"Press Start 2P", "Courier New", monospace';
export const DISPLAY_FONT = 'Orbitron, "Arial Black", sans-serif';
export const NEON_FONT = 'Monoton, Orbitron, sans-serif';

const STAR_PALETTE = ['#ffffff', '#9ff6ff', '#ffc2f4', '#c9b6ff', '#fff3b0', '#7fd8ff'];
const INK = '#14002b'; // dark outline that keeps shots readable on bright backdrops

// Chrome gradients [top, middle, low] and glow colours for the big titles.
const BANNER = {
  level: { chrome: ['#ffffff', '#8ff3ff', '#1f4fd8'], glow: NEON.cyan, kicker: NEON.yellow, sub: '#d5dcff', line: NEON.cyan },
  clear: { chrome: ['#ffffff', '#a8ffcb', '#118a48'], glow: NEON.green, kicker: '#ffffff', sub: '#b8ffd6', line: NEON.green },
  lost: { chrome: ['#fff6d0', '#ffb347', '#d81f52'], glow: NEON.orange, kicker: '#ffd1a6', sub: '#ffd1a6', alert: '#ff4d6d', line: NEON.orange },
  gameover: { chrome: ['#ffe6ec', '#ff5577', '#6a001f'], glow: '#ff0f4f', kicker: '#ffb3c0', sub: '#ffe0e6', note: NEON.yellow, line: '#ff3355' },
  victory: { chrome: ['#ffffff', '#ffe94d', '#e05a00'], glow: NEON.yellow, kicker: NEON.green, sub: '#fff3c4', note: NEON.cyan, line: NEON.yellow },
};
const TITLE_CHROME = ['#f2fdff', '#7fd8ff', '#3b1d8f'];

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const blink = (time, hz) => Math.floor(time * hz) % 2 === 0;

export function createRenderer(ctx, sprites) {
  let scale = 1;
  let hudFade = null;
  const background = createBackground();

  // ---- drawing helpers -------------------------------------------------

  function text(str, x, y, size, color, align = 'left', font = FONT_FAMILY) {
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // Text with a soft neon glow.
  function neonText(str, x, y, size, color, glow = color, align = 'center', blur = 8) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur * scale;
    text(str, x, y, size, color, align);
    ctx.shadowBlur = 0;
  }

  // Big slanted chrome lettering: dark outline with a neon glow, a gradient
  // fill with a bright "horizon" line through it, and a thin highlight edge.
  // Shrinks to fit maxWidth.
  function chromeText(str, x, y, size, stops, glow, maxWidth = 440) {
    ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
    const width = ctx.measureText(str).width;
    const s = width > maxWidth ? Math.floor((size * maxWidth) / width) : size;
    ctx.font = `900 ${s}px ${DISPLAY_FONT}`;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, -0.16, 1, 0, 0);
    ctx.textAlign = 'center';
    const grad = ctx.createLinearGradient(0, -s * 0.78, 0, 0);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.5, stops[1]);
    grad.addColorStop(0.53, '#ffffff');
    grad.addColorStop(0.58, stops[2]);
    grad.addColorStop(1, stops[1]);
    ctx.lineJoin = 'round';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20 * scale;
    ctx.lineWidth = Math.max(3, s * 0.12);
    ctx.strokeStyle = '#12002a';
    ctx.strokeText(str, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = grad;
    ctx.fillText(str, 0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.strokeText(str, 0, 0);
    ctx.restore();
    return s;
  }

  // A translucent UI panel with a neon frame and corner ticks.
  function panel(x, y, w, h, color) {
    ctx.fillStyle = 'rgba(8, 2, 26, 0.74)';
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * scale;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * 10);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * 10, cy);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawSprite(img, x, y) {
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
  }

  function drawCentered(img, x, y) {
    ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
  }

  function dot(color, x, y, w, h = w) {
    ctx.drawImage(glowDot(color), x - w / 2, y - h / 2, w, h);
  }

  // Additive blending with smooth scaling, for every light source.
  function beginGlow() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
  }

  function endGlow() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
  }

  // ---- scene -----------------------------------------------------------

  function drawStars(w) {
    const S = w.stars;
    // At warp speed each star smears into a streak, longer for nearer stars.
    const smear = (w.warp - 1) * 0.04;
    for (let i = 0; i < S.n; i++) {
      const twinkle = 0.55 + 0.45 * Math.sin(w.time * 3 + S.phase[i]);
      const len = S.speed[i] * smear;
      ctx.globalAlpha = Math.min(1, (S.size[i] > 1 ? twinkle : twinkle * 0.7) + smear);
      ctx.fillStyle = STAR_PALETTE[S.color[i]];
      ctx.fillRect(S.x[i], S.y[i] - len, S.size[i], S.size[i] + len);
    }
    ctx.globalAlpha = 1;
  }

  function enemyFrame(w, i) {
    const frames = sprites[w.cfg.types.names[w.enemies.type[i]]];
    // Wings beat in a checkerboard in formation, faster when attacking.
    const rate = w.enemies.state[i] === ST.FORMATION ? 2.5 : 7;
    return (Math.floor(w.time * rate) + w.enemies.col[i] + w.enemies.row[i]) % frames.length;
  }

  // Gentle hover in formation (visual only).
  const bob = (w, i, view) =>
    view.reducedMotion || w.enemies.state[i] !== ST.FORMATION ? 0 : Math.sin(w.time * 2.2 + w.enemies.col[i] * 0.7) * 1.5;

  function drawEnemies(w, view) {
    const E = w.enemies;
    const names = w.cfg.types.names;
    beginGlow();
    for (let i = 0; i < E.n; i++) {
      const appear = E.appear[i];
      if (appear <= 0) continue;
      const name = names[E.type[i]];
      const glow = sprites.glow[name][enemyFrame(w, i)];
      const x = E.x[i];
      const y = E.y[i] + bob(w, i, view);
      const flying = E.state[i] !== ST.FORMATION;
      if (flying) {
        // Light trail: fading copies of the halo along the flight path.
        for (let k = 3; k >= 1; k--) {
          ctx.globalAlpha = 0.3 / k;
          drawCentered(glow, x - E.vx[i] * 0.03 * k, y - E.vy[i] * 0.03 * k);
        }
      }
      ctx.globalAlpha = (flying ? 0.95 : 0.6) * Math.min(1, appear);
      drawCentered(glow, x, y);
      if (appear < 1) {
        // Warp-in beam collapsing onto the enemy.
        ctx.globalAlpha = 1 - appear;
        dot(FX[name].glow, x, y, 10, 24 + (1 - appear) * 80);
      }
    }
    endGlow();
    for (let i = 0; i < E.n; i++) {
      const appear = E.appear[i];
      if (appear <= 0) continue;
      const img = sprites[names[E.type[i]]][enemyFrame(w, i)];
      const y = E.y[i] + bob(w, i, view);
      if (appear < 1) {
        const sy = 1 + (1 - appear) * 2.5;
        ctx.globalAlpha = appear;
        ctx.drawImage(img, E.x[i] - img.width / 2, y - (img.height * sy) / 2, img.width, img.height * sy);
        ctx.globalAlpha = 1;
      } else {
        drawSprite(img, E.x[i], y);
      }
    }
  }

  function drawPickups(w) {
    const K = w.pickups;
    for (let i = 0; i < K.n; i++) {
      const name = POWERS[K.kind[i]];
      const y = K.y[i] + Math.sin(K.t[i] * 5) * 2;
      beginGlow();
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(K.t[i] * 8);
      drawCentered(sprites.pickupGlow[name], K.x[i], y);
      endGlow();
      drawSprite(sprites.pickup[name][Math.floor(K.t[i] * 4) % 2], K.x[i], y);
    }
  }

  function drawBullets(w) {
    const PB = w.playerBullets;
    const EB = w.enemyBullets;
    const names = w.cfg.types.names;
    beginGlow();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < PB.n; i++) {
      if (PB.vx[i] === 0) {
        dot(FX.player.bullet, PB.x[i], PB.y[i], 14, 30);
        continue;
      }
      ctx.save();
      ctx.translate(PB.x[i], PB.y[i]);
      ctx.rotate(Math.atan2(PB.vx[i], -PB.vy[i]));
      dot(FX.player.bullet, 0, 0, 14, 30);
      ctx.restore();
    }
    for (let i = 0; i < EB.n; i++) dot(FX[names[EB.kind[i]]].glow, EB.x[i], EB.y[i], 24);
    endGlow();

    // Player shots: white-hot laser cores.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < PB.n; i++) {
      if (PB.vx[i] === 0) {
        ctx.fillRect(PB.x[i] - 1, PB.y[i] - 6, 2, 12);
        continue;
      }
      const k = 6 / Math.hypot(PB.vx[i], PB.vy[i]);
      ctx.beginPath();
      ctx.moveTo(PB.x[i] - PB.vx[i] * k, PB.y[i] - PB.vy[i] * k);
      ctx.lineTo(PB.x[i] + PB.vx[i] * k, PB.y[i] + PB.vy[i] * k);
      ctx.stroke();
    }
    // Enemy shots: dark-outlined plasma capsules that read on any backdrop.
    for (let i = 0; i < EB.n; i++) {
      const x = EB.x[i];
      const y = EB.y[i];
      ctx.fillStyle = INK;
      ctx.fillRect(x - 2.5, y - 5.5, 5, 11);
      ctx.fillStyle = FX[names[EB.kind[i]]].bullet;
      ctx.fillRect(x - 1.5, y - 4.5, 3, 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 0.5, y - 2.5, 1, 5);
    }
  }

  function drawPlayer(w) {
    const p = w.player;
    if (!p.alive || (p.invuln > 0 && blink(w.time, 12))) return;
    const img = sprites.player[0];
    beginGlow();
    ctx.globalAlpha = 0.8;
    drawCentered(sprites.glow.player[0], p.x, p.y);
    // Engine flames: flickering cyan jets with white-hot cores, longer at warp.
    const flicker = 0.8 + 0.2 * Math.sin(w.time * 70);
    const boost = Math.min(4, 1 + (w.warp - 1) * 0.15);
    for (const [dx, s] of [[-9, 0.7], [0, 1], [9, 0.7]]) {
      const len = (12 * flicker * boost + 6) * s;
      ctx.globalAlpha = 0.9;
      dot(NEON.cyan, p.x + dx, p.y + 17 + len / 2, 10 * s, len + 6);
      dot('#ffffff', p.x + dx, p.y + 17 + len / 4, 4 * s, len / 2 + 3);
    }
    if (p.muzzle > 0) {
      ctx.globalAlpha = p.muzzle / 0.06;
      dot(NEON.yellow, p.x, p.y - 24, 26);
    }
    endGlow();
    drawSprite(img, p.x, p.y);

    // Shield bubble, flickering during its last two seconds.
    const shield = w.powerTime[POWER.shield];
    if (shield > 0 && !(shield < 2 && blink(w.time, 8))) {
      const color = POWER_STYLE.shield.color;
      const pulse = 0.6 + 0.25 * Math.sin(w.time * 9);
      beginGlow();
      ctx.globalAlpha = pulse * 0.5;
      dot(color, p.x, p.y + 2, 68);
      endGlow();
      ctx.beginPath();
      ctx.arc(p.x, p.y + 2, 27, 0, TAU);
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * scale;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
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
    beginGlow();
    // Shockwave rings: a wide faint stroke under a thin bright one.
    const R = w.rings;
    for (let i = 0; i < R.n; i++) {
      const k = R.t[i] / R.dur[i];
      const r = R.r0[i] + (R.r1[i] - R.r0[i]) * easeOut(k);
      const fade = Math.pow(1 - k, 1.5);
      ctx.strokeStyle = FX[kinds[R.kind[i]]].blast[1];
      ctx.beginPath();
      ctx.arc(R.x[i], R.y[i], r, 0, TAU);
      ctx.globalAlpha = fade * 0.35;
      ctx.lineWidth = R.width[i] * 3 * (1 - k) + 1;
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.lineWidth = R.width[i] * (1 - k) + 0.6;
      ctx.stroke();
    }
    // Sparks streak along their velocity; glow dots fade and shrink.
    ctx.lineWidth = 2;
    for (let i = 0; i < P.n; i++) {
      const style = P.style[i];
      if (style === DEBRIS) continue;
      const life = P.life[i] / P.maxLife[i];
      const color = FX[kinds[P.kind[i]]].blast[P.color[i]];
      ctx.globalAlpha = life;
      if (style === SPARK) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(P.x[i], P.y[i]);
        ctx.lineTo(P.x[i] - P.vx[i] * 0.04, P.y[i] - P.vy[i] * 0.04);
        ctx.stroke();
      } else {
        dot(color, P.x[i], P.y[i], P.size[i] * (0.4 + 0.6 * life));
      }
    }
    endGlow();
    for (let i = 0; i < P.n; i++) {
      if (P.style[i] !== DEBRIS) continue;
      ctx.globalAlpha = P.life[i] / P.maxLife[i];
      ctx.fillStyle = FX[kinds[P.kind[i]]].blast[P.color[i]];
      ctx.fillRect(P.x[i] - 1.5, P.y[i] - 1.5, 3, 3);
    }

    const U = w.popups;
    for (let i = 0; i < U.n; i++) {
      if (U.label[i] >= 0) {
        // Power-up name, kept fully on screen near the edges.
        const style = POWER_STYLE[POWERS[U.label[i]]];
        const half = style.label.length * 4 + 6;
        ctx.globalAlpha = 1 - U.t[i] / LABEL_SEC;
        neonText(style.label, clamp(U.x[i], half, w.W - half), U.y[i], 8, '#ffffff', style.color, 'center', 6);
      } else {
        ctx.globalAlpha = 1 - U.t[i] / POPUP_SEC;
        const color = FX[kinds[U.kind[i]]].blast[1];
        neonText(String(U.value[i]), U.x[i], U.y[i], 8, '#ffffff', color, 'center', 6);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD and screens ---------------------------------------------------

  // Active power-ups, bottom right: icon plus a bar for the time left.
  function drawPowers(w) {
    let x = w.W - 10;
    const y = w.H - 34;
    for (let k = POWERS.length - 1; k >= 0; k--) {
      const t = w.powerTime[k];
      if (t <= 0) continue;
      const name = POWERS[k];
      const icon = sprites.pickupIcon[name];
      const color = POWER_STYLE[name].color;
      x -= icon.width;
      ctx.globalAlpha = t < 2 && blink(w.time, 6) ? 0.35 : 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * scale;
      ctx.drawImage(icon, x, y);
      ctx.shadowBlur = 0;
      const left = Number.isFinite(t) ? Math.min(1, t / w.cfg.powers.duration[k]) : 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, y + icon.height + 3, icon.width, 3);
      ctx.fillStyle = color;
      ctx.fillRect(x, y + icon.height + 3, icon.width * left, 3);
      ctx.globalAlpha = 1;
      x -= 6;
    }
  }

  function drawHud(w, view) {
    const { W, H } = w;
    if (!hudFade) {
      hudFade = ctx.createLinearGradient(0, 0, 0, 58);
      hudFade.addColorStop(0, 'rgba(4, 1, 14, 0.9)');
      hudFade.addColorStop(1, 'rgba(4, 1, 14, 0)');
    }
    ctx.fillStyle = hudFade;
    ctx.fillRect(0, 0, W, 58);
    neonText('SCORE', 12, 18, 8, NEON.magenta, NEON.magenta, 'left', 6);
    neonText(pad(w.score, 6), 12, 36, 12, '#ffffff', NEON.magenta, 'left', 6);
    neonText('HI-SCORE', W / 2, 18, 8, NEON.cyan, NEON.cyan, 'center', 6);
    neonText(pad(w.hiScore, 6), W / 2, 36, 12, '#ffffff', NEON.cyan, 'center', 6);
    if (w.mode !== 'title') {
      neonText('LEVEL', W - 12, 18, 8, NEON.yellow, NEON.yellow, 'right', 6);
      neonText(`${w.levelIndex + 1}/${w.cfg.levels.length}`, W - 12, 36, 12, '#ffffff', NEON.yellow, 'right', 6);
      const icon = sprites.lifeIcon;
      for (let k = 0; k < w.lives; k++) {
        const x = 10 + k * (icon.width + 6);
        const y = H - icon.height - 8;
        beginGlow();
        ctx.globalAlpha = 0.6;
        drawCentered(sprites.lifeGlow, x + icon.width / 2, y + icon.height / 2);
        endGlow();
        ctx.drawImage(icon, x, y);
      }
      drawPowers(w);
    }
    // On touch screens the sound button shows this instead.
    if (!view.touch) {
      if (view.muted) text('SOUND OFF', W - 12, 52, 8, NEON.dim, 'right');
      else if (!view.musicOn) text('MUSIC OFF', W - 12, 52, 8, NEON.dim, 'right');
    }
  }

  function drawTitle(w, view) {
    const { W } = w;
    const cx = W / 2;
    chromeText('SPACE ATTACK', cx, 116, 46, TITLE_CHROME, NEON.magenta);
    // "REDUX" as a tilted neon sign.
    ctx.save();
    ctx.translate(cx + 40, 166);
    ctx.rotate(-0.06);
    ctx.font = `40px ${NEON_FONT}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = NEON.magenta;
    ctx.shadowBlur = 18 * scale;
    // Every few seconds the sign stutters, like a real neon tube.
    const cycle = w.time % 3.7;
    const lit = !(cycle < 0.07 || (cycle > 0.14 && cycle < 0.2));
    ctx.fillStyle = lit ? '#ff7ae6' : '#5e1654';
    if (!lit) ctx.shadowBlur = 0;
    ctx.fillText('REDUX', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    const T = w.cfg.types;
    const order = [...T.names.keys()].sort((a, b) => T.tier[b] - T.tier[a]);
    panel(24, 194, W - 48, 166, NEON.magenta);
    neonText('SCORE TABLE', cx, 218, 10, NEON.yellow, NEON.orange);
    text('FORMATION', 326, 242, 8, NEON.dim, 'right');
    text('IN FLIGHT', 440, 242, 8, NEON.dim, 'right');
    order.forEach((type, k) => {
      const y = 276 + k * 34;
      const name = T.names[type];
      const frame = Math.floor(w.time * 2.5) % sprites[name].length;
      beginGlow();
      ctx.globalAlpha = 0.7;
      drawCentered(sprites.glow[name][frame], 68, y - 5);
      endGlow();
      drawSprite(sprites[name][frame], 68, y - 5);
      neonText(name.toUpperCase(), 106, y, 10, FX[name].blast[1], FX[name].glow, 'left', 6);
      text(String(T.scoreFormation[type]), 326, y, 10, '#ffffff', 'right');
      text(String(T.scoreFlight[type]), 440, y, 10, '#ffffff', 'right');
    });

    panel(24, 374, W - 48, 100, NEON.cyan);
    neonText('POWER-UPS', cx, 398, 10, NEON.yellow, NEON.orange);
    POWERS.forEach((name, k) => {
      const x = 64 + k * 88;
      beginGlow();
      ctx.globalAlpha = 0.8;
      drawCentered(sprites.pickupGlow[name], x, 428);
      endGlow();
      drawSprite(sprites.pickup[name][0], x, 428);
      text(POWER_STYLE[name].short, x, 460, 8, POWER_STYLE[name].color, 'center');
    });

    const autoFire = w.cfg.player.autoFire;
    const lines = view.touch
      ? ['DRAG ANYWHERE TO MOVE', autoFire ? 'KEEP A FINGER DOWN TO FIRE' : 'TAP TO FIRE', 'SOUND AND PAUSE: TOP RIGHT']
      : ['ARROWS / A D   MOVE', autoFire ? 'HOLD SPACE / Z   FIRE' : 'SPACE / Z   FIRE', 'P PAUSE   M MUTE   N MUSIC'];
    lines.forEach((line, k) => text(line, cx, 500 + k * 17, 8, '#c9c3f5', 'center'));
    if (blink(w.time, 1.6)) {
      neonText(view.touch ? 'TAP TO START' : 'PRESS ENTER TO START', cx, 582, 12, '#ffffff', NEON.cyan, 'center', 12);
    }
  }

  function drawBanner(w, view) {
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
    const tall = b.restart ? 176 : 112;
    const bandH = tall * easeOut(enter);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6, 1, 22, 0.86)';
    ctx.fillRect(0, cy - bandH / 2, W, bandH);
    ctx.shadowColor = s.line;
    ctx.shadowBlur = 12 * scale;
    ctx.fillStyle = s.line;
    ctx.fillRect(0, cy - bandH / 2, W, 2);
    ctx.fillRect(0, cy + bandH / 2 - 2, W, 2);
    ctx.shadowBlur = 0;

    const top = cy - tall / 2;
    if (b.kicker) neonText(b.kicker, cx, top + 28, 8, s.kicker, s.kicker, 'center', 6);
    const pop = 1 + (1 - easeOut(enter)) * 0.25;
    ctx.save();
    ctx.translate(cx, top + 78);
    ctx.scale(pop, pop);
    chromeText(b.title, 0, 0, 40, s.chrome, s.glow, W - 48);
    ctx.restore();
    const subY = top + 106;
    neonText(b.sub, cx, subY, 10, b.alert && blink(t, 4) ? s.alert : s.sub, s.line, 'center', 6);
    if (b.note && blink(t, 3)) neonText(b.note, cx, subY + 24, 10, s.note, s.note, 'center', 8);
    if (b.restart && t > w.cfg.timing.endScreenLockSec && blink(t, 1.6)) {
      neonText(view.touch ? 'TAP TO PLAY AGAIN' : 'PRESS ENTER TO PLAY AGAIN', cx, subY + 52, 8, '#ffffff', NEON.cyan, 'center', 8);
    }
    ctx.globalAlpha = 1;
  }

  function drawPause(w, view) {
    ctx.fillStyle = 'rgba(4, 0, 16, 0.65)';
    ctx.fillRect(0, 0, w.W, w.H);
    chromeText('PAUSED', w.W / 2, w.H / 2, 40, TITLE_CHROME, NEON.cyan);
    neonText(view.touch ? 'TAP TO RESUME' : 'PRESS P TO RESUME', w.W / 2, w.H / 2 + 34, 8, '#ffffff', NEON.cyan, 'center', 6);
  }

  // On-screen sound and pause buttons for touch screens.
  function drawTouchButtons(w, view) {
    const s = BUTTON_HALF;
    for (const b of view.buttons) {
      if (!buttonVisible(w, b)) continue;
      ctx.fillStyle = 'rgba(8, 2, 26, 0.6)';
      ctx.fillRect(b.x - s, b.y - s, s * 2, s * 2);
      ctx.shadowColor = NEON.magenta;
      ctx.shadowBlur = 8 * scale;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 120, 230, 0.75)';
      ctx.strokeRect(b.x - s + 0.75, b.y - s + 0.75, s * 2 - 1.5, s * 2 - 1.5);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      if (b.action === 'pause') {
        if (w.paused) {
          ctx.beginPath();
          ctx.moveTo(b.x - 4, b.y - 7);
          ctx.lineTo(b.x + 7, b.y);
          ctx.lineTo(b.x - 4, b.y + 7);
          ctx.fill();
        } else {
          ctx.fillRect(b.x - 6, b.y - 7, 4, 14);
          ctx.fillRect(b.x + 2, b.y - 7, 4, 14);
        }
        continue;
      }
      // Speaker, with sound waves or a red cross when muted.
      ctx.beginPath();
      ctx.moveTo(b.x - 9, b.y - 3);
      ctx.lineTo(b.x - 5, b.y - 3);
      ctx.lineTo(b.x, b.y - 8);
      ctx.lineTo(b.x, b.y + 8);
      ctx.lineTo(b.x - 5, b.y + 3);
      ctx.lineTo(b.x - 9, b.y + 3);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (view.muted) {
        ctx.strokeStyle = '#ff5d73';
        ctx.moveTo(b.x + 3, b.y - 4);
        ctx.lineTo(b.x + 10, b.y + 4);
        ctx.moveTo(b.x + 10, b.y - 4);
        ctx.lineTo(b.x + 3, b.y + 4);
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.arc(b.x + 1, b.y, 5, -0.9, 0.9);
        ctx.moveTo(b.x + 1 + 9 * Math.cos(-0.9), b.y + 9 * Math.sin(-0.9));
        ctx.arc(b.x + 1, b.y, 9, -0.9, 0.9);
      }
      ctx.stroke();
    }
  }

  // Digital glitch after a big hit: torn horizontal bands and a ghost image.
  function drawGlitch(w, view) {
    if (w.glitch <= 0 || view.reducedMotion) return;
    const canvas = ctx.canvas;
    const k = Math.min(1, w.glitch / 0.45);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bands = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < bands; b++) {
      const h = (4 + Math.random() * 28) * scale;
      const y = Math.random() * (canvas.height - h);
      const dx = (Math.random() * 2 - 1) * 18 * scale * k;
      ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 * k;
    ctx.drawImage(canvas, 5 * scale * k, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function drawDebug(w, view) {
    const lines = [
      `FPS ${view.fps.toFixed(0)} CPU ${view.cpuMs.toFixed(1)}MS ${w.mode.toUpperCase()}${w.godMode ? ' GOD' : ''}`,
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
      background.drawSky(ctx, w, scale);
      drawStars(w);
      background.drawLand(ctx, w);

      if (w.mode === 'title') {
        drawTitle(w, view);
      } else {
        ctx.save();
        const shake = view.reducedMotion ? w.shake * 0.3 : w.shake;
        if (shake > 0) ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
        drawEnemies(w, view);
        drawPickups(w);
        drawBullets(w);
        drawPlayer(w);
        drawFx(w);
        ctx.restore();
      }
      if (w.flash > 0.01) {
        ctx.globalAlpha = w.flash * 0.6;
        ctx.fillStyle = '#f0fbff';
        ctx.fillRect(0, 0, w.W, w.H);
        ctx.globalAlpha = 1;
      }
      drawHud(w, view);
      if (w.paused) drawPause(w, view);
      else if (w.banner) drawBanner(w, view);
      if (view.touch) drawTouchButtons(w, view);
      drawGlitch(w, view);
      if (view.debug) drawDebug(w, view);
    },
  };
}
