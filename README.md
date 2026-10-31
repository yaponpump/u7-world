# VUZZ World

A small browser open world for the **VUZZ ($VUZZ)** project. You control **VUZZ**, a tiny mecha and the last guardian of a city that went dark in *The Blackout*. Every new signal (holder) turns on one city light.

Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev). Status: **prototype** with realistic rendering (physical sky, reflective water, grass, PBR). The robot is built directly in code (worn metal paint, pistons, joints).

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Controls

| Input | Action |
|---|---|
| WASD / up and down arrows / joystick (mobile) | Move |
| Space (hold to keep jumping) | Jump |
| Shift | Run |
| B | Backflip |
| 1 to 5 or the Faces button | Choose a face. It stays until you change it |
| T | Skip 3 hours |
| Right-drag or left-drag / drag on screen | Look around |
| Scroll / I and O / pinch | Zoom |
| Left and right arrows | Rotate camera |
| E | Sit (near a bench) |
| F | Drink (near the fountain or cafe) |
| R | Throw a rock (near the lake or pier) |
| Q | Photo |
| M | Sound on/off |

Leave VUZZ idle for about 15 seconds and it yawns. After 30 seconds it falls asleep.

## Sound

All sound is synthesized in the browser with Web Audio (`src/audio.js`), with no audio files. Robot: servo steps (different on grass, wood and stone), motor when sitting or standing, gulp, yawn, sleeping hum, curious beeps, jump and land, a chime for signals and a tone when a city light comes on. World: wind, leaves, water near the lake, river and fountain, birds by day, crickets and frogs at night.

## Features

- **Wallet:** connect Phantom, Solflare, Backpack, MetaMask, Rabby or Coinbase. There is no signing; it only reads the address and token balance.
- **Holder skins:** the Skin button in the HUD. Two skins are free; the rest unlock with a wallet or a balance tier.
- **Market weather:** price moves become weather: `storm`, `rain`, `cloudy`, `clear`, `golden`. Test it with `?mood=storm`.
- **City NPCs:** maintenance drones patrol the streets, and two dormant units against the walls each light one eye when the city reaches 5/5 lights.

## Token and market setup

Everything is in `src/config.js`:

- `token`: set `chain` (`solana` or `evm`), `address` and `decimals`. EVM also needs `evmChainId`; Solana can set `rpc`. While empty, every connected wallet counts as a signal.
- `market`: set `coingeckoId` or `dexscreener`. While empty, the weather runs in demo mode.
- `tiers`: the minimum balance for each skin tier.

Skins and tiers are checked in the browser, so use them for cosmetics only, not to protect anything valuable.

## Graphics quality

Automatic: `high` on desktop, `low` on mobile. Force it with `?q=low` or `?q=high`.

## Rendering

- Physical sky with a moving sun, stars at night, and a real sky photo that fades in by day
- Reflective water in the lake and fountain
- Instanced grass tufts and leaves that move with the wind
- Real CC0 assets from Poly Haven in `public/assets` (PBR textures, HDRI sky, four photo-scanned trees with two detail levels, city props). Without `manifest.json` the game falls back to procedural textures
- A full day takes 12 minutes and starts in the morning. Lock an hour with `?hour=11`
- Blacked-out city south of the park (`src/city.js`): windows and street lights follow the city lights count
- Post-processing: bloom, vignette, slight chromatic aberration, film grain, SMAA

## Structure

- `src/world.js`: terrain, hill, river, lake, park, pier, bridge, trees, paths, signposts, cafe, quest signals
- `src/city.js`: buildings, roads, street props, collisions
- `src/weather.js`: clouds, rain, wind, storm flashes, golden light
- `src/npcs.js`: drones and dormant units
- `src/robot.js`: VUZZ (procedural mesh and animation per state)
- `src/controls.js`: keyboard, mouse, touch joystick
- `src/minimap.js`: minimap, place labels, objective arrow
- `src/audio.js`: all sound (procedural Web Audio)
- `src/wallet.js`, `src/skins.js`, `src/market.js`, `src/config.js`: wallet, skins, market feed, settings
- `src/main.js`: game loop, in-game day and night clock, behavior, HUD, quest

## Deploy

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`. Set Settings → Pages → Source to GitHub Actions.

## Roadmap

1. Prototype (this)
2. Real VUZZ 3D model (GLB, rig, animation)
3. Living world: other players
4. Wallet-driven "sync" events
