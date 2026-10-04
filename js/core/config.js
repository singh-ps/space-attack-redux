// Turns the editable config.json into flat per-type lookup tables that the
// systems index by enemy type id, and reports config mistakes up front.
import { ART } from '../gfx/art.js';

export const TARGET_MODES = ['direct', 'weave', 'lead'];
const EXIT_MODES = ['return', 'remove'];

export function compileConfig(raw) {
  validate(raw);
  const names = Object.keys(raw.enemyTypes);
  const defs = names.map((n) => raw.enemyTypes[n]);
  const f32 = (pick) => Float32Array.from(defs, pick);
  const types = {
    count: names.length,
    names,
    tier: Uint8Array.from(defs, (d) => d.tier),
    scoreFormation: Uint32Array.from(defs, (d) => d.scoreFormation),
    scoreFlight: Uint32Array.from(defs, (d) => d.scoreFlight),
    diveWeight: f32((d) => d.diveWeight),
    fireCooldown: f32((d) => d.fireCooldownSec),
    turnCooldown: f32((d) => d.turnCooldownSec),
    bulletSpeed: f32((d) => d.bulletSpeed),
    targetMode: Uint8Array.from(defs, (d) => TARGET_MODES.indexOf(d.targeting.mode)),
    weaveOffset: f32((d) => d.targeting.offsetPx ?? 0),
    leadMaxSec: f32((d) => d.targeting.maxLeadSec ?? 0),
  };
  const typeIndex = Object.fromEntries(names.map((n, i) => [n, i]));
  return { ...raw, types, typeIndex, fxKinds: [...names, 'player'] };
}

function validate(raw) {
  const problems = [];
  const num = (v, path) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${path} must be a number`);
  };
  const typeNames = Object.keys(raw.enemyTypes ?? {});
  if (!typeNames.length) problems.push('enemyTypes must define at least one enemy type');
  for (const name of typeNames) {
    const d = raw.enemyTypes[name];
    if (!ART[name] || name === 'player') problems.push(`enemyTypes.${name} has no sprite`);
    for (const k of ['tier', 'scoreFormation', 'scoreFlight', 'diveWeight', 'fireCooldownSec', 'turnCooldownSec', 'bulletSpeed']) {
      num(d[k], `enemyTypes.${name}.${k}`);
    }
    if (!TARGET_MODES.includes(d.targeting?.mode)) {
      problems.push(`enemyTypes.${name}.targeting.mode must be one of: ${TARGET_MODES.join(', ')}`);
    }
  }
  for (const k of ['speed', 'fireCooldownSec', 'bulletSpeed', 'lives', 'respawnDelaySec', 'respawnInvulnSec', 'hitboxScale']) {
    num(raw.player?.[k], `player.${k}`);
  }
  for (const k of ['speed', 'lateralSpeed', 'steerGain', 'steerAccel', 'peelRadius', 'peelSec', 'returnSpeed']) {
    num(raw.dive?.[k], `dive.${k}`);
  }
  if (!EXIT_MODES.includes(raw.dive?.onExitBottom)) {
    problems.push(`dive.onExitBottom must be one of: ${EXIT_MODES.join(', ')}`);
  }
  const rows = raw.formation?.rows ?? [];
  rows.forEach((r, i) => {
    if (!typeNames.includes(r.type)) problems.push(`formation.rows[${i}].type "${r.type}" is not an enemy type`);
    for (const c of r.cols ?? []) {
      if (!(c >= 0 && c < raw.formation.columns)) problems.push(`formation.rows[${i}] column ${c} is outside 0-${raw.formation.columns - 1}`);
    }
  });
  if (!raw.levels?.length) problems.push('levels must list at least one level');
  (raw.levels ?? []).forEach((l, i) => {
    if (!(l.rows >= 1 && l.rows <= rows.length)) problems.push(`levels[${i}].rows must be 1-${rows.length}`);
    for (const k of ['speedMul', 'diveIntervalSec', 'maxDivers', 'maxEnemyBullets']) num(l[k], `levels[${i}].${k}`);
  });
  if (problems.length) throw new Error(`config.json has problems:\n- ${problems.join('\n- ')}`);
}
