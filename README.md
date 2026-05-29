# Jet Pilot Simulator

**Fly Earth** — global first-person flight in the browser (free stack, no Cesium Ion required for v1).

## Quick start (Earth — primary)

```bash
cd /Users/haimengzhou/apps/jet-pilot-simulator
npm install
npm run dev
```

Open **http://localhost:5173/earth.html**

### Controls

| Key | Action |
|-----|--------|
| **Enter** / **Fly** | Start flying |
| **W** / **S** | Throttle |
| **↑** / **↓** | Pitch |
| **←** / **→** | Turn |
| **G** | Gear |
| **Space** | Pause |

Use the panel to jump between **SFO, LAX, JFK, LHR, NRT**. Toggle **Chase** vs **Cockpit** camera.

### v1 ground model (no Ion)

- **CesiumJS** globe + free map tiles (ellipsoid surface)
- **Airport elevation pads** — accurate takeoff/landing near runways
- **Light procedural bumps** away from airports (game feel, not real DEM)
- HUD/panel show ground source: `AIRPORT-PAD`, `PROCEDURAL`, or `ELLIPSOID`

Paid **Cesium Ion** is optional later — not required for v1. See `.env.example` only if you choose to add it.

### Agent test (Earth)

Start the dev server, then:

```bash
cd ai-agent
node agent.js --earth --heuristic --headless --turns 90 --tick 700
```

---

## Arcade training sortie (legacy)

```bash
python3 -m http.server 8766
# http://localhost:8766/jet_pilot_simulator.html
```

```bash
cd ai-agent
node agent.js --heuristic --headless --turns 90 --tick 900
```

---

## Project layout

| Path | Purpose |
|------|---------|
| `earth.html` | **Primary** — Cesium globe + FP cockpit overlay |
| `src/earth/` | Globe, terrain model, physics, HUD, cockpit |
| `jet_pilot_simulator.html` | Legacy arcade sortie (Three.js strip) |
| `ai-agent/` | Playwright agent (`--earth` or arcade) |

---

## Roadmap

| Phase | Status |
|-------|--------|
| Earth MVP — global fly, airports, cockpit overlay | Done |
| Agent `--earth` heuristic | Done |
| Waypoint missions (lat/lon legs) | Next |
| glTF jet model | Later |
