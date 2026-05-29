/**
 * Jet Pilot Simulator — AI Agent
 *
 * Similar architecture to run-a-hotel AI agent:
 * - Playwright browser driver
 * - one LLM decision per tick
 * - execute in-page via page.evaluate()
 * - JSONL structured logs for balancing analysis
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_PATH = path.resolve(__dirname, "../jet_pilot_simulator.html");
const EARTH_PATH = path.resolve(__dirname, "../earth.html");

const args = process.argv.slice(2);
const HEADLESS = args.includes("--headless");
const EARTH = args.includes("--earth");
const TICK_MS = parseInt(args[args.indexOf("--tick") + 1], 10) || 2500;
const MAX_TURNS = parseInt(args[args.indexOf("--turns") + 1], 10) || 0;
const MODEL_ARG = args[args.indexOf("--model") + 1] || "claude";
const CONTINUE_STATE = args.includes("--continue-state");
const HEURISTIC = args.includes("--heuristic");
const DEFAULT_URL = EARTH
  ? process.env.GAME_URL || "http://localhost:5173/earth.html"
  : process.env.GAME_URL || "http://localhost:8766/jet_pilot_simulator.html";
const GAME_URL = args.includes("--file")
  ? `file://${EARTH ? EARTH_PATH : GAME_PATH}`
  : DEFAULT_URL;

class Logger {
  constructor() {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.logDir = path.resolve(__dirname, "logs");
    this.logPath = path.join(this.logDir, `run-${ts}.jsonl`);
    fs.mkdirSync(this.logDir, { recursive: true });
    this.stream = fs.createWriteStream(this.logPath, { flags: "a" });
    this.startTime = Date.now();
    console.log(`[logger] Writing to ${this.logPath}`);
  }

  write(obj) {
    this.stream.write(
      `${JSON.stringify({
        ...obj,
        ts: new Date().toISOString(),
        elapsed_s: Math.round((Date.now() - this.startTime) / 1000),
      })}\n`
    );
  }

  close() {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}

let askLLM;
if (HEURISTIC) {
  console.log("Provider: heuristic (no LLM)");
} else if (MODEL_ARG === "claude") {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  askLLM = async (systemPrompt, userContent) => {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 240,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    return msg.content[0].text.trim();
  };
  console.log("Provider: Anthropic — claude-haiku-4-5");
} else {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();
  const model = MODEL_ARG === "openai-mini" ? "gpt-4o-mini" : "gpt-4.1-nano";
  askLLM = async (systemPrompt, userContent) => {
    const res = await client.chat.completions.create({
      model,
      max_tokens: 240,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });
    return res.choices[0].message.content.trim();
  };
  console.log(`Provider: OpenAI — ${model}`);
}

const SYSTEM_PROMPT = `You are an expert flight-test AI for an arcade jet simulator.
Primary goal: maximize stable mission completions and ending cash.

Rules:
- Output exactly one JSON action object each turn.
- Prefer smooth control changes over abrupt oscillation.
- If mission is inactive, start mission.
- Keep gear down for low altitude approach/landing; otherwise gear up during cruise.
- Keep throttle and pitch in safe ranges to avoid crash.
- If crashed, start mission.
- Use set_speed 4 once systems are online and mission is active.

Output JSON:
{
  "action": "start_mission" | "set_throttle" | "set_pitch" | "toggle_gear" | "cycle_flaps" | "toggle_pause" | "set_speed" | "wait",
  "params": {
    "value": number,
    "speed": 1 | 2 | 4
  },
  "reasoning": "one short sentence"
}`;

async function waitForBootComplete(page) {
  if (EARTH) {
    await page.waitForFunction(
      () => window.__earthState && document.querySelector("#cesiumContainer canvas"),
      { timeout: 45000 }
    );
    return;
  }
  await page.waitForFunction(
    () => window.state && window.state.ui && window.state.ui.startup && !window.state.ui.startup.active,
    { timeout: 30000 }
  );
}

async function readState(page) {
  if (EARTH) {
    return page.evaluate(() => {
      const s = window.__earthState;
      if (!s) return null;
      const f = s.flight;
      const t = s.telemetry;
      return {
        mode: "earth",
        gameSpeed: s.gameSpeed,
        paused: s.paused,
        flying: s.flying,
        airportId: s.airportId,
        status: s.status,
        flight: {
          lat: Math.round(f.lat * 10000) / 10000,
          lon: Math.round(f.lon * 10000) / 10000,
          alt: Math.round(f.alt),
          heading: Math.round(f.heading * 1000) / 1000,
          pitch: Math.round(f.pitch * 1000) / 1000,
          throttle: Math.round(f.throttle * 1000) / 1000,
          speed: Math.round(f.speed),
          gearDown: f.gearDown,
          onGround: f.onGround,
          crashed: f.crashed,
          agl: Math.round(t.agl),
        },
        terrain: t.terrain,
        afford: {
          canStartFlight: !s.flying && !f.crashed,
          canControl: s.flying && !s.paused && !f.crashed,
          canRespawn: f.crashed,
        },
      };
    });
  }

  return page.evaluate(() => {
    const s = window.state;
    if (!s) return null;
    return {
      cash: Math.round(s.cash),
      reputation: Math.round(s.reputation),
      gameSpeed: s.gameSpeed,
      paused: s.paused,
      mission: {
        active: s.mission.active,
        phase: s.mission.phase,
        score: s.mission.score,
      },
      startupActive: Boolean(s.ui?.startup?.active),
      startupPhase: s.ui?.startup?.phase || "none",
      startupProgress: s.ui?.startup?.progress || 0,
      hudMinimal: Boolean(s.ui?.minimalHud),
      flight: {
        x: Math.round(s.flight.x),
        y: Math.round(s.flight.y),
        vx: Math.round(s.flight.vx * 100) / 100,
        vy: Math.round(s.flight.vy * 100) / 100,
        pitch: Math.round(s.flight.pitch * 1000) / 1000,
        throttle: Math.round(s.flight.throttle * 1000) / 1000,
        gearDown: s.flight.gearDown,
        flaps: s.flight.flaps,
        onGround: s.flight.onGround,
        crashed: s.flight.crashed,
        altitude: Math.max(0, Math.round((window.CONSTANTS?.GROUND_Y || 260) - s.flight.y)),
        speed: Math.max(0, Math.round(s.flight.vx)),
      },
      afford: {
        canStartMission: !s.ui?.startup?.active && !s.mission.active,
        canSetSpeed: !s.ui?.startup?.active,
        canControl: !s.ui?.startup?.active && !s.paused,
      },
    };
  });
}

function validActionsThisTurn(gs) {
  if (EARTH) {
    const out = ["wait"];
    if (gs.afford.canStartFlight) out.push("start_flight");
    if (gs.afford.canRespawn) out.push("respawn");
    if (gs.afford.canControl) {
      out.push("set_throttle", "set_pitch", "set_heading", "toggle_gear", "toggle_pause", "set_game_speed");
    }
    return out;
  }

  const out = ["wait"];
  if (gs.afford.canStartMission) out.push("start_mission");
  if (gs.afford.canSetSpeed) out.push("set_speed");
  if (gs.afford.canControl) {
    out.push("set_throttle", "set_pitch", "toggle_gear", "cycle_flaps", "toggle_pause");
  }
  return out;
}

function normalizeAction(action) {
  if (!action || typeof action.action !== "string") return { action: "wait", params: {}, reasoning: "invalid action shape" };
  if (!action.params || typeof action.params !== "object") action.params = {};
  return action;
}

function decideHeuristicEarth(gs) {
  if (gs.afford.canRespawn) {
    return { action: "respawn", params: {}, reasoning: "[earth] reset after crash" };
  }
  if (gs.afford.canStartFlight) {
    return { action: "start_flight", params: {}, reasoning: "[earth] begin free flight" };
  }
  if (gs.gameSpeed < 4) {
    return { action: "set_game_speed", params: { speed: 4 }, reasoning: "[earth] sim speed 4x" };
  }

  const { agl, onGround, crashed } = gs.flight;
  if (crashed) {
    return { action: "respawn", params: {}, reasoning: "[earth] recover" };
  }

  if (onGround && agl < 5) {
    return {
      action: "set_throttle",
      params: { value: 0.92 },
      reasoning: "[earth] takeoff roll",
    };
  }

  if (agl < 120) {
    return {
      action: "set_pitch",
      params: { value: 0.14 },
      reasoning: "[earth] climb out",
    };
  }

  if (agl > 400) {
    return {
      action: "set_pitch",
      params: { value: 0.02 },
      reasoning: "[earth] level cruise",
    };
  }

  if (!gs.flight.gearDown && agl < 80) {
    return { action: "toggle_gear", params: {}, reasoning: "[earth] gear down low pass" };
  }

  if (gs.flight.gearDown && agl > 150) {
    return { action: "toggle_gear", params: {}, reasoning: "[earth] gear up cruise" };
  }

  return {
    action: "set_throttle",
    params: { value: agl > 200 ? 0.62 : 0.78 },
    reasoning: "[earth] cruise power",
  };
}

function decideHeuristic(gs) {
  if (EARTH) return decideHeuristicEarth(gs);

  if (gs.startupActive) {
    return { action: "wait", params: {}, reasoning: "[heuristic] boot sequence" };
  }
  if (gs.flight.crashed || gs.mission.phase === "failed" || gs.mission.phase === "landed") {
    return { action: "start_mission", params: {}, reasoning: "[heuristic] restart after crash/land" };
  }
  if (gs.afford.canStartMission) {
    return { action: "start_mission", params: {}, reasoning: "[heuristic] begin sortie" };
  }
  if (gs.gameSpeed < 4) {
    return { action: "set_speed", params: { speed: 4 }, reasoning: "[heuristic] max sim speed" };
  }

  const { phase } = gs.mission;
  const { altitude, onGround, gearDown } = gs.flight;

  if (phase === "takeoff") {
    return {
      action: "set_throttle",
      params: { value: 0.95 },
      reasoning: "[heuristic] takeoff power",
    };
  }
  if (phase === "cruise") {
    if (gearDown) {
      return { action: "toggle_gear", params: {}, reasoning: "[heuristic] gear up in cruise" };
    }
    if (altitude > 70) {
      return {
        action: "set_pitch",
        params: { value: 0.02 },
        reasoning: "[heuristic] level off below max alt",
      };
    }
    return {
      action: "set_pitch",
      params: { value: 0.14 },
      reasoning: "[heuristic] climb to pattern altitude",
    };
  }
  if (phase === "approach") {
    if (!gearDown) {
      return { action: "toggle_gear", params: {}, reasoning: "[heuristic] gear down for landing" };
    }
    if (onGround) {
      return {
        action: "set_throttle",
        params: { value: 0.42 },
        reasoning: "[heuristic] roll out on runway",
      };
    }
    const targetPitch = altitude > 35 ? -0.04 : 0.02;
    return {
      action: "set_throttle",
      params: { value: 0.32 },
      reasoning: "[heuristic] approach power",
    };
  }

  return { action: "wait", params: {}, reasoning: "[heuristic] hold" };
}

function clampAction(action, gs) {
  const a = action.action;
  const p = action.params || {};
  const allow = validActionsThisTurn(gs);
  const allowedBare = allow.map((v) => v.split(" ")[0]);

  if (!allowedBare.includes(a)) {
    return { action: "wait", params: {}, reasoning: `[clamped] ${a} not allowed now` };
  }

  if (a === "set_throttle") {
    const v = Number(p.value);
    if (!Number.isFinite(v)) return { action: "wait", params: {}, reasoning: "[clamped] throttle missing" };
    return { action: a, params: { value: Math.max(0, Math.min(1, v)) }, reasoning: action.reasoning || "" };
  }
  if (a === "set_pitch") {
    const v = Number(p.value);
    if (!Number.isFinite(v)) return { action: "wait", params: {}, reasoning: "[clamped] pitch missing" };
    return { action: a, params: { value: Math.max(-0.8, Math.min(0.8, v)) }, reasoning: action.reasoning || "" };
  }
  if (a === "set_speed" || a === "set_game_speed") {
    const speed = [1, 2, 4].includes(p.speed) ? p.speed : 4;
    return { action: a, params: { speed }, reasoning: action.reasoning || "" };
  }
  if (a === "set_heading") {
    const v = Number(p.value);
    if (!Number.isFinite(v)) return { action: "wait", params: {}, reasoning: "[clamped] heading missing" };
    return { action: a, params: { value: v }, reasoning: action.reasoning || "" };
  }
  return { action: a, params: p, reasoning: action.reasoning || "" };
}

async function execute(page, action) {
  const { action: type, params = {} } = action;

  if (EARTH) {
    switch (type) {
      case "start_flight":
        await page.evaluate(() => window.__earthAgent.beginFlight());
        break;
      case "respawn":
        await page.evaluate((id) => {
          const s = window.__earthState;
          window.__earthAgent.spawnAtAirport(id || s.airportId);
        }, params.airportId);
        break;
      case "set_throttle":
        await page.evaluate(({ value }) => window.__earthAgent.setThrottle(value), params);
        break;
      case "set_pitch":
        await page.evaluate(({ value }) => window.__earthAgent.setPitch(value), params);
        break;
      case "set_heading":
        await page.evaluate(({ value }) => window.__earthAgent.setHeading(value), params);
        break;
      case "toggle_gear":
        await page.evaluate(() => window.__earthAgent.toggleGear());
        break;
      case "toggle_pause":
        await page.evaluate(() => window.__earthAgent.togglePause());
        break;
      case "set_game_speed":
        await page.evaluate(({ speed }) => window.__earthAgent.setGameSpeed(speed), params);
        break;
      case "wait":
      default:
        break;
    }
    return;
  }

  switch (type) {
    case "start_mission":
      await page.evaluate(() => window.startMission());
      break;
    case "set_throttle":
      await page.evaluate(({ value }) => {
        window.state.flight.throttle = Math.max(0, Math.min(1, value));
      }, params);
      break;
    case "set_pitch":
      await page.evaluate(({ value }) => {
        window.state.flight.pitch = Math.max(-0.8, Math.min(0.8, value));
      }, params);
      break;
    case "toggle_gear":
      await page.evaluate(() => {
        window.state.flight.gearDown = !window.state.flight.gearDown;
      });
      break;
    case "cycle_flaps":
      await page.evaluate(() => {
        window.state.flight.flaps = (window.state.flight.flaps + 1) % (window.CONSTANTS.MAX_FLAPS + 1);
      });
      break;
    case "toggle_pause":
      await page.evaluate(() => {
        window.state.paused = !window.state.paused;
      });
      break;
    case "set_speed":
      await page.evaluate(({ speed }) => {
        window.state.gameSpeed = speed;
      }, params);
      break;
    case "wait":
    default:
      break;
  }
}

async function tick(page, turn, logger, session) {
  const gs = await readState(page);
  if (!gs) return;

  const cashDelta =
    gs.cash === undefined
      ? 0
      : session.lastCash === null
        ? 0
        : gs.cash - session.lastCash;
  if (gs.cash !== undefined) {
    session.lastCash = gs.cash;
    session.peakCash = Math.max(session.peakCash, gs.cash);
  }

  logger.write({
    type: "tick",
    turn,
    cash: gs.cash,
    cash_delta: cashDelta,
    mission: gs.mission,
    flight: gs.flight,
    terrain: gs.terrain,
    flying: gs.flying,
    game_speed: gs.gameSpeed,
    startup_active: gs.startupActive,
  });

  if (EARTH && HEURISTIC && gs.afford.canControl) {
    await page.evaluate(({ agl }) => {
      const s = window.__earthState;
      const f = s.flight;
      if (agl < 100) {
        f.throttle = Math.max(f.throttle, 0.88);
        f.pitch = Math.max(f.pitch, 0.12);
      } else if (agl > 350) {
        f.throttle = Math.min(f.throttle, 0.65);
        f.pitch = Math.min(f.pitch, 0.05);
      }
      if (agl > 120 && f.gearDown) f.gearDown = false;
    }, { agl: gs.flight.agl });
  }

  if (!EARTH && HEURISTIC && gs.mission.active && gs.afford.canControl) {
    await page.evaluate(({ phase }) => {
      const f = window.state.flight;
      const c = window.CONSTANTS;
      if (phase === "takeoff") {
        f.throttle = Math.max(f.throttle, 0.92);
        f.pitch = Math.max(f.pitch, 0.22);
      } else if (phase === "cruise") {
        const alt = Math.max(0, c.GROUND_Y - f.y);
        f.throttle = alt > c.MAX_ALTITUDE ? 0.5 : 0.7;
        f.pitch = alt > 60 ? 0.04 : 0.14;
        if (f.gearDown) f.gearDown = false;
      } else if (phase === "approach" && !f.onGround) {
        const alt = Math.max(0, c.GROUND_Y - f.y);
        const tgt = window.getTargetAltitudeMeters(window.state, c);
        f.gearDown = true;
        f.throttle = 0.34;
        f.pitch = alt > tgt + 15 ? -0.05 : alt < tgt - 10 ? 0.04 : 0;
      }
    }, { phase: gs.mission.phase });
  }

  let action;
  if (HEURISTIC) {
    action = clampAction(normalizeAction(decideHeuristic(gs)), gs);
  } else {
    if (!gs.startupActive && gs.gameSpeed < 4) {
      const auto = { action: "set_speed", params: { speed: 4 }, reasoning: "[auto] run at 4x for testing throughput" };
      await execute(page, auto);
      logger.write({ type: "override", turn, ...auto });
    }

    const allowed = validActionsThisTurn(gs);
    const raw = await askLLM(
      SYSTEM_PROMPT,
      `Game state:\n${JSON.stringify(gs, null, 2)}\n\nValid actions this turn:\n${allowed.join(", ")}\n\nReturn one JSON action.`
    );
    const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      action = JSON.parse(clean);
    } catch {
      logger.write({ type: "error", turn, error: "bad_json", raw: clean });
      return;
    }
    action = clampAction(normalizeAction(action), gs);
  }

  if (EARTH && gs.flight.crashed && !session._wasCrashed) {
    session.earthCrashes = (session.earthCrashes || 0) + 1;
  }
  session._wasCrashed = EARTH ? gs.flight.crashed : false;

  if (!EARTH && gs.mission.phase === "failed" && session._lastPhase !== "failed") {
    session.crashes = (session.crashes || 0) + 1;
  }
  if (!EARTH && gs.mission.phase === "landed" && session._lastPhase !== "landed") {
    session.landings = (session.landings || 0) + 1;
  }
  if (!EARTH) session._lastPhase = gs.mission.phase;
  await execute(page, action);
  session.actionCounts[action.action] = (session.actionCounts[action.action] || 0) + 1;

  logger.write({
    type: "action",
    turn,
    action: action.action,
    params: action.params || {},
    reasoning: action.reasoning || "",
    cash_before: gs.cash,
    mission_phase: EARTH ? (gs.flying ? "flying" : "idle") : gs.mission?.phase,
  });

  if (EARTH) {
    console.log(
      `[T${String(turn).padStart(3)}] ${gs.airportId} | agl ${String(gs.flight.agl).padStart(4)} | alt ${String(gs.flight.alt).padStart(5)} | spd ${String(gs.flight.speed).padStart(3)} | ${action.action}`
    );
  } else {
    console.log(
      `[T${String(turn).padStart(3)}] $${String(gs.cash).padStart(6)} | ${gs.mission.phase.padEnd(8)} | alt ${String(gs.flight.altitude).padStart(3)} | spd ${String(gs.flight.speed).padStart(3)} | ${action.action}`
    );
  }
}

async function main() {
  const logger = new Logger();
  const session = {
    lastCash: null,
    peakCash: 0,
    actionCounts: {},
    crashes: 0,
    landings: 0,
  };

  logger.write({
    type: "session_start",
    model: HEURISTIC ? "heuristic" : MODEL_ARG,
    mode: EARTH ? "earth" : "arcade",
    headless: HEADLESS,
    tick_ms: TICK_MS,
    max_turns: MAX_TURNS,
    continue_state: CONTINUE_STATE,
    game_url: GAME_URL,
  });

  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  await page.goto(GAME_URL, {
    waitUntil: EARTH ? "domcontentloaded" : "networkidle",
    timeout: EARTH ? 90000 : 60000,
  });
  if (EARTH) {
    await page.waitForFunction(() => window.__earthState && window.__earthAgent, { timeout: 45000 });
  } else {
    await page.waitForFunction(() => window.state && window.startMission, { timeout: 30000 });
  }
  await waitForBootComplete(page);

  if (!CONTINUE_STATE && !EARTH) {
    await page.evaluate(() => {
      window.state.mission.active = false;
      window.state.mission.phase = "idle";
      window.state.flight.crashed = false;
      window.state.paused = false;
      window.state.gameSpeed = 1;
    });
  }

  if (!CONTINUE_STATE && EARTH) {
    await page.evaluate(() => {
      const s = window.__earthState;
      s.flying = false;
      s.paused = false;
      s.gameSpeed = 1;
      s.flight.crashed = false;
    });
  }

  let turn = 1;
  while (MAX_TURNS === 0 || turn <= MAX_TURNS) {
    try {
      await tick(page, turn, logger, session);
    } catch (err) {
      logger.write({ type: "error", turn, error: err.message });
    }
    if (EARTH) {
      await page.evaluate(
        ({ dt }) => {
          if (window.__earthStep) window.__earthStep(dt);
        },
        { dt: TICK_MS / 1000 }
      );
    }

    turn += 1;
    await page.waitForTimeout(TICK_MS);
  }

  const finalGs = await readState(page).catch(() => null);
  logger.write({
    type: "session_end",
    turns: turn - 1,
    final_cash: finalGs?.cash ?? session.lastCash,
    peak_cash: session.peakCash,
    final_mission: finalGs?.mission ?? null,
    final_earth: EARTH ? finalGs : null,
    action_counts: session.actionCounts,
    crashes: session.crashes,
    landings: session.landings,
    earth_crashes: session.earthCrashes,
  });
  await logger.close();
  await browser.close();

  console.log("\n── Session Summary ──────────────────────────────");
  console.log(`  Turns     : ${turn - 1}`);
  if (EARTH) {
    console.log(`  Crashes   : ${session.earthCrashes || 0}`);
    if (finalGs?.flight) {
      console.log(`  Final pos : ${finalGs.flight.lat}, ${finalGs.flight.lon} agl ${finalGs.flight.agl}m`);
    }
  } else {
    console.log(`  Final cash: $${finalGs?.cash ?? session.lastCash}`);
    console.log(`  Landings  : ${session.landings}`);
    console.log(`  Crashes   : ${session.crashes}`);
  }
  console.log(`  Log       : ${logger.logPath}`);
  console.log("─────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
