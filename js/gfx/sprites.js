// Rasterizes the pixel art in art.js into offscreen canvases (browser only).
import { ART, PALETTES, FX, PIXEL, POWER_STYLE, PICKUP_ART_SIZE } from './art.js';
import { mulberry32, TAU } from '../core/util.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rasterize(rows, palette, scale) {
  const c = makeCanvas(rows[0].length * scale, rows.length * scale);
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return c;
}

// A small pixel-art blast drawn from the object's own colours: a hot core that
// collapses while a ring of sparks flies outward and cools.
function blastFrames({ blast: [hot, main, dark, accent], size, frames }, seed) {
  const rng = mulberry32(seed);
  const sparks = Array.from({ length: 16 }, (_, k) => ({
    a: (k / 16) * TAU + (rng() - 0.5) * 0.5,
    v: 0.55 + rng() * 0.45,
    color: rng() < 0.3 ? accent : main,
  }));
  const mid = (size - 1) / 2;
  const out = [];
  for (let f = 0; f < frames; f++) {
    const t = (f + 1) / frames;
    const canvas = makeCanvas(size * PIXEL, size * PIXEL);
    const g = canvas.getContext('2d');
    const put = (x, y, color) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      g.fillStyle = color;
      g.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
    };
    const coreR = mid * 0.5 * (1 - t) + 0.6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - mid, y - mid);
        if (d <= coreR) put(x, y, d < coreR * 0.55 ? hot : t < 0.5 ? main : dark);
      }
    }
    for (const s of sparks) {
      const r = s.v * mid * (0.3 + 0.7 * t);
      const head = t < 0.3 ? hot : t < 0.75 ? s.color : dark;
      put(Math.round(mid + Math.cos(s.a) * r), Math.round(mid + Math.sin(s.a) * r), head);
      if (t < 0.8) {
        const tail = r - 1.3;
        put(Math.round(mid + Math.cos(s.a) * tail), Math.round(mid + Math.sin(s.a) * tail), t < 0.45 ? main : dark);
      }
    }
    out.push(canvas);
  }
  return out;
}

// A power-up capsule: coloured rim, dark body, white icon. The blink frame
// swaps rim and icon colours so falling capsules flash.
function capsule(icon, color, scale, blink) {
  const n = PICKUP_ART_SIZE;
  const pad = (n - icon.length) / 2;
  const rows = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const edgeX = x === 0 || x === n - 1;
      const edgeY = y === 0 || y === n - 1;
      if (edgeX && edgeY) row += '.';
      else if (edgeX || edgeY) row += 'r';
      else row += icon[y - pad]?.[x - pad] === 'x' ? 'i' : 'f';
    }
    rows.push(row);
  }
  const palette = blink ? { r: '#ffffff', f: '#0b1030', i: color } : { r: color, f: '#0b1030', i: '#ffffff' };
  return rasterize(rows, palette, scale);
}

export function buildSprites() {
  const sprites = { blast: {} };
  for (const [name, frames] of Object.entries(ART)) {
    sprites[name] = frames.map((rows) => rasterize(rows, PALETTES[name], PIXEL));
  }
  sprites.lifeIcon = rasterize(ART.player[0], PALETTES.player, 2);
  let seed = 11;
  for (const [kind, fx] of Object.entries(FX)) sprites.blast[kind] = blastFrames(fx, seed++);
  sprites.pickup = {};
  sprites.pickupIcon = {};
  for (const [name, style] of Object.entries(POWER_STYLE)) {
    sprites.pickup[name] = [capsule(style.icon, style.color, PIXEL, false), capsule(style.icon, style.color, PIXEL, true)];
    sprites.pickupIcon[name] = capsule(style.icon, style.color, 2, false);
  }
  return sprites;
}
