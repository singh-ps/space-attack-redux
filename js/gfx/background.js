// Neo-retro deep space: a dark gradient, two layers of dithered pixel nebula
// drifting at different depths, and a pixel-art planet with banded shading,
// a neon rim light and rings. Each level is its own sector with its own
// colours and planet, and the warp jump between levels carries you past the
// old one. All textures are generated once, when the game loads.
import { makeGlow, hexToRgb } from './glow.js';
import { fbm, bayerAt } from './noise.js';

const PX = 3; // world units per backdrop pixel, matching the sprites
const NEB_W = 160; // nebula tile: one screen wide...
const NEB_H = 214; // ...and a little over one screen tall, repeating vertically
const FAR_SPEED = 5; // nebula drift in px/s at cruising speed
const NEAR_SPEED = 13;
const PLANET_SPEED = 2.5; // planets drift past slowly, and fast at warp
const FAR_ALPHA = 0.7; // nebula opacity, kept low so sprites stay readable
const NEAR_ALPHA = 0.55;
const PLANET_SHADE = 0.72; // planets are darkened so they sit behind the action
const RING_ALPHA = 170;

// One entry per level; the title screen uses the first. Nebula colours are
// the four dithered bands above clear space, as [r, g, b, alpha]. Planet
// sizes are in backdrop pixels; ring radii are in planet radii.
const SECTORS = [
  {
    // Magenta drift: violet haze around a ringed gas giant.
    far: [[34, 10, 74, 0.5], [56, 16, 112, 0.55], [92, 26, 150, 0.55], [140, 44, 190, 0.5]],
    near: [[130, 24, 150, 0.2], [190, 44, 200, 0.26], [255, 84, 220, 0.32], [255, 168, 240, 0.38]],
    shift: 0,
    flip: false,
    planet: {
      x: 424, y: 476, r: 22, bands: 9, seed: 3, rim: '#00f0ff',
      ramp: ['#1a0838', '#3a1268', '#6a2399', '#a43bd0', '#e07bff'],
      ring: { color: '#7fe9ff', inner: 1.35, outer: 2.05, tilt: 0.28, angle: -0.35 },
    },
  },
  {
    // Cyan reach: deep-blue haze, an ice world and its moon.
    far: [[8, 22, 58, 0.55], [10, 40, 88, 0.55], [14, 66, 120, 0.55], [22, 104, 158, 0.5]],
    near: [[0, 120, 170, 0.2], [0, 170, 210, 0.26], [60, 220, 255, 0.32], [170, 245, 255, 0.38]],
    shift: 0.37,
    flip: true,
    planet: {
      x: 58, y: 490, r: 19, bands: 4, seed: 11, rim: '#ff2bd6',
      ramp: ['#0b1d3a', '#173f6e', '#2d6fa3', '#5fb3d9', '#c8f4ff'],
    },
    moon: { dx: 78, dy: -60, r: 5, seed: 12, rim: '#ff2bd6', ramp: ['#1c1c36', '#3c3c64', '#7a7aa8', '#c4c4ec'] },
  },
  {
    // Ember nebula: smouldering red clouds, a rust desert world.
    far: [[40, 8, 22, 0.55], [72, 14, 32, 0.55], [112, 24, 36, 0.55], [164, 44, 40, 0.5]],
    near: [[200, 70, 30, 0.2], [240, 110, 40, 0.26], [255, 150, 60, 0.32], [255, 206, 110, 0.38]],
    shift: 0.62,
    flip: false,
    planet: {
      x: 414, y: 458, r: 17, bands: 3, seed: 21, rim: '#00f0ff',
      ramp: ['#2a0b0b', '#5a1a14', '#9a3a1e', '#d9662b', '#ffb070'],
    },
    moon: { dx: -82, dy: 50, r: 4, seed: 22, rim: '#00f0ff', ramp: ['#2a1a14', '#5a3a2a', '#9a6a4a', '#e0b090'] },
  },
  {
    // Verdant rift: teal-green haze, an emerald giant with a golden ring.
    far: [[6, 30, 32, 0.55], [10, 54, 50, 0.55], [16, 84, 70, 0.55], [30, 120, 96, 0.5]],
    near: [[30, 180, 120, 0.2], [40, 220, 140, 0.26], [100, 245, 180, 0.32], [180, 255, 214, 0.38]],
    shift: 0.18,
    flip: true,
    planet: {
      x: 54, y: 470, r: 24, bands: 11, seed: 31, rim: '#ff2bd6',
      ramp: ['#06261c', '#0f4a35', '#1f7a52', '#3fb87a', '#a6ffd0'],
      ring: { color: '#ffe94d', inner: 1.3, outer: 1.85, tilt: 0.24, angle: 0.3 },
    },
  },
  {
    // Crimson core: the final sector, deep red and violet around a huge ringed giant.
    far: [[42, 4, 32, 0.55], [80, 8, 52, 0.55], [128, 14, 70, 0.55], [186, 30, 92, 0.5]],
    near: [[230, 30, 90, 0.2], [255, 50, 110, 0.26], [255, 100, 150, 0.32], [255, 170, 200, 0.38]],
    shift: 0.83,
    flip: false,
    planet: {
      x: 412, y: 498, r: 27, bands: 13, seed: 41, rim: '#ffe94d',
      ramp: ['#14031f', '#3a0a3d', '#6e1250', '#b0205e', '#ff5c8a'],
      ring: { color: '#ff9a3c', inner: 1.3, outer: 2.1, tilt: 0.3, angle: -0.22 },
    },
  },
];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Cloud density with domain warping, for wispy filaments. Tiles seamlessly.
function densityMap(cells, warp, seed) {
  const cy = Math.round((cells * NEB_H) / NEB_W);
  const map = new Float32Array(NEB_W * NEB_H);
  for (let y = 0; y < NEB_H; y++) {
    for (let x = 0; x < NEB_W; x++) {
      const u = x / NEB_W;
      const v = y / NEB_H;
      const q = fbm(u, v, cells, cy, seed, 4);
      const r = fbm(u + 0.31, v + 0.17, cells, cy, seed + 7, 4);
      map[y * NEB_W + x] = fbm(u + warp * (q - 0.5), v + warp * (r - 0.5), cells, cy, seed + 13);
    }
  }
  return map;
}

