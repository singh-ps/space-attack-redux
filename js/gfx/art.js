// Pixel art and colour data, shared by the renderer and the simulation (which
// needs sprite sizes for hitboxes). Rows list the left half of a sprite up to
// and including the centre column; the right half is mirrored so every design
// stays symmetrical. '.' is transparent, other characters index the palette.
//
// The look is neo-retro: chunky pixels with a dark body, bright neon rims and
// emissive details, lit by glow halos at render time.

export const PIXEL = 3; // screen px per art pixel

const mirror = (rows) => rows.map((r) => r + [...r.slice(0, -1)].reverse().join(''));

// Synthwave UI colours.
export const NEON = {
  magenta: '#ff2bd6',
  cyan: '#00f0ff',
  yellow: '#ffe94d',
  violet: '#9b5cff',
  pink: '#ff2e88',
  orange: '#ff8a1f',
  green: '#39ff88',
  white: '#ffffff',
  dim: '#8f86c9',
};

export const PALETTES = {
  player: { w: '#ffffff', s: '#c9d3ff', b: '#7a6cff', n: '#2a1f6e', g: '#00f0ff', m: '#ff2bd6', p: '#ff9cf0' },
  delta: { k: '#04263a', d: '#0b5f86', m: '#00b4e6', l: '#46f4ff', h: '#e0ffff', e: '#fff36b' },
  alpha: { k: '#24063a', d: '#5a1a96', m: '#a43bff', l: '#ff4fd8', h: '#ffc9f5', e: '#fff36b', c: '#00f0ff' },
  omega: { k: '#3a0618', d: '#8f1238', m: '#ff2e63', o: '#ff8a1f', y: '#ffe94d', h: '#fff8dc', c: '#00f0ff', w: '#ffffff' },
};

export const ART = {
  player: [
    mirror([
      '......w',
      '.....sw',
      '.....sg',
      '....bsg',
      '....bsw',
      '...nbss',
      'm..nbbs',
      'p.nbbms',
      'mnnbbmw',
      'mnbbnms',
      '.n.nnbn',
      '...g..g',
    ]),
  ],
  delta: [
    mirror([
      'l.....',
      'ml....',
      'dml.ll',
      '.dmmhh',
      '..dmee',
      '...dmm',
      '....dm',
      '.....k',
    ]),
    mirror([
      '......',
      '......',
      'l..lll',
      'ml.mhh',
      'dmdmee',
      '.d.dmm',
      '....dm',
      '.....k',
    ]),
  ],
  alpha: [
    mirror([
      'c.....',
      'lc....',
      '.l..mm',
      '.llmll',
      '..mekm',
      '.dmmmm',
      'l.d.dd',
      'l.l...',
    ]),
    mirror([
      '......',
      '..c...',
      '.lc.mm',
      'll.mll',
      'l.mekm',
      '.dmmmm',
      '..d.dd',
      '.l.l..',
    ]),
  ],
  omega: [
    mirror([
      '....hyy',
      '..yyooo',
      '.yoommm',
      'yomdkkk',
      'omd.kcw',
      'omd.kcc',
      '.md..k.',
      '.md....',
      'oomd...',
      'yyk....',
    ]),
    mirror([
      '....hyy',
      '..yyooo',
      '.yoommm',
      'yomdkkk',
      'omd.kwc',
      'omd.kww',
      '.md..k.',
      '.md....',
      'yomd...',
      'ook....',
    ]),
  ],
};

export function artSize(name, scale = PIXEL) {
  const rows = ART[name][0];
  return { w: rows[0].length * scale, h: rows.length * scale };
}

// Effect colours per kind (enemy types, the player and each power-up):
// blast is [hot core, main, dark, accent] for blast sprites, sparks, debris
// and shockwaves; glow tints halos; bullet is the shot colour. Kinds with a
// size also get pixel blast sprites.
export const FX = {
  delta: { blast: ['#ffffff', '#46f4ff', '#0b5f86', '#fff36b'], glow: '#00d8ff', bullet: '#46f4ff', size: 13, frames: 6, duration: 0.4 },
  alpha: { blast: ['#ffffff', '#ff4fd8', '#5a1a96', '#fff36b'], glow: '#ff2bd6', bullet: '#ff6ae0', size: 13, frames: 6, duration: 0.42 },
  omega: { blast: ['#ffffff', '#ffe94d', '#ff2e63', '#00f0ff'], glow: '#ff6a2e', bullet: '#ff9a3c', size: 17, frames: 7, duration: 0.55 },
  player: { blast: ['#ffffff', '#00f0ff', '#7a6cff', '#ff2bd6'], glow: '#00f0ff', bullet: '#ffe94d', size: 21, frames: 8, duration: 0.9 },
  scatter: { blast: ['#ffffff', '#ff9a3c', '#a34a00', '#ffe94d'], glow: '#ff9a3c' },
  multi: { blast: ['#ffffff', '#ff4fd8', '#7a1a8f', '#ffc9f5'], glow: '#ff4fd8' },
  double: { blast: ['#ffffff', '#00f0ff', '#0b5f86', '#c8ffff'], glow: '#00f0ff' },
  shield: { blast: ['#eafff3', '#39ff88', '#1fae5c', '#b8ffd6'], glow: '#39ff88', size: 21, frames: 6, duration: 0.45 },
  attackSpeed: { blast: ['#ffffff', '#ffe94d', '#a38a00', '#fff8dc'], glow: '#ffe94d' },
};

// Power-up capsules: a 9x9 capsule around a 5x5 icon ('x' marks icon pixels).
export const PICKUP_ART_SIZE = 9;
export const POWER_STYLE = {
  scatter: { color: '#ff9a3c', label: 'SCATTER SHOT', short: 'SCATTER', icon: ['x.x.x', '.xxx.', '..x..', '..x..', '..x..'] },
  multi: { color: '#ff4fd8', label: 'MULTI SHOT', short: 'MULTI', icon: ['..x..', '.xxx.', '..x..', '.xxx.', '..x..'] },
  double: { color: '#00f0ff', label: 'DOUBLE SHOT', short: 'DOUBLE', icon: ['.x.x.', '.x.x.', '.x.x.', '.x.x.', '.x.x.'] },
  shield: { color: '#39ff88', label: 'SHIELD', short: 'SHIELD', icon: ['xxxxx', 'x...x', 'x...x', '.x.x.', '..x..'] },
  attackSpeed: { color: '#ffe94d', label: 'ATTACK SPEED UP', short: 'SPEED', icon: ['..x..', '.x.x.', 'x.x.x', '.x.x.', 'x...x'] },
};
