[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/1556301539-dot/flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/1556301539-dot/flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Ember Watch

A wildfire-spotter flight game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). Fly a little fire-spotter plane over the Kestrel Valley: thread the lookout course against the clock, drop water between two dirt airstrips, or just patrol until the tank runs dry. Pure static files — no build step, no network, no libraries. The terrain, the aircraft, the instruments and the sounds are all hand-written.

## Play

```sh
node serve.ts        # opens http://localhost:8080
```

Or open `game/index.html` straight from disk — it plays from a file too.

| Key | Does |
| --- | --- |
| ↑ / ↓ (W / S) | Pitch up / down |
| ← / → (A / D) | Roll and turn |
| Shift / Ctrl (R / F) | Throttle up / down |
| C | Chase view / cockpit view |
| P | Pause |
| R | Fly again |
| M | Sound on / off |
| 1 / 2 / 3 | Patrol Run / Water Drop / Free Patrol |

Throttle discipline matters: climb bleeds speed, slow flight stalls, fuel runs out, and a landing is judged on speed, sink rate and alignment. A hard touchdown on the grass is a bush landing — allowed, but it costs the airframe.

## How it is built

- `game/src/terrain.js` — the valley: a seeded heightfield with hills, a northern ridge, a river valley, a lake, patchwork fields and two flattened airstrips.
- `game/src/projection.js` — the 3D camera (yaw / pitch / roll to screen).
- `game/src/plane.js` — the aircraft, built from flat-shaded triangles.
- `game/src/world.js` — the ring course, runway paint, airfield buildings, pines, clouds, windsock.
- `game/src/physics.js` — the flight model: thrust, drag, stalls, turns, landings, crashes.
- `game/src/missions.js` — Patrol Run, Water Drop and Free Patrol, and the score.
- `game/src/render.js` — the software 3D renderer, the HUD instruments and the screens.
- `game/src/input.js`, `game/src/audio.js`, `game/src/main.js` — controls, synthesised sound, the loop.
- `main.ts` — the hand-in program (Node 22, standard library only): copies `game/` and `screenshots/` and writes `dossier.json`.

Screenshots are staged deterministically: `?shot=cover`, `?shot=cockpit`, `?shot=ring`, `?shot=landing` (see `shots.json`).

## License

MIT — see [LICENSE](LICENSE).
