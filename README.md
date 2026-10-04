# Space Attack Redux

A retro arcade space shooter built with plain HTML5 canvas, JavaScript and CSS. There is no build step and no dependencies.

**Play it at https://singh-ps.github.io/space-attack-redux/**

## Controls

| Key | Action |
| --- | --- |
| ← → or A D | Move |
| Space or Z | Fire. Each press fires one shot, and presses during the cooldown are ignored. |
| Enter | Start, or play again |
| P or Esc | Pause. The game also pauses when the window loses focus. |
| M | Mute all sound |
| N | Toggle the background music |

## How it plays

- The invaders hold a formation at the top of the screen. From there they peel off and dive at a constant speed, steering toward you. A diver that leaves the bottom of the screen comes back in from the top and rejoins the formation, as in the arcade original.
- Enemies shoot straight down, and only while they are diving.
- Every hit is a kill, for you and for them. You have 3 ships.
- Clear all 5 levels to win. Each level is faster than the one before, and the formation grows from 5 rows to 7.

| Enemy | Tier | Targeting | In formation | In flight |
| --- | --- | --- | --- | --- |
| Omega | 3 (only 2 per wave) | Leads you: aims where your current movement will take you | 100 | 300 |
| Alpha | 2 | Weaves, alternating its aim left and right of you | 50 | 100 |
| Delta | 1 (most of the wave) | Heads straight for where you are now | 30 | 60 |

Higher tiers fire more often and make their turn decisions sooner.

## Tuning

All gameplay numbers are in [`config.json`](config.json). Edit the file and reload the page. Times are in seconds, speeds in pixels per second, and the playfield is 480×640.

| Section | What it controls |
| --- | --- |
| `player` | Move speed, fire cooldown, bullet speed, lives, respawn delay and post-respawn invulnerability, hitbox size |
| `enemyTypes.*` | Per type: tier, points (`scoreFormation`, `scoreFlight`), how often it is picked to dive (`diveWeight`), `fireCooldownSec` (the minimum time between shots), `turnCooldownSec`, `bulletSpeed`, and `targeting` (`direct`, `weave` with `offsetPx`, or `lead` with `maxLeadSec`) |
| `enemyFire` | When divers may shoot: horizontal range to you, minimum gap above you, delay before the first shot |
| `dive` | Shared dive physics: fall speed, lateral steering speed, gain and acceleration, the peel-off loop, return speed, and `onExitBottom` (`return` to rejoin the formation, or `remove`) |
| `formation` | Grid size and spacing, sway, warp-in time, and the row templates (type and columns), listed top to bottom |
| `levels` | One entry per level: `rows` (taken from the top of the formation template), `speedMul`, `diveIntervalSec`, `maxDivers`, `maxEnemyBullets` |
| `timing` | How long the level-start and level-clear banners stay up, and the lockout before you can restart |
| `audio` | Master, sound-effect and music volume, and the music tempo plus its increase per level |

Mistakes in the config, such as an unknown targeting mode, show up as an error message on the page.

## Run locally

The game loads ES modules and `config.json`, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Add `?debug` to the URL for an FPS and entity overlay plus test keys: G toggles invulnerability, K clears the wave, and 1–5 jump to a level.

## Code layout

Entities are data-oriented rather than object-oriented. Enemies, bullets and effects live in structure-of-arrays pools (one typed array per field). Systems are plain functions that run over those arrays. All enemy types share the same systems and differ only in the per-type tables compiled from `config.json`.

```
config.json          tuning data
js/main.js           boot, canvas scaling, main loop
js/game.js           game flow (title, levels, deaths, victory) and system order
js/core/             world data, SoA pools, config compiler, helpers
js/systems/          enemies (formation, dives, steering), targeting, combat, fx
js/gfx/              pixel art data, sprite rasterizer, renderer
js/audio.js          synthesized sound effects and music (Web Audio API, no audio files)
js/input.js          keyboard mapping
```

The font is [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), which is modelled on 1980s Namco arcade lettering.
