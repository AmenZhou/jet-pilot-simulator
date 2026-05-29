# Jet Pilot Simulator AI Agent

A Playwright + LLM test agent with the same design style as `run-a-hotel/ai-agent`.

## How it works

```
loop every N milliseconds:
  1. page.evaluate() read full game state
  2. LLM decides one JSON action
  3. page.evaluate() executes that action in live game
  4. append structured JSONL logs
```

## Setup

```bash
cd /Users/haimengzhou/apps/jet-pilot-simulator/ai-agent
npm install
npx playwright install chromium
```

## Run

**Earth mode** (start `npm run dev` in project root first):

```bash
node agent.js --earth --heuristic --headless --turns 90 --tick 700
```

**Arcade legacy** (`python3 -m http.server 8766` in project root):

```bash
node agent.js --heuristic --headless --turns 90 --tick 900
```

```bash
# Claude (default)
ANTHROPIC_API_KEY=sk-ant-... npm start

# OpenAI
OPENAI_API_KEY=sk-... node agent.js --model openai
```

## CLI options

- `--earth`: target `http://localhost:5173/earth.html` (Fly Earth MVP)
- `--heuristic`: rule-based pilot, no API key
- `--headless`: run browser headless
- `--tick 2500`: tick interval in ms
- `--turns 80`: max turns (0 = infinite)
- `--model claude|openai|openai-mini`
- `--continue-state`: do not reset mission context at startup

## Earth actions (`--earth`)

| Action | Effect |
|--------|--------|
| `start_flight` | Begin free flight |
| `respawn` | Reset at current airport after crash |
| `set_throttle` | Throttle 0.0–1.0 |
| `set_pitch` | Pitch −0.8–0.8 |
| `set_heading` | Heading radians |
| `set_game_speed` | Sim speed 1, 2, or 4 |
| `toggle_gear` | Gear toggle |
| `toggle_pause` | Pause/resume |

## Arcade actions

| Action | Effect |
|--------|--------|
| `start_mission` | Starts a new sortie |
| `set_throttle` | Sets throttle 0.0 - 1.0 |
| `set_pitch` | Sets pitch -0.8 - 0.8 |
| `toggle_gear` | Toggle landing gear |
| `cycle_flaps` | Cycle flap step |
| `toggle_pause` | Pause/resume simulation |
| `set_speed` | Set sim speed 1, 2, or 4 |
| `wait` | No action |

## Logs

Runs are written to:

- `ai-agent/logs/run-YYYY-MM-DDTHH-MM-SS.jsonl`

Each line includes timestamped tick metrics and action records for balancing analysis.
