// Targeting strategies, indexed by an enemy type's targeting mode (the order
// matches TARGET_MODES in core/config.js). At each turn decision a diver asks
// its strategy for an x position to steer toward.
export const TARGETING = [
  // direct: the player's current position.
  (w) => w.player.x,

  // weave: alternate slightly left and right of the player on every decision.
  (w, i) => {
    const E = w.enemies;
    E.weave[i] = -E.weave[i];
    return w.player.x + E.weave[i] * w.cfg.types.weaveOffset[E.type[i]];
  },

  // lead: where the player will be by the time the diver reaches their height,
  // extrapolated from their recent horizontal velocity.
  (w, i) => {
    const E = w.enemies;
    const p = w.player;
    const eta = (p.y - E.y[i]) / Math.max(E.vy[i], 1);
    const t = Math.min(Math.max(eta, 0), w.cfg.types.leadMaxSec[E.type[i]]);
    return p.x + p.vxSmooth * t;
  },
];
