// Pixel art as plain data, shared by the renderer and the simulation (which
// needs sprite sizes for hitboxes). Rows list the left half of a sprite up to
// and including the centre column; the right half is mirrored so every design
// stays symmetrical. '.' is transparent, other characters index the palette.

export const PIXEL = 3; // screen px per art pixel

const mirror = (rows) => rows.map((r) => r + [...r.slice(0, -1)].reverse().join(''));

export const PALETTES = {
  player: { w: '#eef3ff', s: '#8fa3c8', b: '#3a6bff', d: '#22357a', c: '#7ff3ff', r: '#ff3b4e' },
  delta: { a: '#46f0ff', b: '#1fa3d6', c: '#174c9c', e: '#ffe14d' },
  alpha: { m: '#ff4fd8', p: '#9b3cff', v: '#5b1fa8', o: '#ffa23c' },
  omega: { g: '#ffcc33', y: '#ff8a1f', r: '#ff3344', k: '#8a1020', c: '#7ff3ff', w: '#ffffff' },
};

export const ART = {
  player: [
    mirror([
      '......w',
      '.....ww',
      '.....wc',
      '.....wc',
      '....swc',
      '....sww',
      '.r..sbw',
      '.r.ssbw',
      '.rssbbw',
      'rssbbsw',
      'rs.dbss',
      'r...d.s',
    ]),
  ],
  delta: [
    mirror([
      'a.....',
      'ab....',
      'abb...',
      '.abbaa',
      '..bccc',
      '...bce',
      '....bc',
      '.....b',
    ]),
    mirror([
      '......',
      '......',
      '...aaa',
      '.aabba',
      'ab.bcc',
      'a..bce',
      '....bc',
      '.....b',
    ]),
  ],
  alpha: [
    mirror([
      'o.....',
      'om....',
      '.m..pp',
      '.mmppp',
      '..povp',
      '.ppppp',
      'm.p.vv',
      'm.m...',
    ]),
    mirror([
      '......',
      '..o...',
      '.mm.pp',
      'mm.ppp',
      'm.povp',
      '.ppppp',
      '..p.vv',
      '.m.m..',
    ]),
  ],
  omega: [
    mirror([
      '....ggg',
      '..ggyyy',
      '.gyyrrr',
      '.gyr...',
      'gyr..wc',
      'gyr..cc',
      '.gr....',
      '..gr...',
      'gggr...',
      'yyk....',
    ]),
    mirror([
      '....ggg',
      '..ggyyy',
      '.gyyrrr',
      '.gyr...',
      'gyr..cw',
      'gyr..ww',
      '.gr....',
      '..gr...',
      'gggr...',
      'rrk....',
    ]),
  ],
};

export function artSize(name, scale = PIXEL) {
  const rows = ART[name][0];
  return { w: rows[0].length * scale, h: rows.length * scale };
}

// Colours used for each object's blast sprite, debris and bullets, picked from
// its own palette so the effects match the sprite.
export const FX = {
  delta: { blast: ['#fffbe6', '#46f0ff', '#1fa3d6', '#ffe14d'], bullet: '#7ff8ff', size: 13, frames: 6, duration: 0.4 },
  alpha: { blast: ['#fff0fb', '#ff4fd8', '#9b3cff', '#ffa23c'], bullet: '#ff8ef0', size: 13, frames: 6, duration: 0.42 },
  omega: { blast: ['#ffffff', '#ffcc33', '#ff3344', '#7ff3ff'], bullet: '#ffb347', size: 17, frames: 7, duration: 0.55 },
  player: { blast: ['#ffffff', '#7ff3ff', '#3a6bff', '#ff3b4e'], bullet: '#fff6a8', size: 21, frames: 8, duration: 0.9 },
};
