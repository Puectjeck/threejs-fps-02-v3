# threejs-fps-02-v3

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Puectjeck/threejs-fps-02-v3/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Puectjeck/threejs-fps-02-v3/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**NEON BREACH: PROTOCOL** — a round-based tactical first-person shooter on three.js, in the style Counter-Strike made famous, on an original map: Foundry Nine. Two squads of five — VANGUARD attacks, SENTINEL defends. VANGUARD carries a charge to one of two sites (the Coolant Yard or the Reactor Hall), plants it and holds; SENTINEL defuses or runs the clock down. Money is earned per round and spent in the buy phase on rifles, an SMG, a bolt-action longshot, kevlar and frag, smoke and flash grenades. First to 9 rounds wins; sides swap at the half.

The bots play the same game the player does: waypoint routes over three lanes, site holds, rotations on gunfire they hear, a vision cone with smoke and line-of-sight checks, and burst fire that stops to settle — because the gunplay model punishes firing on the move. Hits are rays against body and head boxes, heads pay four times, armour and distance falloff apply, crouching and standing still tighten the spread.

Everything is procedural — the map, the models and every sound are generated in code. The only dependency is three.js 0.187.0, vendored under `game/vendor/three/`, so the game runs fully offline from static files.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # assembles the entry into out/
node serve.ts                                          # or any static server over game/
```

Then open `http://localhost:8080` in a desktop browser with WebGL 2 and click to play.

## Controls

| Input | Action |
| --- | --- |
| W A S D | move |
| Mouse | look · left click fire · right click scope (LONGSHOT-8) |
| Shift | sprint · C / Ctrl crouch · R reload |
| 1 / 2 | primary / sidearm · 4 frag · 5 smoke · 6 flash |
| E (hold) | plant the charge / defuse it |
| B | buy menu during the buy phase (number keys buy) |

## Layout

- `main.ts` — hands the game in: copies `game/` and `screenshots/` out and writes the dossier.
- `game/src/` — one module per job: `config` (weapons, economy, rules), `state` (the single match store), `map` (Foundry Nine as data plus its geometry), `nav` (waypoint graph, BFS routes), `collide` (movement and bullet rays), `weapons` (the gunplay model and grenades), `bomb` (the charge), `bots` (perception, plans, combat), `player` (input and movement), `round` (the fixed-step match director), `effects` (pooled tracers, sparks, smoke), `render` (scene, actor models, viewmodel), `hud` (overlay and minimap), `audio` (synthesised WebAudio sounds), `main` (boot and the fixed-step loop).
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

Referral: https://make.fun/?ref=g4gqv254&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02
