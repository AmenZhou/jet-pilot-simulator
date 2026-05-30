import { SPEED_OF_SOUND_MS, MAX_MACH } from "./constants.js";
import { isTakeoffActive } from "./takeoff.js";
import { MISSION_PHASES } from "./mission.js";

/** ~Mach 0.85 cruise — realistic jet */
export const NORMAL_MAX_MPS = SPEED_OF_SOUND_MS * 0.85;

/** Takeoff / approach cap (~190 kt) — keeps VR/V2 meaningful */
export const TAKEOFF_MAX_MPS = 98;

/** Arcade hyper cruise */
export const HYPER_MAX_MPS = SPEED_OF_SOUND_MS * MAX_MACH;

export function isApproachOrLanding(state) {
  const m = state.mission;
  if (!m?.active) return false;
  return m.phase === MISSION_PHASES.APPROACH || m.phase === MISSION_PHASES.LANDED;
}

export function canEnableHyperSpeed(state) {
  if (!state.flying || state.flight.crashed || state.flight.onGround) return false;
  if (isTakeoffActive(state)) return false;
  const agl = state.telemetry?.agl ?? 0;
  if (agl < 120) return false;
  const m = state.mission;
  if (m?.active && (m.phase === MISSION_PHASES.TAKEOFF || m.phase === MISSION_PHASES.PREFLIGHT)) {
    return false;
  }
  return true;
}

export function getSpeedCapMps(state) {
  if (state.hyperSpeed) return HYPER_MAX_MPS;
  if (
    isTakeoffActive(state) ||
    state.flight?.onGround ||
    isApproachOrLanding(state) ||
    (state.mission?.active && state.mission.phase === MISSION_PHASES.TAKEOFF)
  ) {
    return TAKEOFF_MAX_MPS;
  }
  return NORMAL_MAX_MPS;
}

/** Thrust / drag tuned per mode so acceleration feels right */
export function getPhysicsCoeffs(state) {
  const cap = getSpeedCapMps(state);
  if (state.hyperSpeed) {
    return {
      maxSpeed: cap,
      thrust: 1_158_000,
      drag: 0.001,
      gearDrag: 0.012,
      groundFriction: 0.004,
    };
  }
  if (cap <= TAKEOFF_MAX_MPS + 1) {
    return {
      maxSpeed: cap,
      /** ~5–7 m/s² to VR in ~10–14 s at 1×; still reaches ~190 kt cap */
      thrust: 16,
      drag: 0.0011,
      gearDrag: 0.0025,
      groundFriction: 0.0045,
    };
  }
  return {
    maxSpeed: cap,
    thrust: 520_000,
    drag: 0.004,
    gearDrag: 0.014,
    groundFriction: 0.005,
  };
}

export function toggleHyperSpeed(state) {
  if (state.hyperSpeed) {
    state.hyperSpeed = false;
    const cap = getSpeedCapMps(state);
    if (state.flight.speed > cap) state.flight.speed = cap * 0.95;
    state.status = `Normal flight — max ~${Math.round(cap * 1.94384)} kt. Press M for hyper at cruise altitude.`;
    return false;
  }
  if (!canEnableHyperSpeed(state)) {
    state.status =
      "Hyper speed only in cruise — finish takeoff, climb above ~120 m AGL, then press M.";
    return false;
  }
  state.hyperSpeed = true;
  state.status = `HYPER MODE — up to Mach ${MAX_MACH}. Press M to return to normal speeds.`;
  return true;
}

export function speedModeLabel(state) {
  if (state.hyperSpeed) return `HYPER · Mach ${MAX_MACH}`;
  const capKt = Math.round(getSpeedCapMps(state) * 1.94384);
  if (isTakeoffActive(state) || state.flight?.onGround) return `TAKEOFF · max ${capKt} kt`;
  return `NORMAL · max ${capKt} kt`;
}
