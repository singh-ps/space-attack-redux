// Sound effects and background music synthesized with the Web Audio API, so
// the game ships no audio files. The audio context is created on the first
// key press or click because browsers block sound before a user gesture.

const STORE = 'space-attack-redux:';
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function load(key) {
  try {
    return localStorage.getItem(STORE + key);
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(STORE + key, value);
  } catch {
    // Storage can be unavailable (private mode); settings just won't persist.
  }
}

// Eight-bar loop in A minor: [bass root, chord tones for the arpeggio] per bar.
const PROGRESSION = [
  [45, [57, 60, 64]], // Am
  [41, [57, 60, 65]], // F
  [48, [55, 60, 64]], // C
  [43, [55, 59, 62]], // G
  [45, [57, 60, 64]], // Am
  [41, [57, 60, 65]], // F
  [43, [55, 59, 62]], // G
  [40, [56, 59, 64]], // E
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3]; // 3 = root an octave up
// Lead melody, played on every other pass of the loop: [16th step, note, length].
const LEAD = new Map(
  [
    [0, 69, 4], [4, 72, 2], [6, 76, 2], [8, 81, 4], [12, 79, 2], [14, 76, 2],
    [16, 77, 4], [20, 76, 2], [22, 72, 2], [24, 69, 8],
    [32, 67, 4], [36, 72, 2], [38, 76, 2], [40, 79, 4], [44, 76, 2], [46, 72, 2],
    [48, 74, 4], [52, 71, 2], [54, 67, 2], [56, 71, 4], [60, 74, 4],
    [64, 69, 2], [66, 72, 2], [68, 76, 2], [70, 81, 2], [72, 84, 4], [76, 83, 2], [78, 81, 2],
    [80, 81, 4], [84, 77, 4], [88, 72, 4], [92, 77, 4],
    [96, 79, 4], [100, 74, 4], [104, 71, 4], [108, 74, 2], [110, 79, 2],
    [112, 80, 8], [120, 76, 4], [124, 71, 4],
  ].map(([step, note, len]) => [step, [note, len]]),
);
const LOOP_STEPS = 128;

