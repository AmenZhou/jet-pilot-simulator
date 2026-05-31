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
const HEADED = args.includes("--headed");
const HEADLESS = args.includes("--headless") && !HEADED;
const EARTH = args.includes("--earth");
const TICK_MS = parseInt(args[args.indexOf("--tick") + 1], 10) || 2500;
const MAX_TURNS = parseInt(args[args.indexOf("--turns") + 1], 10) || 0;
const MODEL_ARG = args[args.indexOf("--model") + 1] || "claude";
const CONTINUE_STATE = args.includes("--continue-state");
const HEURISTIC = args.includes("--heuristic");
const FROM_AIRPORT = EARTH ? args[args.indexOf("--from") + 1] || "SFO" : null;
const TO_AIRPORT = EARTH && args.includes("--to") ? args[args.indexOf("--to") + 1] : null;
const CONTROL_MODE = EARTH && args.includes("--control-mode")
  ? args[args.indexOf("--control-mode") + 1]
  : "assisted";
const DEFAULT_URL = EARTH
  ? process.env.GAME_URL || "http://localhost:5173/earth.html"
  : process.env.GAME_URL || "http://localhost:8766/jet_pilot_simulator.html";
const GAME_URL = args.includes("--file")
  ? `file://${EARTH ? EARTH_PATH : GAME_PATH}`
  : DEFAULT_URL;

