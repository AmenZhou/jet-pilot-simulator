# Jet Pilot Simulator

A jet flight game — originally designed by a 9-year-old, now extended with a **global Earth mode** (CesiumJS) and a legacy **arcade training sortie**. Fly from real airports, run missions, meet AI traffic, and drive the sim with keyboard or an LLM agent.

**Live dev URL:** `http://localhost:5173/earth.html` after `npm run dev`

---

## Features

| Feature | Description |
|---------|-------------|
| **Fly Earth** | First-person / chase camera on a 3D globe with free map tiles |
| **Airports** | SFO, LAX, JFK, LHR, NRT, SYD — spawn on runway, real headings |
| **Missions** | Origin → destination: takeoff, cruise, approach, landing |
| **Control modes** | **Manual** or **Assisted** (autopilot takeoff, cruise hold, approach help) |
| **V-speed takeoff** | Industry-style roll → rotate at **VR** (~146 kt) → **V2** climb → gear up |
| **Cruise hold** | Press **L** to lock altitude (assisted cruise enables hold automatically) |
| **Navigation** | Top-right **radar** (heading-up), bottom-left **globe** route view |
| **AI traffic** | Up to 12 aircraft with TCAS-style **↑ / ● / ↓** altitude cues |
| **Speed** | Up to **Mach 100** (arcade physics) |
| **AI agent** | Playwright + OpenAI/Claude/heuristic for automated test flights |

---

## Quick start

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**

### Install and run

```bash
git clone git@github.com:AmenZhou/jet-pilot-simulator.git
cd jet-pilot-simulator
npm install
npm run dev
```

Open **[http://localhost:5173/earth.html](http://localhost:5173/earth.html)**

### Optional environment

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `VITE_CESIUM_ION_ACCESS_TOKEN` | Optional Cesium Ion 3D terrain (paid usage possible) |
| `VITE_SATELLITE_IMAGERY` | Set to `true` for Esri satellite tiles (default on without Ion) |
| `OPENAI_API_KEY` | For `ai-agent` with `--model openai` |
| `ANTHROPIC_API_KEY` | For `ai-agent` with `--model claude` |

v1 works **without Ion** — ellipsoid + free tiles + airport elevation pads.

---

## Controls

| Input | Action |
|-------|--------|
| **Enter** / **Fly** | Begin takeoff roll from runway (throttle starts at 0) |
| **W** / **S** | Throttle up / down |
| **↑** / **↓** | Pitch |
| **←** / **→** | Yaw / turn |
| **G** | Toggle landing gear |
| **L** | Toggle **cruise altitude hold** |
| **Space** | Pause |
| **Scroll** or **`[`** / **`]`** | Zoom globe (chase camera) |

Use **Chase** camera to see traffic and the destination pin on the globe.

### Takeoff (manual)

1. **Start mission** or pick an airport, then **Fly**
2. **W** — full thrust on the runway
3. At **VR ~146 kt** (cyan mark on HUD speed tape), **↑** rotate (~7° nose up)
4. After liftoff, **G** — gear up
5. Climb to cruise; press **L** for altitude hold

**Assisted** mode runs the same sequence automatically.

### Mission example (URL)

```
http://localhost:5173/earth.html?from=SFO&to=LAX
```

Pick **Assisted** or **Manual** in the sidebar, then **Fly**.

---

## AI agent

Headless or headed browser tests via Playwright. See [`ai-agent/README.md`](ai-agent/README.md).

```bash
# Dev server must be running on :5173
cd ai-agent
npm install   # if not already (playwright, openai, etc.)

# Heuristic (no API key)
node agent.js --earth --heuristic --headless --turns 80 --tick 2000

# LLM mission SFO → LAX
node agent.js --earth --model openai --headed --from SFO --to LAX --control-mode assisted --turns 100 --tick 2500
```

Logs: `ai-agent/logs/run-*.jsonl`

---

## Project layout

```
jet-pilot-simulator/
├── earth.html              # Primary entry — Fly Earth
├── src/earth/
│   ├── main.js             # Game loop, UI wiring
│   ├── cesium-view.js      # Globe, camera, entities
│   ├── physics.js          # Flight model
│   ├── takeoff.js          # V1 / VR / V2 takeoff phases
│   ├── mission.js          # Mission phases & assisted flight
│   ├── cruise-hold.js      # Altitude hold
│   ├── traffic.js          # AI traffic + flight levels
│   ├── radar-map.js        # Top-right heading-up radar
│   ├── nav-map.js          # Bottom-left route globe
│   ├── hud.js              # Cockpit HUD + TCAS
│   └── ...
├── ai-agent/               # Playwright LLM/heuristic agent
├── jet_pilot_simulator.html  # Legacy arcade sortie
└── scripts/                # Optional env helpers
```

---

## Build

```bash
npm run build
npm run preview
```

---

## Ground & terrain model (v1)

Without Cesium Ion:

- **Ellipsoid** surface + **CARTO / Esri** imagery
- **Airport elevation pads** for accurate runway height near listed airports
- Light **procedural** bumps away from airports

With Ion token in `.env`, world terrain sampling can improve ground contact.

---

## Arcade mode (legacy)

Local static server:

```bash
python3 -m http.server 8766
# http://localhost:8766/jet_pilot_simulator.html
```

```bash
cd ai-agent
node agent.js --heuristic --headless --turns 90 --tick 900
```

---

## Roadmap

| Item | Status |
|------|--------|
| Earth MVP — globe, airports, cockpit | Done |
| Missions, takeoff, landing | Done |
| Cruise hold, traffic TCAS | Done |
| Earth LLM agent | Done |
| glTF aircraft model | Planned |
| Waypoint editor / more airports | Planned |

---

## License

Private / personal project unless otherwise noted. Check repository settings on GitHub.

---

## References

Takeoff modeling informed by standard **V1 / VR / V2** procedures and sim guides (MSFS, FlyByWire, FlightGear V-speed docs).
