import { AIRPORTS, DEFAULT_AIRPORT, PHYSICS } from "./constants.js";
import { createMissionState } from "./mission.js";
import { MISSION_PHASES } from "./mission.js";
import { initTakeoff, clearTakeoff } from "./takeoff.js";
import { createCombatState } from "./weapons.js";
import { clearWrecks } from "./traffic-wreck.js";

function airportSpawn(id) {
  const ap = AIRPORTS[id] || AIRPORTS[DEFAULT_AIRPORT];
  return {
    lat: ap.lat,
    lon: ap.lon,
    alt: ap.alt + 3.5,
    heading: ap.heading,
    pitch: 0.02,
    roll: 0,
    speed: 0,
    throttle: 0,
    gearDown: true,
    onGround: true,
    crashed: false,
    airportId: ap.id,
  };
}

/** Park on runway — used when starting a mission */
export function prepareRunway(state, airportId) {
  state.airportId = airportId;
  state.flight = airportSpawn(airportId);
  state.flying = false;
  state.flight.crashed = false;
  state.paused = false;
  state.flight.onGround = true;
  state.flight.gearDown = true;
  state.flight.speed = 0;
  state.flight.throttle = 0;
  state.flight.pitch = 0;
  const ap = AIRPORTS[airportId];
  if (ap) state.flight.heading = ap.heading;
  clearTakeoff(state);
}

export function createState() {
  return {
    mode: "earth",
    paused: false,
    flying: false,
    gameSpeed: 1,
    autoPatrol: false,
    navTarget: null,
    navOrigin: null,
    mission: createMissionState(),
    airportId: DEFAULT_AIRPORT,
    flight: airportSpawn(DEFAULT_AIRPORT),
    traffic: [],
    wrecks: [],
    input: {
      throttleUp: false,
      throttleDown: false,
      pitchUp: false,
      pitchDown: false,
      yawLeft: false,
      yawRight: false,
      fireGun: false,
    },
    telemetry: {
      agl: 0,
      terrainAlt: 0,
      groundspeedKt: 0,
      trafficNearby: 0,
      nearestTrafficKm: null,
      terrain: { mode: "ellipsoid-airport-v1", source: "airport-pad", nearestAirport: null },
    },
    status: "Press Enter or Fly to begin — then explore the globe.",
    /** Chase-camera distance multiplier (scroll wheel / [ ]) */
    cameraZoom: 1,
    /** Cruise altitude hold (L to toggle) */
    altitudeHold: { active: false, targetAlt: null, userDisabled: false },
    /** Hyper Mach 300 — off during takeoff; toggle with M in cruise */
    hyperSpeed: false,
    combat: createCombatState(),
    /** When true, rAF only renders — Playwright agent steps via __earthStep */
    agentDrive: false,
  };
}

export function spawnAtAirport(state, airportId) {
  state.airportId = airportId;
  state.flight = airportSpawn(airportId);
  state.flying = false;
  state.flight.crashed = false;
  state.paused = false;
  state.traffic = [];
  state.wrecks = [];
  state.telemetry.trafficNearby = 0;
  state.telemetry.nearestTrafficKm = null;
  state.combat = createCombatState();
  if (state.mission?.active) {
    state.mission.phase = "preflight";
    state.mission.failReason = null;
    state.mission.landedAt = null;
  }
  clearTakeoff(state);
  state.status = `Positioned at ${AIRPORTS[airportId]?.name || airportId} — Enter or Fly to depart.`;
}

export function beginFlight(state) {
  if (state.flying) return;
  state.flying = true;
  state.flight.crashed = false;
  state.flight.onGround = true;
  state.flight.speed = Math.max(0, state.flight.speed);
  if (state.mission?.active && state.mission.phase === MISSION_PHASES.PREFLIGHT) {
    state.mission.phase = MISSION_PHASES.TAKEOFF;
  }
  state.hyperSpeed = false;
  initTakeoff(state);
}

export { PHYSICS, AIRPORTS, createMissionState };