// Colours a density map into dithered bands: chunky, limited-palette clouds.
function nebulaLayer(map, levels, shift, flip, lo, hi) {
  const c = makeCanvas(NEB_W, NEB_H);
  const g = c.getContext('2d');
  const img = g.createImageData(NEB_W, NEB_H);
  const dx = Math.round(shift * NEB_W);
  for (let y = 0; y < NEB_H; y++) {
    for (let x = 0; x < NEB_W; x++) {
      const sx = ((flip ? NEB_W - 1 - x : x) + dx) % NEB_W;
      const d = (map[y * NEB_W + sx] - lo) / (hi - lo);
      if (d <= 0) continue;
      const v = Math.min(d, 0.999) * 4;
      let q = Math.floor(v);
      if (v - q > bayerAt(x, y)) q++;
      if (q === 0) continue;
      const [r, gr, b, a] = levels[Math.min(q, 4) - 1];
      const i = (y * NEB_W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// A pixel-art planet lit from the upper left: dithered banded shading, a
// neon rim light on the night side, and an optional tilted ring that passes
// behind and in front of it.
function makePlanet(spec) {
  const R = spec.r;
  const ring = spec.ring;
  const ext = Math.ceil(ring ? R * ring.outer : R);
  const size = ext * 2 + 4;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const ramp = spec.ramp.map((hex) => hexToRgb(hex).map((ch) => ch * PLANET_SHADE));
  const rim = hexToRgb(spec.rim);
  const ringRgb = ring ? hexToRgb(ring.color) : null;
  const cosA = Math.cos(ring?.angle ?? 0);
  const sinA = Math.sin(ring?.angle ?? 0);
  const light = [-0.55, -0.45, 0.7];
  const mid = size / 2;
  const put = (i, [r, gr, b], a) => {
    img.data[i] = r;
    img.data[i + 1] = gr;
    img.data[i + 2] = b;
    img.data[i + 3] = a;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = px + 0.5 - mid;
      const y = py + 0.5 - mid;
      const i = (py * size + px) * 4;
      const dither = bayerAt(px, py);
      const inPlanet = x * x + y * y <= R * R;

      if (ring) {
        // Position in the ring's own (rotated, flattened) frame.
        const rx = x * cosA + y * sinA;
        const ry = -x * sinA + y * cosA;
        const e = Math.hypot(rx / R, ry / (R * ring.tilt));
        if (e >= ring.inner && e <= ring.outer && (ry > 0 || !inPlanet)) {
          const t = (e - ring.inner) / (ring.outer - ring.inner);
          const stripe = 0.5 + 0.5 * Math.sin(t * 19);
          if (stripe > 0.25 + dither * 0.3) {
            const dark = (0.45 + 0.55 * stripe) * PLANET_SHADE;
            put(i, ringRgb.map((ch) => ch * dark), RING_ALPHA);
            continue;
          }
        }
      }
      if (!inPlanet) continue;

      const nx = x / R;
      const ny = y / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lambert = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
      const swirl = fbm(nx * 0.5 + 0.5, ny * 0.5 + 0.5, 3, 3, spec.seed, 4) - 0.5;
      const band = Math.sin((ny + swirl * 0.35) * (spec.bands ?? 2) * Math.PI) * 0.5 + 0.5;
      const v = Math.min(0.999, Math.max(0, lambert * 0.82 + (band - 0.5) * 0.3 + swirl * 0.25 + 0.06)) * ramp.length;
      let q = Math.floor(v);
      if (v - q > dither) q++;
      let color = ramp[Math.min(q, ramp.length - 1)];
      // Neon backlight catching the edge of the night side.
      const edge = nx * nx + ny * ny;
      if (edge > 0.74 && lambert < 0.3 && dither < (edge - 0.74) * 5) color = rim;
      put(i, color, 255);
    }
  }
  g.putImageData(img, 0, 0);
  return { img: c, glow: makeGlow(c, spec.rim, 3, 0.9) };
}

function buildSectors() {
  const far = densityMap(3, 0.35, 5);
  const near = densityMap(5, 0.5, 19);
  return SECTORS.map((s) => ({
    far: nebulaLayer(far, s.far, s.shift, s.flip, 0.46, 0.8),
    near: nebulaLayer(near, s.near, s.shift + 0.5, !s.flip, 0.58, 0.84),
    planet: { ...s.planet, ...makePlanet(s.planet) },
    moon: s.moon ? { ...s.moon, ...makePlanet(s.moon) } : null,
  }));
}

export function createBackground() {
  const sectors = buildSectors();
  let space = null;
  let builtFor = '';

  // The deep-space gradient, cached at the canvas's pixel size.
  function buildSpace(w, scale) {
    space = makeCanvas(Math.round(w.W * scale), Math.round(w.H * scale));
    const g = space.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const grad = g.createLinearGradient(0, 0, 0, w.H);
    grad.addColorStop(0, '#03010a');
    grad.addColorStop(0.5, '#0a0322');
    grad.addColorStop(1, '#05010f');
    g.fillStyle = grad;
    g.fillRect(0, 0, w.W, w.H);
  }

  const sectorOf = (w) => (w.mode === 'title' ? 0 : w.levelIndex % sectors.length);

  function drawLayer(ctx, layer, offset, alpha) {
    const h = NEB_H * PX;
    const y = offset % h;
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, y - h, NEB_W * PX, h);
    ctx.drawImage(layer, 0, y, NEB_W * PX, h);
  }

  function drawBody(ctx, body, x, y) {
    const { img, glow } = body;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glow, x - (glow.width * PX) / 2, y - (glow.height * PX) / 2, glow.width * PX, glow.height * PX);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.drawImage(img, x - (img.width * PX) / 2, y - (img.height * PX) / 2, img.width * PX, img.height * PX);
  }

  return {
    // Gradient and far nebula, behind the stars.
    drawBack(ctx, w, scale) {
      const key = `${w.W}x${w.H}@${scale}`;
      if (key !== builtFor) {
        buildSpace(w, scale);
        builtFor = key;
      }
      ctx.drawImage(space, 0, 0, w.W, w.H);
      drawLayer(ctx, sectors[sectorOf(w)].far, w.scroll * FAR_SPEED, FAR_ALPHA);
      ctx.globalAlpha = 1;
    },

    // The sector's planet, then near nebula wisps in front of it. At warp
    // the wisps smear into streaks.
    drawFront(ctx, w) {
      const s = sectors[sectorOf(w)];
      const drift = w.mode === 'title' ? 0 : (w.scroll - w.levelScroll) * PLANET_SPEED;
      const p = s.planet;
      drawBody(ctx, p, p.x, p.y + drift);
      if (s.moon) drawBody(ctx, s.moon, p.x + s.moon.dx, p.y + s.moon.dy + drift * 1.15);
      const offset = w.scroll * NEAR_SPEED;
      if (w.warp > 2) {
        const smear = (w.warp - 1) * 3;
        drawLayer(ctx, s.near, offset - smear, NEAR_ALPHA * 0.35);
        drawLayer(ctx, s.near, offset - smear * 2, NEAR_ALPHA * 0.2);
      }
      drawLayer(ctx, s.near, offset, NEAR_ALPHA);
      ctx.globalAlpha = 1;
    },
  };
}
