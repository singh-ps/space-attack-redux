// Seeded, tileable value noise for generating nebula and planet textures.
// Coordinates are in texture space where 1.0 is one full tile, so every
// pattern wraps seamlessly in both directions.

function hash(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (i, period) => ((i % period) + period) % period;

// Smoothly interpolated noise on a lattice that repeats every px by py cells.
function noise(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = x - xi;
  const v = y - yi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const x0 = wrap(xi, px);
  const x1 = wrap(xi + 1, px);
  const y0 = wrap(yi, py);
  const y1 = wrap(yi + 1, py);
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

// Fractal noise in [0, 1] with cellsX by cellsY lattice cells per tile,
// doubling each octave.
export function fbm(x, y, cellsX, cellsY, seed, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const px = cellsX << o;
    const py = cellsY << o;
    sum += amp * noise(x * px, y * py, px, py, seed + o * 101);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// 4x4 ordered-dither thresholds, for a retro banded look.
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayerAt = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
