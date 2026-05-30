import { AIRPORTS } from "./constants.js";
import { computeNavTo } from "./nav.js";
import {
  applyAssistedTakeoff,
  updateTakeoff,
  isTakeoffActive,
  TAKEOFF_PHASES,
} from "./takeoff.js";

export const MISSION_PHASES = {
  IDLE: "idle",
  PREFLIGHT: "preflight",
  TAKEOFF: "takeoff",
  CRUISE: "cruise",
  APPROACH: "approach",
  LANDED: "landed",
  FAILED: "failed",
};

export const LANDING = {
  MAX_DIST_M: 4000,
  MAX_SPEED_MPS: 70,
  MAX_AGL_M: 120,
  APPROACH_DIST_KM: 45,
  UNSAFE_SPEED_MPS: 95,
};

export function createMissionState() {
  return {
    active: false,
    phase: MISSION_PHASES.IDLE,
    controlMode: "manual",
    originId: null,
    destId: null,
    landedAt: null,
    failReason: null,
  };
}

export function setControlMode(state, mode) {
  state.mission.controlMode = mode === "assisted" ? "assisted" : "manual";
}

export function startMission(state, originId, destId) {
  const origin = AIRPORTS[originId];
  const dest = AIRPORTS[destId];
  if (!origin || !dest) return false;
  if (originId === destId) return false;

  state.mission = {
    active: true,
    phase: MISSION_PHASES.PREFLIGHT,
    controlMode: state.mission?.controlMode || "manual",
    originId,
    destId,
    landedAt: null,
    failReason: null,
  };

  state.navTarget = { id: dest.id, name: dest.name, lat: dest.lat, lon: dest.lon };
  state.navOrigin = { id: origin.id, lat: origin.lat, lon: origin.lon };
  state._lastMissionHint = null;
  state.status = `Mission ${origin.id} → ${dest.id} — parked on runway (throttle 0). Fly/Enter to roll. Mode: ${state.mission.controlMode}.`;
  return true;
}

export function cancelMission(state) {
  state.mission = createMissionState();
  state.status = "Mission cancelled — free flight or pick a new route.";
}

export function missionHint(state) {
  const m = state.mission;
  if (!m.active) return null;
  const nav = state.telemetry?.navigation;
  const f = state.flight;

  switch (m.phase) {
    case MISSION_PHASES.PREFLIGHT:
      return "On runway — Fly/Enter starts roll. Manual: hold W. Assisted: autopilot takeoff.";
    case MISSION_PHASES.TAKEOFF:
      if (f.onGround) {
        const vr = state.takeoff?.speeds?.VR_KT ?? 146;
        return m.controlMode === "assisted"
          ? `Autopilot TO — rolling to ${vr} kt VR…`
          : `Manual TO: W to ${vr} kt, rotate (↑), G after liftoff.`;
      }
      if (f.gearDown) return "Gear up (G) for climb.";
      return "Climb to cruise altitude.";
    case MISSION_PHASES.CRUISE:
      return nav
        ? `En route to ${m.destId} — ${nav.distKm} km. Fly any heading; green dot is reference only.`
        : `En route to ${m.destId}.`;
    case MISSION_PHASES.APPROACH:
      if (!f.gearDown) return `Approach ${m.destId}: gear down (G), reduce throttle, descend.`;
      if ((f.speed ?? 0) > LANDING.MAX_SPEED_MPS) return "Slow down — target under 135 kt for landing.";
      return `Final: align with ${m.destId}, flare, touchdown.`;
    case MISSION_PHASES.LANDED:
      return `Landed at ${m.destId}. Mission complete.`;
    case MISSION_PHASES.FAILED:
      return m.failReason || "Mission failed — restart mission to retry.";
    default:
      return null;
  }
}

function checkLandingSuccess(state, nav) {
  const f = state.flight;
  if (!nav || !state.mission.destId) return false;
  if (!f.onGround || f.crashed) return false;
  if (nav.distM > LANDING.MAX_DIST_M) return false;
  if (!f.gearDown) return false;
  if (f.speed > LANDING.MAX_SPEED_MPS) return false;
  if ((state.telemetry.agl ?? 0) > LANDING.MAX_AGL_M) return false;
  return true;
}

function checkUnsafeLanding(state, nav) {
  const f = state.flight;
  if (!nav || !state.mission.active) return false;
  if (!f.onGround || f.crashed) return false;
  if (nav.distM > LANDING.MAX_DIST_M) return false;
  if (f.speed > LANDING.UNSAFE_SPEED_MPS) return true;
  if (!f.gearDown && f.speed > 40) return true;
  return false;
}

