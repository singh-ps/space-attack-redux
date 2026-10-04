// Turns the editable config.json into flat lookup tables that the systems
// index by id, and reports config mistakes up front.
import { ART } from '../gfx/art.js';

export const TARGET_MODES = ['direct', 'weave', 'lead'];
// Power-up ids are indexes into this list; each power has its own rules in
// the weapon and collision systems.
export const POWERS = ['scatter', 'multi', 'double', 'shield', 'attackSpeed'];
const EXIT_MODES = ['return', 'remove'];
const DEG = Math.PI / 180;

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
    dropChance: f32((d) => d.dropChance),
    targetMode: Uint8Array.from(defs, (d) => TARGET_MODES.indexOf(d.targeting.mode)),
    weaveOffset: f32((d) => d.targeting.offsetPx ?? 0),
    leadMaxSec: f32((d) => d.targeting.maxLeadSec ?? 0),
  };
  const typeIndex = Object.fromEntries(names.map((n, i) => [n, i]));

  const P = raw.pickups.powers;
  const powers = {
    weight: Float32Array.from(POWERS, (n) => P[n].weight),
    duration: Float32Array.from(POWERS, (n) => P[n].durationSec),
  };
  // Weapon numbers in the form the firing code uses them.
  const weapon = {
    scatterSin: Float32Array.from(P.scatter.anglesDeg, (a) => Math.sin(a * DEG)),
    scatterCos: Float32Array.from(P.scatter.anglesDeg, (a) => Math.cos(a * DEG)),
    multiVolleys: P.multi.extraVolleys,
    multiGapSec: P.multi.volleyGapSec,
    doubleHalfGap: P.double.spacingPx / 2,
    shieldHits: P.shield.hits,
    shieldGraceSec: P.shield.graceSec,
    attackSpeedMul: P.attackSpeed.cooldownMul,
  };

  const fxKinds = [...names, 'player', ...POWERS];
  const fxKind = Object.fromEntries(fxKinds.map((n, i) => [n, i]));
  return { ...raw, types, typeIndex, powers, weapon, fxKinds, fxKind };
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
    for (const k of ['tier', 'scoreFormation', 'scoreFlight', 'diveWeight', 'fireCooldownSec', 'turnCooldownSec', 'bulletSpeed', 'dropChance']) {
      num(d[k], `enemyTypes.${name}.${k}`);
    }
    if (!TARGET_MODES.includes(d.targeting?.mode)) {
      problems.push(`enemyTypes.${name}.targeting.mode must be one of: ${TARGET_MODES.join(', ')}`);
    }
  }
  for (const k of ['speed', 'fireCooldownSec', 'bulletSpeed', 'lives', 'respawnDelaySec', 'respawnInvulnSec', 'hitboxScale']) {
    num(raw.player?.[k], `player.${k}`);
  }
  if (typeof raw.player?.autoFire !== 'boolean') problems.push('player.autoFire must be true or false');
  for (const k of ['dragSensitivity', 'speedMul']) num(raw.touch?.[k], `touch.${k}`);
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

  for (const k of ['fallSpeed', 'maxOnScreen', 'minGapSec']) num(raw.pickups?.[k], `pickups.${k}`);
  const powers = raw.pickups?.powers ?? {};
  for (const name of Object.keys(powers)) {
    if (!POWERS.includes(name)) problems.push(`pickups.powers.${name} is not a known power (${POWERS.join(', ')})`);
  }
  const powerFields = {
    scatter: [],
    multi: ['extraVolleys', 'volleyGapSec'],
    double: ['spacingPx'],
    shield: ['hits', 'graceSec'],
    attackSpeed: ['cooldownMul'],
  };
  for (const name of POWERS) {
    const p = powers[name];
    if (!p) {
      problems.push(`pickups.powers.${name} is missing (set its weight to 0 to disable it)`);
      continue;
    }
    for (const k of ['weight', 'durationSec', ...powerFields[name]]) num(p[k], `pickups.powers.${name}.${k}`);
  }
  if (powers.scatter && !(Array.isArray(powers.scatter.anglesDeg) && powers.scatter.anglesDeg.every(Number.isFinite))) {
    problems.push('pickups.powers.scatter.anglesDeg must be a list of angles in degrees');
  }
  for (const k of ['speedMul', 'engageDelaySec', 'rampUpSec', 'rampDownSec']) num(raw.warp?.[k], `warp.${k}`);

  if (problems.length) throw new Error(`config.json has problems:\n- ${problems.join('\n- ')}`);
}
