// Glow textures, made once and drawn with additive blending: blurred halos
// that follow a sprite's silhouette, and soft light dots for shots, sparks
// and flashes. Blurring at load time keeps per-frame cost to plain drawImage.

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Separable box blur of a one-channel buffer, in place. Three passes
// approximate a Gaussian.
function boxBlur(buf, w, h, r) {
  const tmp = new Float32Array(buf.length);
  const span = r * 2 + 1;
  const at = (i, lo, hi) => (i < lo ? lo : i > hi ? hi : i);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += buf[row + at(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / span;
      sum += buf[row + at(x + r + 1, 0, w - 1)] - buf[row + at(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[at(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      buf[y * w + x] = sum / span;
      sum += tmp[at(y + r + 1, 0, h - 1) * w + x] - tmp[at(y - r, 0, h - 1) * w + x];
    }
  }
}

// A one-colour halo around a sprite's silhouette, padded so it can spread.
// Draw it centred on the sprite, under it, with 'lighter' blending.
export function makeGlow(sprite, color, radius = 4, gain = 1.6) {
  const pad = radius * 3;
  const w = sprite.width + pad * 2;
  const h = sprite.height + pad * 2;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(sprite, pad, pad);
  const img = g.getImageData(0, 0, w, h);
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3] / 255;
  for (let pass = 0; pass < 3; pass++) boxBlur(alpha, w, h, radius);
  const [r, gr, b] = hexToRgb(color);
  for (let i = 0; i < alpha.length; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gr;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.min(255, alpha[i] * 255 * gain);
  }
  g.putImageData(img, 0, 0);
  return c;
}

const dots = new Map();

// A soft round light in the given colour, cached per colour. Draw it scaled
// to the size you need.
export function glowDot(color) {
  let c = dots.get(color);
  if (c) return c;
  c = makeCanvas(32, 32);
  const g = c.getContext('2d');
  const [r, gr, b] = hexToRgb(color);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
  grad.addColorStop(0.3, `rgba(${r},${gr},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dots.set(color, c);
  return c;
}
