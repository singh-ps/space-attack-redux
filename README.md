# Space Attack Redux

A neo-retro arcade space shooter built with plain HTML5 canvas, JavaScript and CSS. Chunky pixel-art sprites are lit with neon glow over a synthwave sunset and grid, inside a CRT-style frame. There is no build step and no dependencies.

**Play it at https://singh-ps.github.io/space-attack-redux/**

## Controls

| Key | Action |
| --- | --- |
| ← → or A D | Move |
| Space or Z | Fire. Hold it to keep firing (auto fire); the fire cooldown sets the rate. |
| Enter | Start, or play again |
| P or Esc | Pause. The game also pauses when the window loses focus. |
| M | Mute all sound |
| N | Toggle the background music |

On phones and tablets:

| Touch | Action |
| --- | --- |
| Drag anywhere | Move. The ship follows how far your finger moves, not where it is, so your finger never covers the ship. |
| Keep a finger down | Fire (auto fire) |
| Tap | Start, play again, or resume after a pause |
| Buttons, top right | Sound on/off and pause |

On a phone held upright, the game sits at the top of the screen and the space below it is room for your thumb.

## How it plays

- The invaders hold a formation at the top of the screen. From there they peel off and dive at a constant speed, steering toward you. A diver that leaves the bottom of the screen comes back in from the top and rejoins the formation, as in the arcade original.
- Enemies shoot straight down, and only while they are diving.
- Every hit is a kill, for you and for them. You have 3 ships.
- Clear all 5 levels to win. Each level is faster than the one before, and the formation grows from 5 rows to 7.
- Clearing a level makes the jump to the next sector at warp speed.

| Enemy | Tier | Targeting | In formation | In flight |
| --- | --- | --- | --- | --- |
| Omega | 3 (only 2 per wave) | Leads you: aims where your current movement will take you | 100 | 300 |
| Alpha | 2 | Weaves, alternating its aim left and right of you | 50 | 100 |
| Delta | 1 (most of the wave) | Heads straight for where you are now | 30 | 60 |

Higher tiers fire more often and make their turn decisions sooner.

### Power-ups

Shot-down enemies sometimes drop a power-up capsule (Omegas most often). Fly into it to collect it. Each power lasts 10 seconds (the shield 12), and different powers stack. The HUD shows your active powers with a timer bar at the bottom right. Losing a ship clears them.

| Power | Effect |
| --- | --- |
| Scatter shot | Two extra shots angled out to the sides |
| Multi shot | Each volley is followed by a second one |
| Double shot | Two parallel shots instead of one |
| Shield | Soaks up one hit. Crashing into a diver with it destroys the diver and scores the kill. |
| Attack speed | Halves the fire cooldown |

## Tuning

All gameplay numbers are in [`config.json`](config.json). Edit the file and reload the page. Times are in seconds, speeds in pixels per second, and the playfield is 480×640.

| Section | What it controls |
| --- | --- |
| `player` | Move speed, `autoFire` (hold to fire, or one shot per press), fire cooldown, bullet speed, lives, respawn delay and post-respawn invulnerability, hitbox size |
| `touch` | `dragSensitivity` (ship travel per unit of finger travel) and `speedMul` (how much faster than `player.speed` the ship may chase your finger) |
| `enemyTypes.*` | Per type: tier, points (`scoreFormation`, `scoreFlight`), how often it is picked to dive (`diveWeight`), `fireCooldownSec` (the minimum time between shots), `turnCooldownSec`, `bulletSpeed`, power-up `dropChance` (0 to 1), and `targeting` (`direct`, `weave` with `offsetPx`, or `lead` with `maxLeadSec`) |
| `enemyFire` | When divers may shoot: horizontal range to you, minimum gap above you, delay before the first shot |
| `pickups` | Capsule fall speed, how many can be on screen, the minimum gap between drops, and per power: `weight` (how likely it is to drop, 0 to disable), `durationSec` (0 means until you lose a ship) and its effect settings: scatter `anglesDeg`, multi `extraVolleys`/`volleyGapSec`, double `spacingPx`, shield `hits`/`graceSec`, attack speed `cooldownMul` |
| `dive` | Shared dive physics: fall speed, lateral steering speed, gain and acceleration, the peel-off loop, return speed, and `onExitBottom` (`return` to rejoin the formation, or `remove`) |
| `formation` | Grid size and spacing, sway, warp-in time, and the row templates (type and columns), listed top to bottom |
| `levels` | One entry per level: `rows` (taken from the top of the formation template), `speedMul`, `diveIntervalSec`, `maxDivers`, `maxEnemyBullets` |
| `timing` | How long the level-start and level-clear banners stay up, and the lockout before you can restart |
| `warp` | The level-clear warp jump: top star speed multiplier, delay before it engages, and ramp up and down times |
| `audio` | Master, sound-effect and music volume, and the music tempo plus its increase per level |

Mistakes in the config, such as an unknown targeting mode, show up as an error message on the page.

## Run locally

The game loads ES modules and `config.json`, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Add `?debug` to the URL for an FPS and entity overlay plus test keys: G toggles invulnerability, K clears the wave, U drops a power-up (each in turn), and 1–5 jump to a level.

## Code layout

Entities are data-oriented rather than object-oriented. Enemies, bullets and effects live in structure-of-arrays pools (one typed array per field). Systems are plain functions that run over those arrays. All enemy types share the same systems and differ only in the per-type tables compiled from `config.json`.

```
config.json          tuning data
js/main.js           boot, canvas scaling, main loop
js/game.js           game flow (title, levels, deaths, victory) and system order
js/core/             world data, SoA pools, config compiler, helpers
js/systems/          enemies (formation, dives, steering), targeting, combat, pickups (power-ups), fx
js/gfx/              pixel art and colours, sprite rasterizer, glow textures, synthwave backdrop, renderer
js/audio.js          synthesized sound effects and music (Web Audio API, no audio files)
js/input.js          keyboard mapping
js/touch.js          touch steering, tap actions and on-screen buttons
```

The HUD and body text use [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), modelled on 1980s Namco arcade lettering. Titles use [Orbitron](https://fonts.google.com/specimen/Orbitron) in chrome, and the "REDUX" sign uses [Monoton](https://fonts.google.com/specimen/Monoton). If your system asks for reduced motion, the game tones down screen shake and skips the glitch effect.
