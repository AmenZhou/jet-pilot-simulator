---
name: jet-pilot-agent-analyze
description: Run Fly Earth (jet-pilot-simulator) Playwright agent, analyze JSONL logs, fix game and agent bugs, improve UX. Use from jet-pilot-simulator root for earth.html missions, takeoff, cruise, traffic. Alias for web-game-agent-analyze profile jet-pilot-earth.
version: 1.0.0
---

# Jet Pilot Simulator — Agent Run · Log Review · Fix

**Project root:** `jet-pilot-simulator/` (must contain `earth.html`, `src/earth/`, `ai-agent/agent.js`).

Canonical workflow: **`~/.claude/skills/web-game-agent-analyze/SKILL.md`** — this file adds **Earth-specific** log signatures and fix targets from real agent runs.

---

## Quick run

```bash
# Dev server (required)
npm run dev   # :5173

# Smoke (fast, no API)
node ai-agent/agent.js --earth --heuristic --headless --from SFO --to LAX \
  --control-mode assisted --turns 25 --tick 2000

# Full LLM
node ai-agent/agent.js --earth --model openai --headless --from SFO --to LAX \
  --control-mode assisted --turns 40 --tick 2000

# Headed demo
node ai-agent/agent.js --earth --headed --heuristic --from SFO --to LAX \
  --control-mode assisted --turns 20 --tick 2000
```

Log: `ai-agent/logs/run-<timestamp>.jsonl`

---

## Post-run log review (mandatory)

After every agent session, scan the latest JSONL for these **known failure signatures**:

| Log signal | Meaning | Fix target |
|------------|---------|------------|
| `takeoff_phase":"roll"` while `mission.phase":"cruise"` | Cruise entered before V-speed sequence finished | `src/earth/mission.js` cruise gate; `takeoff.js` COMPLETE |
| `groundspeed_kt` stuck 0 for >3 ticks after turn 1 | Sim not stepping (`paused`, `agentDrive` + wrong `__earthStep`) | `main.js` `stepSimulation`; `agent.js` no pause-at-start |
| `groundAlt` >> 50 at `nearestAirport":"SFO"` | Ion terrain spike on runway | `src/earth/terrain.js` airport pad clamp |
| `alt` jumps 8→300+ in one tick | Double physics or bad terrain AGL | `physics.js` `moveAlongHeading`; `terrain.js` |
| `set_heading` with `value`: 138 | LLM used degrees not radians | `agent.js` `clampAction`; prompt `bearingRad` |
| `[assisted] … skipped` during `mission_phase":"cruise"` | `isAssistedTakeoffActive` too broad | `agent.js` — only `mission.phase === takeoff` |
| `gearDown":true` + `agl` > 150 for >5 ticks in cruise | Gear never retracted | `takeoff.js` / `mission.js` cruise entry |
| `speed_mode` contains `TAKEOFF` in cruise | Takeoff never `complete` | `takeoff.js` + mission transition |
| `page_error` 404 | Often `favicon.ico` or missing `/models/cesium-air.glb` | `public/models/`; ignore benign favicon |
| `mission.active:false` after turn 1 | HMR/module error wiped state | `syncTrafficEntities` try/catch; agent re-arms mission turns 1–3 |
| `Cannot convert undefined or null to object` at `syncTrafficEntities` | `Object.values(group.parts)` when mode is `model` | `cesium-view.js` — use `group.entity` |
| `wait` > 40% of actions | Stuck heuristic or over-guarded assisted | agent guards / mission progress |

### Healthy assisted SFO→LAX smoke (25 turns, 2s tick)

- Turn 1: `takeoff_phase: roll`, speed 0→30+ kt
- Turns 2–6: `roll` → `rotate` → `liftoff` → `initial_climb`
- Turn 6–10: `mission.phase: cruise`, `takeoff_phase: complete`, gear up, AGL 150–400 m
- No crash; `groundAlt` near 4 at SFO

---

## Fix loop

1. Read full JSONL → write short analysis (template in web-game-agent-analyze).
2. Fix every `[BUG]` in game source first, then `[AGENT]`.
3. `node --check ai-agent/agent.js` and edited `src/earth/*.js`.
4. Re-run smoke until healthy signatures above pass.
5. Append lessons to `ai-console/skill-improvement-backlog.md` if orchestration-wide.
6. Commit only when user asks.

---

## Game files (usual touch points)

| Area | Files |
|------|--------|
| Takeoff V-speeds | `src/earth/takeoff.js`, `speed-mode.js` |
| Mission phases | `src/earth/mission.js` |
| Terrain / AGL | `src/earth/terrain.js`, `physics.js` |
| Agent stepping | `src/earth/main.js` (`agentDrive`, `__earthStep`) |
| Traffic 3D | `src/earth/traffic-aircraft.js`, `cesium-view.js` |
| Agent | `ai-agent/agent.js` |

---

## UX self-improvement checklist

When logs look "technically flying" but feel wrong:

- [ ] Takeoff roll visible ≥8 s at 1× before VR (thrust in `speed-mode.js`)
- [ ] HUD / status shows roll → rotate → liftoff hints
- [ ] Assisted does not fight LLM throttle/pitch on takeoff
- [ ] Cruise enables normal speed cap; hyper only after takeoff + 120 m AGL
- [ ] Traffic uses 3D models (`/models/cesium-air.glb`), not dots
- [ ] Chase camera shows player + traffic
- [ ] Assisted cruise turns toward `navigation.bearingRad`

---

## Related

- `~/.claude/skills/web-game-agent-analyze/SKILL.md` — generic phases
- `~/.claude/skills/hotel-agent-analyze/SKILL.md` — alias only
- `ai-console/orchestrate-history/*jet-pilot*` — prior orchestration context