export function createAudio(settings) {
  let ctx = null;
  let master, sfx, music, duck, musicGate, bass, lead, noiseBuf, pulse12, pulse25, pulse50;
  let muted = load('muted') === '1';
  let musicOn = load('music') !== '0';
  let held = false; // suspended by the game (pause or hidden tab)
  let lastEnemyShot = 0;
  const seq = { on: false, timer: 0, step: 0, pass: 0, next: 0, bpm: settings.musicBpm };

  function gainNode(value, dest) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  function pulseWave(duty) {
    const real = new Float32Array(48);
    const imag = new Float32Array(48);
    for (let k = 1; k < real.length; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const limiter = ctx.createDynamicsCompressor();
    limiter.connect(ctx.destination);
    master = gainNode(muted ? 0 : settings.master, limiter);
    sfx = gainNode(settings.sfx, master);
    musicGate = gainNode(musicOn ? 1 : 0, master);
    duck = gainNode(1, musicGate);
    music = gainNode(settings.music, duck);
    bass = ctx.createBiquadFilter();
    bass.type = 'lowpass';
    bass.frequency.value = 1100;
    bass.connect(music);
    lead = gainNode(1, music);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.19;
    lead.connect(echo);
    echo.connect(gainNode(0.28, echo));
    echo.connect(gainNode(0.3, music));

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    pulse12 = pulseWave(0.125);
    pulse25 = pulseWave(0.25);
    pulse50 = pulseWave(0.5);
    return true;
  }

  function tone(dest, { wave = 'square', f0, f1 = 0, at = ctx.currentTime, dur, vol, attack = 0.004, hold = 0 }) {
    const osc = ctx.createOscillator();
    if (typeof wave === 'string') osc.type = wave;
    else osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(f0, at);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vol, at + attack);
    if (hold) env.gain.setValueAtTime(vol, at + dur * hold);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function noise(dest, { at = ctx.currentTime, dur, vol, type = 'lowpass', f0, f1 = 0, q = 0.8 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, at);
    if (f1) filter.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(dest);
    src.start(at, Math.random() * 0.9);
    src.stop(at + dur + 0.02);
  }

  // Plays notes in sequence; an entry is a MIDI note, [note, length multiplier] or null (rest).
  function jingle(notes, { wave = pulse25, step = 0.09, vol = 0.08, delay = 0 } = {}) {
    const t0 = ctx.currentTime + 0.02 + delay;
    notes.forEach((n, k) => {
      if (n === null) return;
      const [note, len = 1] = Array.isArray(n) ? n : [n];
      tone(sfx, { wave, f0: midiHz(note), at: t0 + k * step, dur: step * len, vol, hold: 0.6 });
    });
  }

  const play = {
    playerFire() {
      tone(sfx, { wave: pulse25, f0: 1250, f1: 300, dur: 0.12, vol: 0.11 });
      tone(sfx, { wave: 'triangle', f0: 2200, f1: 700, dur: 0.06, vol: 0.05 });
    },
    enemyFire(tier) {
      // Several divers can fire on the same frame; one zap is enough.
      if (ctx.currentTime - lastEnemyShot < 0.05) return;
      lastEnemyShot = ctx.currentTime;
      const f = 380 + tier * 90;
      tone(sfx, { wave: 'sawtooth', f0: f, f1: f * 0.4, dur: 0.14, vol: 0.035 });
    },
    enemyDeath(tier) {
      const big = tier >= 3;
      noise(sfx, { dur: big ? 0.6 : 0.22 + tier * 0.05, vol: big ? 0.45 : 0.3, f0: 4800, f1: 220 });
      tone(sfx, { wave: pulse50, f0: 260 + tier * 80, f1: 45, dur: big ? 0.35 : 0.16, vol: 0.07 });
      if (big) tone(sfx, { wave: 'sine', f0: 150, f1: 30, dur: 0.55, vol: 0.5 });
    },
    playerDeath(livesLeft) {
      noise(sfx, { dur: 1.3, vol: 0.55, f0: 3200, f1: 70 });
      tone(sfx, { wave: 'sawtooth', f0: 680, f1: 35, dur: 1.1, vol: 0.1 });
      tone(sfx, { wave: 'sine', f0: 120, f1: 25, dur: 0.9, vol: 0.6 });
      if (livesLeft > 0) jingle([76, 72, 69, [64, 3]], { wave: 'triangle', step: 0.14, vol: 0.12, delay: 0.7 });
    },
    levelStart(level) {
      const root = 64 + level * 2;
      jingle([root, root + 4, root + 7, [root + 12, 2]], { step: 0.08 });
    },
    levelClear() {
      jingle([72, 76, 79, 84, 79, 84, [88, 4]], { step: 0.085 });
    },
    gameOver() {
      jingle([69, 67, 65, [64, 2], null, [57, 5]], { wave: pulse50, step: 0.22, vol: 0.07 });
    },
    victory() {
      jingle([67, 67, 67, [72, 3], null, 71, 72, [76, 6]], { step: 0.12 });
      const at = ctx.currentTime + 1.0;
      for (const note of [60, 64, 67, 72]) tone(sfx, { wave: pulse50, f0: midiHz(note), at, dur: 1.4, vol: 0.04, hold: 0.5 });
    },
  };

  function scheduleStep(step, at) {
    const s = step & 15;
    const bar = step >> 4;
    const [root, chord] = PROGRESSION[bar];
    const stepDur = 60 / seq.bpm / 4;
    if (s % 2 === 0) {
      const note = root + (s % 4 === 2 ? 12 : 0);
      tone(bass, { f0: midiHz(note), at, dur: stepDur * 1.8, vol: 0.13, hold: 0.5 });
      noise(music, { at, dur: 0.035, vol: s % 4 === 2 ? 0.05 : 0.025, type: 'highpass', f0: 7000 });
    }
    const k = ARP[s];
    const arpNote = (k === 3 ? chord[0] + 12 : chord[k]) + 12;
    tone(music, { wave: pulse12, f0: midiHz(arpNote), at, dur: stepDur * 0.9, vol: 0.035 });
    if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1)) {
      tone(music, { wave: 'sine', f0: 150, f1: 42, at, dur: 0.14, vol: 0.55 });
    }
    if (s === 4 || s === 12) {
      noise(music, { at, dur: 0.13, vol: 0.2, type: 'bandpass', f0: 1900, q: 0.7 });
      tone(music, { wave: 'triangle', f0: 240, f1: 130, at, dur: 0.07, vol: 0.08 });
    }
    const melody = seq.pass % 2 === 1 && LEAD.get(step);
    if (melody) {
      tone(lead, { wave: pulse50, f0: midiHz(melody[0]), at, dur: melody[1] * stepDur, vol: 0.05, attack: 0.01, hold: 0.7 });
    }
  }

  // Look-ahead scheduler: a timer queues notes slightly ahead of the audio clock.
  function pump() {
    if (!seq.on || ctx.state !== 'running') return;
    if (seq.next < ctx.currentTime) seq.next = ctx.currentTime + 0.03; // fell behind; skip, don't burst
    while (seq.next < ctx.currentTime + 0.12) {
      if (musicOn) scheduleStep(seq.step, seq.next);
      seq.next += 60 / seq.bpm / 4;
      seq.step = (seq.step + 1) % LOOP_STEPS;
      if (seq.step === 0) seq.pass++;
    }
  }

  function startMusic(level, delay) {
    seq.bpm = settings.musicBpm + settings.musicBpmPerLevel * level;
    if (seq.on) return;
    seq.on = true;
    seq.step = 0;
    seq.pass = 0;
    seq.next = ctx.currentTime + delay;
    seq.timer = setInterval(pump, 25);
  }

  function stopMusic() {
    seq.on = false;
    clearInterval(seq.timer);
  }

  function duckTo(level, seconds) {
    duck.gain.setTargetAtTime(level, ctx.currentTime, seconds);
  }

  function suspend() {
    held = true;
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    held = false;
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return {
    get muted() {
      return muted;
    },
    get musicOn() {
      return musicOn;
    },

    // Call from user gestures; creates or wakes the audio context.
    unlock() {
      if (!ctx && !init()) return;
      if (!held && ctx.state === 'suspended') ctx.resume();
    },

    suspend,
    resume,

    toggleMute() {
      muted = !muted;
      save('muted', muted ? '1' : '0');
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : settings.master, ctx.currentTime, 0.02);
      return muted;
    },

    toggleMusic() {
      musicOn = !musicOn;
      save('music', musicOn ? '1' : '0');
      if (ctx) musicGate.gain.setTargetAtTime(musicOn ? 1 : 0, ctx.currentTime, 0.05);
      return musicOn;
    },

    handle(ev) {
      if (!ctx) return;
      switch (ev.type) {
        case 'playerFire':
          return play.playerFire();
        case 'enemyFire':
          return play.enemyFire(ev.tier);
        case 'enemyDeath':
          return play.enemyDeath(ev.tier);
        case 'playerDeath':
          duckTo(0.25, 0.08);
          return play.playerDeath(ev.livesLeft);
        case 'respawn':
          return duckTo(1, 0.4);
        case 'levelStart':
          duckTo(1, 0.2);
          play.levelStart(ev.level);
          return startMusic(ev.level, 0.5);
        case 'levelClear':
          return play.levelClear();
        case 'gameOver':
          stopMusic();
          return play.gameOver();
        case 'victory':
          stopMusic();
          return play.victory();
        case 'pause':
          return suspend();
        case 'resume':
          return resume();
      }
    },
  };
}
