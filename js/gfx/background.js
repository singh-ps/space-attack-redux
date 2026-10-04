// Synthwave backdrop: a night sky, a striped sun on the horizon between two
// mountain ranges, and a neon grid floor that scrolls toward the player and
// races during the warp jump. The static layers are cached at the canvas's
// pixel size and rebuilt when it changes.
import { NEON } from './art.js';
import { TAU } from '../core/util.js';

export const HORIZON = 0.66; // horizon height, as a fraction of the screen
const GRID_SPEED = 0.45; // grid rows per second at cruising speed
const PERSPECTIVE = 0.55; // how quickly grid rows bunch up toward the horizon

export function createBackground() {
  let sky = null;
  let land = null;
  let builtFor = '';

  function layer(w, scale) {
    const c = document.createElement('canvas');
    c.width = Math.round(w.W * scale);
    c.height = Math.round(w.H * scale);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    return [c, g];
  }

  function build(w, scale) {
    const { W, H } = w;
    const hy = H * HORIZON;

    const [skyCanvas, s] = layer(w, scale);
    const air = s.createLinearGradient(0, 0, 0, hy);
    air.addColorStop(0, '#04010d');
    air.addColorStop(0.45, '#110531');
    air.addColorStop(0.8, '#2a0b50');
    air.addColorStop(1, '#4d1066');
    s.fillStyle = air;
    s.fillRect(0, 0, W, hy + 1);
    // Faint nebula haze for depth.
    for (const [x, y, r, color] of [
      [W * 0.2, H * 0.22, 150, 'rgba(155, 92, 255, 0.10)'],
      [W * 0.85, H * 0.4, 170, 'rgba(255, 43, 214, 0.08)'],
    ]) {
      const haze = s.createRadialGradient(x, y, 0, x, y, r);
      haze.addColorStop(0, color);
      haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
      s.fillStyle = haze;
      s.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const [landCanvas, g] = layer(w, scale);
    drawSun(g, W / 2, hy + 12, 104);
    drawMountains(g, W, hy);
    const ground = g.createLinearGradient(0, hy, 0, H);
    ground.addColorStop(0, '#1d0638');
    ground.addColorStop(1, '#06010e');
    g.fillStyle = ground;
    g.fillRect(0, hy, W, H - hy);
    // Glowing horizon line, fading toward the edges.
    const line = g.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(255, 46, 136, 0)');
    line.addColorStop(0.5, 'rgba(255, 140, 220, 0.95)');
    line.addColorStop(1, 'rgba(255, 46, 136, 0)');
    g.fillStyle = line;
    g.globalAlpha = 0.3;
    g.fillRect(0, hy - 3, W, 6);
    g.globalAlpha = 1;
    g.fillRect(0, hy - 0.5, W, 1.5);
    // Grid lines running toward the vanishing point; they fade out before
    // they bunch up at the horizon.
    const fade = g.createLinearGradient(0, hy, 0, H);
    fade.addColorStop(0, 'rgba(255, 43, 214, 0)');
    fade.addColorStop(0.35, 'rgba(255, 43, 214, 0.32)');
    fade.addColorStop(1, 'rgba(255, 43, 214, 0.6)');
    g.strokeStyle = fade;
    for (const [width, alpha] of [[4, 0.25], [1.2, 1]]) {
      g.lineWidth = width;
      g.globalAlpha = alpha;
      g.beginPath();
      for (let k = -14; k <= 14; k++) {
        g.moveTo(W / 2, hy);
        g.lineTo(W / 2 + k * 52, H);
      }
      g.stroke();
    }
    g.globalAlpha = 1;

    sky = skyCanvas;
    land = landCanvas;
  }

  // Rows across the floor, spaced in perspective and moving toward the viewer.
  function drawGridRows(ctx, w) {
    const hy = w.H * HORIZON;
    const depth = w.H - hy;
    const phase = (w.scroll * GRID_SPEED) % 1;
    for (let k = 0; k < 40; k++) {
      const d = k + 1 - phase;
      const y = hy + depth / (1 + d * PERSPECTIVE);
      const near = (y - hy) / depth;
      if (near < 0.03) break;
      const a = 0.65 * Math.pow(near, 0.8);
      ctx.fillStyle = NEON.magenta;
      ctx.globalAlpha = a * 0.25;
      ctx.fillRect(0, y - 1.5, w.W, 3);
      ctx.globalAlpha = a;
      ctx.fillRect(0, y - 0.5, w.W, 1);
    }
    ctx.globalAlpha = 1;
  }

  return {
    drawSky(ctx, w, scale) {
      const key = `${w.W}x${w.H}@${scale}`;
      if (key !== builtFor) {
        build(w, scale);
        builtFor = key;
      }
      ctx.drawImage(sky, 0, 0, w.W, w.H);
    },
    drawLand(ctx, w) {
      ctx.drawImage(land, 0, 0, w.W, w.H);
      drawGridRows(ctx, w);
    },
  };
}

// The classic striped sunset sun, sitting on the horizon.
function drawSun(g, cx, cy, r) {
  const halo = g.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2);
  halo.addColorStop(0, 'rgba(255, 46, 136, 0.35)');
  halo.addColorStop(1, 'rgba(255, 46, 136, 0)');
  g.fillStyle = halo;
  g.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);

  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  const body = g.createLinearGradient(0, cy - r, 0, cy);
  body.addColorStop(0, '#ffe94d');
  body.addColorStop(0.45, '#ff9a3c');
  body.addColorStop(0.8, '#ff3d8b');
  body.addColorStop(1, '#c4127a');
  g.globalAlpha = 0.62;
  g.fillStyle = body;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Cut widening bands out of the lower half.
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    g.fillRect(cx - r, cy - r * 0.62 + t * r * 0.62, r * 2, 1.2 + t * 4);
  }
  g.restore();
}

function drawMountains(g, W, hy) {
  const left = [[0, -36], [26, -20], [54, -48], [86, -24], [112, -38], [146, -14], [176, 0]];
  for (const side of [1, -1]) {
    g.beginPath();
    g.moveTo(side > 0 ? 0 : W, hy);
    for (const [x, dy] of left) g.lineTo(side > 0 ? x : W - x, hy + dy);
    g.closePath();
    g.fillStyle = '#14052b';
    g.fill();
    g.beginPath();
    left.forEach(([x, dy], i) => (i ? g.lineTo : g.moveTo).call(g, side > 0 ? x : W - x, hy + dy));
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255, 43, 214, 0.18)';
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255, 120, 230, 0.7)';
    g.stroke();
  }
}