export function updateMission(state) {
  const m = state.mission;
  if (!m.active) return;

  const f = state.flight;
  const nav = state.telemetry?.navigation;
  const hint = missionHint(state);
  if (
    hint &&
    m.phase !== MISSION_PHASES.LANDED &&
    m.phase !== MISSION_PHASES.FAILED &&
    hint !== state._lastMissionHint
  ) {
    state._lastMissionHint = hint;
    state.status = hint;
  }

  if (m.phase === MISSION_PHASES.LANDED || m.phase === MISSION_PHASES.FAILED) {
    return;
  }

  if (f.crashed) {
    m.phase = MISSION_PHASES.FAILED;
    m.failReason = "Crash — restart mission from origin.";
    state.status = m.failReason;
    return;
  }

  if (m.phase === MISSION_PHASES.PREFLIGHT && state.flying) {
    m.phase = MISSION_PHASES.TAKEOFF;
    state._lastMissionHint = null;
  }

  if (
    m.phase === MISSION_PHASES.TAKEOFF &&
    (state.takeoff?.phase === TAKEOFF_PHASES.COMPLETE ||
      (!f.onGround && (state.telemetry.agl ?? 0) > 80 && f.speed > 55))
  ) {
    m.phase = MISSION_PHASES.CRUISE;
    state._lastMissionHint = null;
    if (m.controlMode === "assisted") {
      state.altitudeHold = { active: true, targetAlt: f.alt };
      state.status = `Cruise HOLD at ${Math.round(f.alt)} m — L to release`;
    }
  }

  if (
    (m.phase === MISSION_PHASES.CRUISE || m.phase === MISSION_PHASES.TAKEOFF) &&
    nav &&
    nav.distKm <= LANDING.APPROACH_DIST_KM &&
    !f.onGround
  ) {
    m.phase = MISSION_PHASES.APPROACH;
  }

  if (m.phase === MISSION_PHASES.APPROACH && checkUnsafeLanding(state, nav)) {
    m.phase = MISSION_PHASES.FAILED;
    m.failReason = `Unsafe landing at ${m.destId} — too fast or gear up. Restart mission.`;
    state.status = m.failReason;
    return;
  }

  if (
    (m.phase === MISSION_PHASES.APPROACH || m.phase === MISSION_PHASES.CRUISE) &&
    checkLandingSuccess(state, nav)
  ) {
    m.phase = MISSION_PHASES.LANDED;
    m.landedAt = Date.now();
    state.paused = false;
    state.status = `Landed at ${AIRPORTS[m.destId]?.name || m.destId} — mission complete.`;
  }
}

export function applyAssistedControls(state, dt) {
  if (state.mission.controlMode !== "assisted" || !state.mission.active) return;
  if (!state.flying || state.paused || state.flight.crashed) return;

  const f = state.flight;
  const m = state.mission;
  const agl = state.telemetry.agl ?? 0;
  const nav = state.telemetry.navigation;
  const t = Math.min(0.12, dt) * state.gameSpeed;

  if (m.phase === MISSION_PHASES.PREFLIGHT || m.phase === MISSION_PHASES.TAKEOFF) {
    if (isTakeoffActive(state)) {
      if (m.controlMode === "assisted") {
        applyAssistedTakeoff(state, dt);
      } else {
        updateTakeoff(state);
        if (f.onGround && state.input.throttleUp && f.throttle < 0.95) {
          f.throttle = Math.min(1, f.throttle + t * 0.5);
        }
      }
    }
    return;
  }

  if (m.phase === MISSION_PHASES.CRUISE) {
    return;
  }

  if (m.phase === MISSION_PHASES.APPROACH && nav) {
    if (!f.gearDown && agl < 1200) f.gearDown = true;

    const targetAlt = Math.max(
      (state.telemetry.terrainAlt ?? 0) + 180,
      (AIRPORTS[m.destId]?.alt ?? 0) + 120
    );
    if (nav.distKm < 25 && f.alt > targetAlt + 80) {
      f.pitch = Math.max(-0.06, f.pitch - t * 0.12);
      f.throttle = Math.max(0.35, f.throttle - t * 0.2);
    } else if (nav.distKm < 12) {
      f.throttle = Math.max(0.28, Math.min(f.throttle, 0.5));
      if (f.speed > LANDING.MAX_SPEED_MPS) {
        f.throttle = Math.max(0.2, f.throttle - t * 0.25);
      }
    }

    if (nav.distKm < 18 && Math.abs(nav.headingErrorRad) > 0.08) {
      const turn = nav.headingErrorRad * 0.12 * t;
      f.heading = (f.heading + turn + Math.PI * 2) % (Math.PI * 2);
    }
  }
}
