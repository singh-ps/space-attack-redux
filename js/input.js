// Keyboard input mapped to game actions. `pressed` reports presses since the
// last frame; auto-repeat is ignored, so holding a key never counts as
// pressing it again.

const BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  fire: ['Space', 'KeyZ'],
  start: ['Enter', 'NumpadEnter', 'Space'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  music: ['KeyN'],
};

export function createKeyboard(target = window) {
  const held = new Set();
  const pressed = new Set();
  const actionsFor = new Map();
  for (const [action, codes] of Object.entries(BINDINGS)) {
    for (const code of codes) actionsFor.set(code, [...(actionsFor.get(code) ?? []), action]);
  }

  target.addEventListener('keydown', (e) => {
    const actions = actionsFor.get(e.code);
    if (!actions || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    held.add(e.code);
    if (!e.repeat) for (const a of actions) pressed.add(a);
  });
  target.addEventListener('keyup', (e) => held.delete(e.code));
  target.addEventListener('blur', () => held.clear());

  return {
    down: (action) => BINDINGS[action].some((code) => held.has(code)),
    pressed: (action) => pressed.has(action),
    endFrame: () => pressed.clear(),
  };
}
