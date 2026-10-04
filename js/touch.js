// Touch controls for phones and tablets. Drag anywhere to steer: the ship
// follows the finger's movement relative to where it went down, so the finger
// never has to cover the ship. A finger down also holds the fire button, a tap
// starts, restarts or resumes the game, and two small buttons toggle sound
// and pause. Only touch pointers are handled; mouse and keyboard play is
// unchanged.
import { PAUSABLE } from './game.js';

export const BUTTON_HALF = 14; // drawn size, in world units
const HIT_HALF = 23; // a bigger touch target than the drawn button

// Sound and pause buttons in the top right corner, under the level counter.
export function touchButtons(W) {
  return [
    { action: 'mute', x: W - 78, y: 62 },
    { action: 'pause', x: W - 30, y: 62 },
  ];
}

export const buttonVisible = (w, b) => b.action !== 'pause' || w.paused || PAUSABLE.has(w.mode);

export function createTouch({ canvas, world, buttons, target = window }) {
  const fingers = new Map(); // pointerId → last clientX
  let steering = null; // pointerId of the finger that steers
  let dragDx = 0; // world units of steering movement since the last frame
  const pressed = new Set();

  // World units per CSS pixel at the canvas's current size.
  const unitsPerPx = () => world.W / canvas.getBoundingClientRect().width;

  function buttonAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * (world.W / r.width);
    const y = (clientY - r.top) * (world.H / r.height);
    return buttons.find(
      (b) => buttonVisible(world, b) && Math.abs(x - b.x) <= HIT_HALF && Math.abs(y - b.y) <= HIT_HALF,
    );
  }

  target.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      const button = buttonAt(e.clientX, e.clientY);
      if (button) {
        pressed.add(button.action);
        return;
      }
      if (world.paused) {
        pressed.add('pause'); // tap anywhere to resume
        return;
      }
      fingers.set(e.pointerId, e.clientX);
      if (steering === null) steering = e.pointerId;
      pressed.add('start');
      pressed.add('fire');
    },
    { passive: false },
  );

  target.addEventListener(
    'pointermove',
    (e) => {
      const last = fingers.get(e.pointerId);
      if (last === undefined) return;
      e.preventDefault();
      fingers.set(e.pointerId, e.clientX);
      if (e.pointerId === steering) dragDx += (e.clientX - last) * unitsPerPx();
    },
    { passive: false },
  );

  const release = (e) => {
    if (!fingers.delete(e.pointerId)) return;
    // Another finger still down takes over steering.
    if (e.pointerId === steering) steering = fingers.size ? fingers.keys().next().value : null;
  };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => {
    fingers.clear();
    steering = null;
  });

  return {
    down: (action) => action === 'fire' && fingers.size > 0,
    pressed: (action) => pressed.has(action),
    dragging: () => steering !== null,
    dragDx: () => dragDx,
    endFrame() {
      pressed.clear();
      dragDx = 0;
    },
  };
}
