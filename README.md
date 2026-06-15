# 🌍 Tiny Planet Colony

A grim 2D isometric **colony survival simulator**. You crash-land on a dead alien
world, terraform the barren rock to bring it back to life, and hold back a slow,
creeping corruption that wants to swallow everything you build.

Built with plain **HTML, CSS, and vanilla JavaScript** — no frameworks, no build
step. Just open it and play.

## ▶️ Play it

**Option A — just open the file**

```
open index.html      # macOS
```
(or double-click `index.html`)

**Option B — run a tiny local server**

```
python3 -m http.server 4720
# then visit http://localhost:4720
```

Works on desktop and mobile browsers.

## 🎮 How to play

1. **Land.** Your rocket touches down on the barren planet (tap to skip the intro).
2. **Power up.** Build **Solar Panels** ☀️ for energy and **Energy Storage** 🔋 to
   bank it for the night (solar output falls when the sun sets).
3. **Breathe.** Build **Oxygen Plants** 🫧 so colonists don't suffocate.
4. **Grow.** Add **Colony Homes** 🏠 for population and **Research Labs** 🔬 for science.
5. **Terraform** 🌱 the dead rock — life spreads on its own once seeded.
6. **Fight the planet.** Corruption nests bleed a blight that kills grass and chokes
   buildings. **Purge** 🧪 it before it spreads — destroy a nest to stop the source.

### Win / lose

- **Win:** reclaim **55%** of the planet (turn it green).
- **Lose:** the colony suffocates, or the corruption overruns **85%** of the world.

### Controls

- **Click / tap** a tile to build, terraform, purge, or demolish (pick a tool from the dock).
- **Click / tap** a building to inspect its live stats.
- **Drag** to pan, **scroll / pinch** to zoom.
- **Space** pause · **Esc** cancel · **1–4** quick-pick buildings · **⏩** fast-forward.

Progress autosaves to `localStorage`.

## ✨ Features

- Curved, non-flat planet rendered as a floating rock chunk in space
- Full day/night cycle — solar power rises and falls with the sun
- Walking colonists, animated buildings, particle effects
- Slow environmental threat (spreading corruption) instead of discrete waves
- Terraforming, energy storage, research tech tree, random events
- Save / load, fast-forward, mobile + desktop support

## 🗂️ Project structure

```
index.html        # markup + script load order
css/styles.css    # grim sci-fi theme, responsive layout
js/
  config.js       # all tunable data: buildings, tech, balance, pacing
  iso.js          # isometric math + camera
  state.js        # game state + localStorage save/load
  economy.js      # resource simulation, day/night, win/lose
  world.js        # terraforming + corruption (the living planet)
  events.js       # random events (storms, supply drops, breakthroughs)
  colonists.js    # wandering colonist agents
  render.js       # the isometric renderer (terrain, buildings, FX)
  input.js        # unified mouse + touch (pan / zoom / tap)
  ui.js           # HUD, build dock, research panel, info panel, toasts
  game.js         # main loop (background-safe sim timer + rAF draw)
```

## 🛠️ Tech notes

- The simulation runs on a `setInterval` timer (not `requestAnimationFrame`) so the
  colony keeps living even when the tab is backgrounded; rendering uses `rAF`.
- All art is currently drawn procedurally on `<canvas>`. Sprite-sheet support is
  planned (drop sheets into `assets/` and a loader will slice them in).

## 📄 License

MIT — do whatever you like.

---

🤖 Built with [Claude Code](https://claude.com/claude-code).