function loadEnvFile() {
  const candidates = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, ".env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

/** @type {Record<string, { id: string, name: string, lat: number, lon: number }>} */
const AIRPORTS = {
  SFO: { id: "SFO", name: "San Francisco (KSFO)", lat: 37.6189, lon: -122.375 },
  LAX: { id: "LAX", name: "Los Angeles (KLAX)", lat: 33.9425, lon: -118.408 },
  JFK: { id: "JFK", name: "New York (KJFK)", lat: 40.6413, lon: -73.7781 },
  LHR: { id: "LHR", name: "London (EGLL)", lat: 51.47, lon: -0.4543 },
  NRT: { id: "NRT", name: "Tokyo (RJAA)", lat: 35.772, lon: 140.3929 },
  SYD: { id: "SYD", name: "Sydney (YSSY)", lat: -33.9399, lon: 151.1753 },
  PVG: { id: "PVG", name: "Shanghai Pudong (ZSPD)", lat: 31.1434, lon: 121.8052 },
};

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

const ARCADE_SYSTEM_PROMPT = `You are an expert flight-test AI for an arcade jet simulator.
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

const EARTH_SYSTEM_PROMPT = `You are an expert Fly Earth autopilot on airport-to-airport missions.
Primary goal: take off from origin, cruise, land at destination (gear down, slow, within ~4 km).

Mission phases: preflight → takeoff → cruise → approach → landed (or failed).
- Assisted mode: takeoff roll → rotate at VR → liftoff → V2 climb is automatic. Use **wait** during takeoff (do NOT set_throttle/set_pitch).
- Speed is capped ~190 kt on takeoff; hyper (Mach 300) only after climb above ~120 m AGL via toggle_hyper when afford.canToggleHyper is true.
- When afford.canToggleHyper is true, prefer toggle_hyper once, then set_throttle 1.0 to verify speed_cap_mach reaches 300 (not 100).
- Manual takeoff: start_flight, then throttle 0.9+, pitch up at VR (~146 kt).
- cruise: 250–450m AGL; use set_heading with navigation.bearingRad (radians, ~0–6.28), NOT degrees.
- set_heading params.value must be radians. Do not pass 138 for a degree bearing.
- approach (within ~45 km): gear down, reduce throttle, descend; align with destination.
- landed: wait. If failed/crashed: start_mission to retry from origin.

Combat (guns & missiles vs AI traffic) — test during cruise when trafficContacts is non-empty:
- fire_gun: hitscan, ~2.5 km, aim with heading toward nearest traffic (set_heading to bearingRad first if hdg error > 15°).
- fire_missile: needs missileLockReady=true (traffic ahead <15 km); homing missile, 4s reload.
- Prefer chase view mentally: turn toward nearest traffic, then fire_gun repeatedly or fire_missile when locked.
- combat.kills tracks shoot-downs; status line confirms hits.

Control mode is manual or assisted (set in mission); you still output actions each turn.
Use set_game_speed 4 if gameSpeed < 4.
Do NOT spam set_throttle if within 0.05 of target.
Do NOT use toggle_hyper during combat tests — stay at normal cruise speed for aiming.

Output JSON:
{
  "action": "start_mission" | "start_flight" | "respawn" | "set_throttle" | "set_pitch" | "set_heading" | "set_gear" | "toggle_gear" | "toggle_hyper" | "toggle_pause" | "set_game_speed" | "set_control_mode" | "fire_gun" | "fire_missile" | "wait",
  "params": {
    "value": number,
    "speed": 1 | 2 | 4,
    "down": boolean,
    "airportId": "SFO",
    "originId": "SFO",
    "destId": "LAX",
    "mode": "manual" | "assisted"
  },
  "reasoning": "one short sentence"
}`;

function getSystemPrompt() {
  return EARTH ? EARTH_SYSTEM_PROMPT : ARCADE_SYSTEM_PROMPT;
}

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
        showChase: s.showChase,
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
        navigation: t.navigation,
        takeoffPhase: s.takeoff?.phase || "idle",
        takeoffVRKt: s.takeoff?.speeds?.VR_KT ?? null,
        hyperSpeed: Boolean(s.hyperSpeed),
        speedMode: window.__earthAgent?.speedModeLabel?.() || null,
        maxMachConstant: window.__earthAgent?.maxMachConstant?.() ?? null,
        speedCapMach: Math.round((window.__earthAgent?.speedCapMach?.() ?? 0) * 100) / 100,
        currentMach: Math.round((window.__earthAgent?.currentMach?.() ?? 0) * 100) / 100,
        groundspeedKt: Math.round(f.speed * 1.94384),
        trafficContacts: t.trafficContacts || [],
        nearestTraffic: (() => {
          const player = f;
          let best = null;
          let bestKm = Infinity;
          for (const tr of s.traffic || []) {
            const lat1 = (player.lat * Math.PI) / 180;
            const lat2 = (tr.lat * Math.PI) / 180;
            const dLon = ((tr.lon - player.lon) * Math.PI) / 180;
            const dLat = lat2 - lat1;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
            const distM = 2 * 6371000 * Math.asin(Math.sqrt(a));
            const km = distM / 1000;
            if (km >= bestKm) continue;
            bestKm = km;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x =
              Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            const bearingRad = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
            let hdgErr = bearingRad - player.heading;
            while (hdgErr > Math.PI) hdgErr -= Math.PI * 2;
            while (hdgErr < -Math.PI) hdgErr += Math.PI * 2;
            best = {
              id: tr.id,
              label: tr.label,
              km: Math.round(km * 10) / 10,
              bearingRad: Math.round(bearingRad * 1000) / 1000,
              headingErrorRad: Math.round(hdgErr * 1000) / 1000,
            };
          }
          return best;
        })(),
        combat: {
          kills: s.combat?.kills ?? 0,
          missileLockReady: Boolean(s.combat?.lockId),
          missileLockId: s.combat?.lockId || null,
          gunCooldown: Math.round((s.combat?.gunCooldown ?? 0) * 100) / 100,
          missileCooldown: Math.round((s.combat?.missileCooldown ?? 0) * 100) / 100,
          activeMissiles: s.combat?.projectiles?.length ?? 0,
        },
        mission: s.mission
          ? {
              active: s.mission.active,
              phase: s.mission.phase,
              controlMode: s.mission.controlMode,
              originId: s.mission.originId,
              destId: s.mission.destId,
            }
          : null,
        afford: {
          canBeginTakeoffRoll:
            s.mission?.active &&
            s.mission.phase === "preflight" &&
            !s.flying &&
            !f.crashed,
          canStartFlight: !s.flying && !f.crashed,
          canControl: s.flying && !s.paused && !f.crashed,
          canToggleHyper: Boolean(window.__earthAgent?.canEnableHyperSpeed?.()),
          hyperBlockReason: window.__earthAgent?.hyperBlockReason?.() || null,
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

function isAssistedTakeoffActive(gs) {
  if (!EARTH || gs.mission?.controlMode !== "assisted") return false;
  if (gs.mission?.phase !== "takeoff") return false;
  const tp = gs.takeoffPhase;
  return Boolean(tp && tp !== "idle" && tp !== "complete");
}

function decideCombatAction(gs) {
  if (!EARTH || gs.mission?.phase !== "cruise" || !gs.afford?.canControl) return null;
  const target = gs.nearestTraffic;
  if (!target || target.km > 10) return null;

  if (gs.combat?.missileLockReady && (gs.combat?.missileCooldown ?? 0) <= 0.05) {
    return {
      action: "fire_missile",
      params: {},
      reasoning: `[combat-auto] missile lock on ${target.label} @ ${target.km} km`,
    };
  }

  if (Math.abs(target.headingErrorRad) > 0.12) {
    return {
      action: "set_heading",
      params: { value: target.bearingRad },
      reasoning: `[combat-auto] aim at ${target.label} (${target.km} km)`,
    };
  }

  if (target.km <= 5) {
    return {
      action: "fire_gun",
      params: {},
      reasoning: `[combat-auto] guns on ${target.label} @ ${target.km} km`,
    };
  }

  return null;
}

function guardAssistedTakeoffAction(action, gs) {
  if (!isAssistedTakeoffActive(gs)) return action;
  if (
    action.action === "set_throttle" ||
    action.action === "set_pitch" ||
    action.action === "set_heading"
  ) {
    return {
      action: "wait",
      params: {},
      reasoning: `[assisted] ${action.action} skipped — autopilot handles takeoff (${gs.takeoffPhase})`,
    };
  }
  return action;
}

function validActionsThisTurn(gs) {
  if (EARTH) {
    const out = ["wait"];
    if (gs.afford.canBeginTakeoffRoll || gs.afford.canStartFlight) out.push("start_flight");
    if (!gs.mission?.active && gs.navTarget) out.push("start_mission");
    if (gs.afford.canRespawn) out.push("respawn");
    if (gs.afford.canToggleHyper) out.push("toggle_hyper");
    if (gs.afford.canControl) {
      out.push("fire_gun", "fire_missile");
      out.push(
        "set_throttle",
        "set_pitch",
        "set_heading",
        "set_gear",
        "toggle_gear",
        "toggle_pause",
        "set_game_speed",
        "set_control_mode"
      );
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
  const mission = gs.mission;

  if (mission?.phase === "failed" || gs.flight.crashed) {
    if (mission?.originId && mission?.destId) {
      return {
        action: "start_mission",
        params: {
          originId: mission.originId,
          destId: mission.destId,
          mode: mission.controlMode || "assisted",
        },
        reasoning: "[earth] restart failed mission",
      };
    }
    return { action: "respawn", params: {}, reasoning: "[earth] reset after crash" };
  }

  if (mission?.phase === "landed") {
    return { action: "wait", params: {}, reasoning: "[earth] mission complete" };
  }

  if (gs.afford.canBeginTakeoffRoll || (gs.afford.canStartFlight && !gs.flying)) {
    return { action: "start_flight", params: {}, reasoning: "[earth] begin takeoff" };
  }

  if (gs.gameSpeed < 4 && !isAssistedTakeoffActive(gs) && gs.mission?.phase === "cruise") {
    return { action: "set_game_speed", params: { speed: 4 }, reasoning: "[earth] sim speed 4x" };
  }

  const { agl, onGround, crashed } = gs.flight;
  if (crashed) {
    return { action: "respawn", params: {}, reasoning: "[earth] recover" };
  }

  const phase = mission?.active ? mission.phase : "cruise";

  if (isAssistedTakeoffActive(gs)) {
    return {
      action: "wait",
      params: {},
      reasoning: `[earth] assisted takeoff (${gs.takeoffPhase}) — ${gs.groundspeedKt} kt`,
    };
  }

  if (phase === "preflight" || phase === "takeoff" || (onGround && agl < 5)) {
    if (onGround && agl < 5) {
      return {
        action: "set_throttle",
        params: { value: 0.92 },
        reasoning: "[earth] takeoff roll",
      };
    }
    if (gs.flight.gearDown && agl > 35 && !onGround) {
      return { action: "set_gear", params: { down: false }, reasoning: "[earth] gear up after liftoff" };
    }
    if (agl < 180) {
      return { action: "set_pitch", params: { value: 0.14 }, reasoning: "[earth] climb out" };
    }
  }

  if (phase === "approach") {
    if (!gs.flight.gearDown) {
      return { action: "set_gear", params: { down: true }, reasoning: "[earth] gear down for landing" };
    }
    if (gs.navigation && Math.abs(gs.navigation.hdgErrorDeg) > 10) {
      return {
        action: "set_heading",
        params: { value: gs.navigation.bearingRad },
        reasoning: "[earth] align for landing",
      };
    }
    if (gs.flight.speed > 70 || agl > 400) {
      return {
        action: "set_throttle",
        params: { value: 0.32 },
        reasoning: "[earth] slow for approach",
      };
    }
    if (agl > 120) {
      return { action: "set_pitch", params: { value: -0.03 }, reasoning: "[earth] descend to runway" };
    }
    return { action: "wait", params: {}, reasoning: "[earth] final approach" };
  }

  if (gs.navigation && !gs.navigation.arrived && Math.abs(gs.navigation.hdgErrorDeg) > 15) {
    return {
      action: "set_heading",
      params: { value: gs.navigation.bearingRad },
      reasoning: "[earth] turn toward destination",
    };
  }

  if (agl < 180) {
    return { action: "set_pitch", params: { value: 0.14 }, reasoning: "[earth] climb out" };
  }

  if (agl >= 180 && agl <= 320) {
    return { action: "set_pitch", params: { value: 0.03 }, reasoning: "[earth] level in cruise band" };
  }

  if (agl > 320) {
    return { action: "set_pitch", params: { value: 0.02 }, reasoning: "[earth] high-altitude cruise" };
  }

  return {
    action: "set_throttle",
    params: { value: agl > 200 ? 0.85 : 0.92 },
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
    let v = Number(p.value);
    if (!Number.isFinite(v)) return { action: "wait", params: {}, reasoning: "[clamped] heading missing" };
    if (EARTH && Math.abs(v) > Math.PI * 2) {
      v = (v * Math.PI) / 180;
    }
    if (EARTH && gs.navigation?.bearingRad != null && Math.abs(Number(p.value)) > 6) {
      v = gs.navigation.bearingRad;
    }
    return { action: a, params: { value: v }, reasoning: action.reasoning || "" };
  }
  if (a === "set_gear") {
    return { action: a, params: { down: Boolean(p.down) }, reasoning: action.reasoning || "" };
  }
  if (a === "start_mission") {
    return {
      action: a,
      params: {
        originId: p.originId,
        destId: p.destId,
        mode: p.mode === "manual" ? "manual" : "assisted",
      },
      reasoning: action.reasoning || "",
    };
  }
  if (a === "set_control_mode") {
    const mode = p.mode === "manual" ? "manual" : "assisted";
    return { action: a, params: { mode }, reasoning: action.reasoning || "" };
  }
  if (a === "start_flight" || a === "respawn" || a === "toggle_gear" || a === "toggle_pause" || a === "wait") {
    return { action: a, params: {}, reasoning: action.reasoning || "" };
  }
  return { action: a, params: p, reasoning: action.reasoning || "" };
}

function skipDuplicateAction(action, gs, session) {
  const f = gs.flight || {};
  const p = action.params || {};
  const a = action.action;

  if (a === "set_throttle" && Number.isFinite(p.value) && Math.abs(p.value - (f.throttle ?? 0)) < 0.04) {
    return { action: "wait", params: {}, reasoning: "[dedupe] throttle already near current" };
  }
  if (a === "set_pitch" && Number.isFinite(p.value) && Math.abs(p.value - (f.pitch ?? 0)) < 0.025) {
    return { action: "wait", params: {}, reasoning: "[dedupe] pitch already near current" };
  }
  if (a === "set_heading" && Number.isFinite(p.value) && Math.abs(p.value - (f.heading ?? 0)) < 0.04) {
    return { action: "wait", params: {}, reasoning: "[dedupe] heading already near current" };
  }
  if (a === "set_gear" && f.gearDown === Boolean(p.down)) {
    return { action: "wait", params: {}, reasoning: `[dedupe] gear already ${p.down ? "down" : "up"}` };
  }

  const last = session._lastApplied;
  if (last && last.action === a && JSON.stringify(last.params) === JSON.stringify(p)) {
    return { action: "wait", params: {}, reasoning: `[dedupe] repeat ${a}` };
  }
  return action;
}

async function execute(page, action) {
  const { action: type, params = {} } = action;

  if (EARTH) {
    switch (type) {
      case "start_flight":
        await page.evaluate(() => window.__earthAgent.beginFlight());
        break;
      case "start_mission":
        await page.evaluate(
          ({ originId, destId, mode }) => {
            if (mode) window.__earthAgent.setControlMode(mode);
            window.__earthAgent.startMission(originId, destId);
          },
          params
        );
        break;
      case "set_control_mode":
        await page.evaluate(({ mode }) => window.__earthAgent.setControlMode(mode), params);
        break;
      case "respawn":
        await page.evaluate((id) => {
          const s = window.__earthState;
          const ap = id || s.mission?.originId || s.airportId;
          window.__earthAgent.spawnAtAirport(ap);
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
      case "set_gear":
        await page.evaluate(({ down }) => window.__earthAgent.setGear(down), params);
        break;
      case "toggle_pause":
        await page.evaluate(() => window.__earthAgent.togglePause());
        break;
      case "toggle_hyper":
        await page.evaluate(() => window.__earthAgent.toggleHyperSpeed());
        break;
      case "fire_gun":
        await page.evaluate(() => window.__earthAgent.fireGun());
        break;
      case "fire_missile":
        await page.evaluate(() => window.__earthAgent.fireMissile());
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

function attachPageDiagnostics(page, logger, session) {
  session.pageErrors = [];
  session._loggedFaultKeys = new Set();

  const record = (payload) => {
    session.pageErrors.push(payload);
    logger.write({ type: "page_error", ...payload });
    console.warn(`[page_error] ${payload.kind}: ${String(payload.message).slice(0, 240)}`);
  };

  page.on("pageerror", (err) => {
    record({ kind: "pageerror", message: err.message, stack: err.stack?.slice(0, 400) });
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    record({ kind: "console", message: msg.text() });
  });
}

async function readPageFaults(page) {
  return page.evaluate(() => {
    const vite = document.querySelector("vite-error-overlay");
    const cesium = document.querySelector(".cesium-widget-errorPanel");
    const status = document.getElementById("statusText")?.textContent || "";
    return {
      viteOverlay: vite ? (vite.shadowRoot?.textContent || vite.textContent || "vite error").slice(0, 500) : null,
      cesiumPanel: cesium?.textContent?.slice(0, 500) || null,
      statusFailed: /failed|error|stopped/i.test(status) ? status : null,
    };
  });
}

async function readVisualSnapshot(page) {
  return page.evaluate(() => {
    const s = window.__earthState;
    const f = s?.flight;
    const d = window.__earthDiagnostics || {};
    const canvas = document.querySelector("#cesiumContainer canvas");
    let canvasSig = null;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        const url = canvas.toDataURL("image/jpeg", 0.08);
        canvasSig = `${canvas.width}x${canvas.height}:${url.length}:${url.slice(-48)}`;
      } catch {
        canvasSig = "read-failed";
      }
    }
    const viewer = window.__earthViewer;
    return {
      lat: f?.lat ?? 0,
      lon: f?.lon ?? 0,
      agl: Math.round(s?.telemetry?.agl ?? 0),
      alt: Math.round(f?.alt ?? 0),
      flying: Boolean(s?.flying),
      showChase: Boolean(s?.showChase),
      paused: Boolean(s?.paused),
      throttle: f?.throttle ?? 0,
      speed: f?.speed ?? 0,
      renderFrames: d.renderFrames ?? 0,
      cesiumFrameNumber: viewer?.scene?.frameState?.frameNumber ?? null,
      canvasSig,
      telAgl: document.getElementById("telAgl")?.textContent ?? null,
      telSpeed: document.getElementById("telSpeed")?.textContent ?? null,
      cesiumError: Boolean(document.querySelector(".cesium-widget-errorPanel")),
    };
  });
}

function logVisualIssue(session, logger, turn, issue, snap) {
  const dedupe = `visual:${issue.code}`;
  if (!session._loggedFaultKeys) session._loggedFaultKeys = new Set();
  if (session._loggedFaultKeys.has(dedupe)) return;
  session._loggedFaultKeys.add(dedupe);
  const payload = { kind: "visual_stall", turn, code: issue.code, message: issue.message, snapshot: snap };
  session.pageErrors = session.pageErrors || [];
  session.pageErrors.push(payload);
  session.visualStalls = (session.visualStalls || 0) + 1;
  logger.write({ type: "visual_stall", ...payload });
  console.warn(`[visual_stall] turn ${turn} ${issue.code}: ${issue.message}`);
}

async function checkVisualStall(page, turn, logger, session) {
  if (!EARTH) return;

  const snap = await readVisualSnapshot(page);
  const prev = session._lastVisual;
  session._lastVisual = snap;
  if (!prev) return;

  const stateDelta =
    Math.abs(snap.lat - prev.lat) +
    Math.abs(snap.lon - prev.lon) +
    Math.abs(snap.agl - prev.agl) * 0.0001;
  const framesDelta = snap.renderFrames - prev.renderFrames;
  const aglDelta = Math.abs(snap.agl - prev.agl);

  if (snap.cesiumError) return;

  if (snap.flying && snap.throttle > 0.4 && aglDelta >= 1 && framesDelta === 0) {
    logVisualIssue(session, logger, turn, {
      code: "state_moving_render_frozen",
      message: `AGL ${prev.agl}→${snap.agl}m but renderFrames stuck (${snap.renderFrames})`,
    }, snap);
  }

  if (!HEADLESS && snap.flying && aglDelta >= 2 && stateDelta > 0.00001 && snap.canvasSig && snap.canvasSig === prev.canvasSig) {
    session._sameCanvasStreak = (session._sameCanvasStreak || 0) + 1;
    if (session._sameCanvasStreak >= 3) {
      logVisualIssue(session, logger, turn, {
        code: "static_screen",
        message: "Flight telemetry moving but globe canvas unchanged for 3+ ticks — screen looks frozen",
      }, snap);
    }
  } else {
    session._sameCanvasStreak = 0;
  }

  if (!HEADLESS && snap.flying && !snap.showChase) {
    logVisualIssue(session, logger, turn, {
      code: "cockpit_camera",
      message: "Cockpit view active — switch to chase camera to see globe movement",
    }, snap);
    await page.evaluate(() => window.__earthAgent.setChaseView(true));
  }

  if (!snap.canvasSig || snap.canvasSig === "read-failed") {
    logVisualIssue(session, logger, turn, {
      code: "canvas_unreadable",
      message: "Cesium canvas missing or pixel read failed — globe may not be rendering",
    }, snap);
  }

  const telAglNum = parseInt(String(snap.telAgl || ""), 10);
  if (snap.flying && Number.isFinite(telAglNum) && Math.abs(telAglNum - snap.agl) > 25) {
    logVisualIssue(session, logger, turn, {
      code: "hud_state_mismatch",
      message: `HUD AGL (${snap.telAgl}) diverges from sim state (${snap.agl}m) — UI may be stale`,
    }, snap);
  }
}

async function runEarthPhysicsStep(page, session, logger, turn) {
  const dt = TICK_MS / 1000;
  const before = EARTH ? await readVisualSnapshot(page) : null;

  if (!HEADLESS) {
    const frames = Math.max(10, Math.min(40, Math.floor(TICK_MS / 25)));
    const subDt = dt / frames;
    const frameMs = Math.floor(TICK_MS / frames);
    for (let f = 0; f < frames; f += 1) {
      await page.evaluate(({ step }) => window.__earthStep?.(step), { step: subDt });
      await page.waitForTimeout(frameMs);
    }
  } else {
    await page.evaluate(({ step }) => window.__earthStep?.(step), { step: dt });
    await page.waitForTimeout(TICK_MS);
  }

  if (before && EARTH) {
    const after = await readVisualSnapshot(page);
    const aglDelta = Math.abs(after.agl - before.agl);
    const framesDelta = after.renderFrames - before.renderFrames;
    if (after.flying && aglDelta >= 1 && framesDelta === 0) {
      logVisualIssue(session, logger, turn, {
        code: "step_without_render",
        message: `Physics step moved AGL ${before.agl}→${after.agl}m but only ${framesDelta} render frame(s)`,
      }, after);
    }
  }

  await checkVisualStall(page, turn, logger, session);
}

async function checkPageFaults(page, turn, logger, session) {
  if (!session._loggedFaultKeys) session._loggedFaultKeys = new Set();
  const faults = await readPageFaults(page);
  for (const [key, message] of Object.entries(faults)) {
    if (!message) continue;
    const dedupe = `${key}:${message.slice(0, 120)}`;
    if (session._loggedFaultKeys.has(dedupe)) continue;
    session._loggedFaultKeys.add(dedupe);
    const payload = { kind: "ui_fault", fault: key, turn, message };
    session.pageErrors.push(payload);
    logger.write({ type: "page_error", ...payload });
    console.warn(`[page_fault] turn ${turn} ${key}: ${message.slice(0, 240)}`);
  }
}

async function beginEarthTakeoffIfNeeded(page, route = null) {
  await page.evaluate(
    ({ from, to, mode, gameSpeed }) => {
      const s = window.__earthState;
      if (!s.mission?.active && from && to) {
        window.__earthAgent.setControlMode(mode);
        window.__earthAgent.startMission(from, to);
      }
      if (s.mission?.active && s.mission.phase === "preflight" && !s.flying) {
        window.__earthAgent.beginFlight();
      } else if (!s.flying && s.mission?.active) {
        window.__earthAgent.beginFlight();
      }
      s.paused = false;
      if (s.takeoff?.phase && s.takeoff.phase !== "complete") {
        window.__earthAgent.setGameSpeed(gameSpeed);
      }
    },
    {
      from: route?.from || null,
      to: route?.to || null,
      mode: route?.mode || "assisted",
      gameSpeed: HEADLESS ? 4 : 1,
    }
  );
}

async function tick(page, turn, logger, session) {
  await checkPageFaults(page, turn, logger, session);
  if (EARTH && turn <= 3) {
    await beginEarthTakeoffIfNeeded(page, {
      from: FROM_AIRPORT,
      to: TO_AIRPORT,
      mode: CONTROL_MODE === "manual" ? "manual" : "assisted",
    });
  }
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
    takeoff_phase: gs.takeoffPhase,
    hyper_speed: gs.hyperSpeed,
    can_toggle_hyper: gs.afford?.canToggleHyper ?? null,
    hyper_block_reason: gs.afford?.hyperBlockReason ?? null,
    max_mach_constant: gs.maxMachConstant,
    speed_cap_mach: gs.speedCapMach,
    current_mach: gs.currentMach,
    groundspeed_kt: gs.groundspeedKt,
    speed_mode: gs.speedMode,
    flight: gs.flight,
    terrain: gs.terrain,
    flying: gs.flying,
    game_speed: gs.gameSpeed,
    startup_active: gs.startupActive,
    status: gs.status,
    combat_kills: gs.combat?.kills ?? 0,
    missile_lock_ready: gs.combat?.missileLockReady ?? false,
    traffic_contacts: gs.trafficContacts ?? [],
  });

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

  if (
    EARTH &&
    gs.afford.canControl &&
    gs.flight.gearDown &&
    gs.flight.agl > 35 &&
    !gs.flight.onGround
  ) {
    const auto = { action: "set_gear", params: { down: false }, reasoning: "[auto] gear up after liftoff" };
    await execute(page, auto);
    logger.write({ type: "override", turn, ...auto });
  }

  let action;
  if (HEURISTIC) {
    action = guardAssistedTakeoffAction(
      skipDuplicateAction(clampAction(normalizeAction(decideHeuristic(gs)), gs, session), gs, session),
      gs
    );
  } else {
    if (
      EARTH &&
      gs.flying &&
      gs.gameSpeed < 4 &&
      gs.afford.canControl &&
      !isAssistedTakeoffActive(gs)
    ) {
      const auto = { action: "set_game_speed", params: { speed: 4 }, reasoning: "[auto] 4x sim speed" };
      await execute(page, auto);
      logger.write({ type: "override", turn, ...auto });
    } else if (!EARTH && !gs.startupActive && gs.gameSpeed < 4) {
      const auto = { action: "set_speed", params: { speed: 4 }, reasoning: "[auto] run at 4x for testing throughput" };
      await execute(page, auto);
      logger.write({ type: "override", turn, ...auto });
    }

    const allowed = validActionsThisTurn(gs);
    const navHint = gs.navigation
      ? `\nNavigation: fly toward ${gs.navigation.destId} — ${gs.navigation.distKm} km remaining, bearing ${gs.navigation.bearingDeg}°, heading error ${gs.navigation.hdgErrorDeg}°, arrived=${gs.navigation.arrived}.`
      : "";
    const combatHint =
      gs.combat && (gs.trafficContacts?.length || gs.combat.kills > 0)
        ? `\nCombat: kills=${gs.combat.kills}, missileLockReady=${gs.combat.missileLockReady}, nearest=${JSON.stringify(gs.nearestTraffic || null)}. Prefer fire_missile when locked, else set_heading toward nearest traffic then fire_gun when <5 km.`
        : "";
    const combatAction = decideCombatAction(gs);
    if (combatAction) {
      action = guardAssistedTakeoffAction(
        skipDuplicateAction(clampAction(normalizeAction(combatAction), gs), gs, session),
        gs
      );
    } else {
    const raw = await askLLM(
      getSystemPrompt(),
      `Game state:\n${JSON.stringify(gs, null, 2)}${navHint}${combatHint}\n\nValid actions this turn:\n${allowed.join(", ")}\n\nReturn one JSON action.`
    );
    const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      action = JSON.parse(clean);
    } catch {
      logger.write({ type: "error", turn, error: "bad_json", raw: clean });
      return;
    }
    action = guardAssistedTakeoffAction(
      skipDuplicateAction(clampAction(normalizeAction(action), gs), gs, session),
      gs
    );
    }
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
  session._lastApplied = { action: action.action, params: { ...(action.params || {}) } };
  session.actionCounts[action.action] = (session.actionCounts[action.action] || 0) + 1;

  if (EARTH && HEURISTIC && gs.afford.canControl && !isAssistedTakeoffActive(gs)) {
    await page.evaluate(({ agl }) => {
      const s = window.__earthState;
      const f = s.flight;
      if (agl < 180) {
        f.throttle = Math.max(f.throttle, 0.88);
        f.pitch = Math.max(f.pitch, 0.12);
      } else if (agl <= 320) {
        f.pitch = Math.min(f.pitch, 0.04);
        f.throttle = Math.min(Math.max(f.throttle, 0.72), 0.88);
      } else {
        f.throttle = Math.min(Math.max(f.throttle, 0.72), 0.85);
        f.pitch = Math.min(f.pitch, 0.05);
      }
    }, { agl: gs.flight.agl });
  }

  logger.write({
    type: "action",
    turn,
    action: action.action,
    params: action.params || {},
    reasoning: action.reasoning || "",
    cash_before: gs.cash,
    mission_phase: EARTH ? gs.mission?.phase || (gs.flying ? "flying" : "idle") : gs.mission?.phase,
  });

  if (EARTH) {
    const tk = gs.takeoffPhase && gs.takeoffPhase !== "idle" ? ` tk:${gs.takeoffPhase}` : "";
    const hyper = gs.hyperSpeed ? " HYPER" : "";
    const kills = gs.combat?.kills ? ` kills:${gs.combat.kills}` : "";
    console.log(
      `[T${String(turn).padStart(3)}] ${gs.airportId}${gs.navigation ? `→${gs.navigation.destId}` : ""} | ${gs.mission?.phase || "?"}${tk}${hyper}${kills} | ${gs.groundspeedKt}kt agl ${String(gs.flight.agl).padStart(4)} | ${action.action}`
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
    route: TO_AIRPORT ? { from: FROM_AIRPORT, to: TO_AIRPORT } : null,
  });

  if (!HEADLESS) {
    console.log(
      "\n[headed] Look for the Playwright window: \"Google Chrome for Testing\" — not your normal browser tab.\n"
    );
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 40,
    args: HEADLESS
      ? []
      : [
          "--start-maximized",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
        ],
  });
  const page = await browser.newPage(
    HEADLESS ? undefined : { viewport: null }
  );
  attachPageDiagnostics(page, logger, session);
  await page.goto(GAME_URL, {
    waitUntil: EARTH ? "domcontentloaded" : "networkidle",
    timeout: EARTH ? 90000 : 60000,
  });
  if (EARTH) {
    await page.waitForFunction(() => window.__earthState && window.__earthAgent, { timeout: 45000 });
    await page.evaluate(() => window.__earthAgent.setAgentDrive(true));
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
    if (TO_AIRPORT && AIRPORTS[TO_AIRPORT]) {
      const dest = AIRPORTS[TO_AIRPORT];
      const origin = AIRPORTS[FROM_AIRPORT] ? FROM_AIRPORT : "SFO";
      await page.evaluate(
        ({ from, to, mode }) => {
          window.__earthAgent.setControlMode(mode);
          window.__earthAgent.startMission(from, to);
        },
        { from: origin, to: TO_AIRPORT, mode: CONTROL_MODE === "manual" ? "manual" : "assisted" }
      );
      console.log(`Mission: ${origin} → ${TO_AIRPORT} (${dest.name}) · ${CONTROL_MODE}`);
      await page.evaluate(() => {
        window.__earthAgent.setGameSpeed(1);
      });
      console.log("Mission armed — agentDrive @ 1×; turn 1 begins takeoff roll");
    } else {
      await page.evaluate(() => {
        const s = window.__earthState;
        s.flying = false;
        s.paused = false;
        s.gameSpeed = 1;
        s.flight.crashed = false;
        s.navTarget = null;
      });
    }
  }

  if (!HEADLESS && EARTH) {
    await page.bringToFront();
    await page.evaluate(() => {
      window.__earthAgent.setChaseView(true);
      const s = window.__earthState;
      if (!s.mission?.active && !s.flying) window.__earthAgent.beginFlight();
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
      try {
        await runEarthPhysicsStep(page, session, logger, turn);
      } catch (err) {
        logger.write({ type: "error", turn, error: `physics: ${err.message}` });
        if (String(err.message).includes("Execution context")) {
          console.warn("[agent] Page context lost — stopping run (reload or close?)");
          break;
        }
      }
    } else {
      await page.waitForTimeout(TICK_MS);
    }

    turn += 1;
  }

  if (EARTH) {
    await page.evaluate(() => window.__earthAgent.setAgentDrive(false)).catch(() => {});
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
    page_errors: session.pageErrors?.length || 0,
    visual_stalls: session.visualStalls || 0,
  });
  await logger.close();
  await browser.close();

  const pageErrorCount = session.pageErrors?.length || 0;
  console.log("\n── Session Summary ──────────────────────────────");
  console.log(`  Turns     : ${turn - 1}`);
  console.log(`  Page errs : ${pageErrorCount}${pageErrorCount ? " (see page_error records in log)" : ""}`);
  const visualStalls = session.visualStalls || 0;
  console.log(`  Visual    : ${visualStalls ? `${visualStalls} stall(s) — see visual_stall in log` : "ok"}`);
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
