/**
 * Takeoff model based on standard V-speed sequencing (V1 / VR / V2).
 *
 * References:
 * - ICAO-style V-speed definitions (V1 decision, VR rotation, V2 climb safety)
 * - FlightGear wiki "Calculate V-speeds" (B747-style ~115–135 kt VR band)
 * - FlyByWire A380 guide: TOGA roll, rotate at VR (~2–3°/s to ~12.5° pitch), gear up after positive rate
 * - MSFS tutorials: line up, smooth full thrust, rotate at Vr, stable initial climb
 */

const MPS_TO_KT = 1.94384;
const KT_TO_MPS = 1 / MPS_TO_KT;

export const TAKEOFF_PHASES = {
  IDLE: "idle",
  ROLL: "roll",
  ROTATE: "rotate",
  LIFTOFF: "liftoff",
  INITIAL_CLIMB: "initial_climb",
  COMPLETE: "complete",
};

/** Jet takeoff speeds (m/s) — tuned for ~140–155 kt rotation like airliners */
export function computeTakeoffSpeeds(state = {}) {
  const gearDown = state.flight?.gearDown !== false;
  const flaps = gearDown ? "TO" : "UP";

  let v1Kt = 128;
  let vrKt = 142;
  let v2Kt = 152;

  if (flaps === "TO") {
    v1Kt = 132;
    vrKt = 146;
    v2Kt = 156;
  }

  return {
    flaps,
    V1_MPS: v1Kt * KT_TO_MPS,
    VR_MPS: vrKt * KT_TO_MPS,
    V2_MPS: v2Kt * KT_TO_MPS,
    V1_KT: v1Kt,
    VR_KT: vrKt,
    V2_KT: v2Kt,
    rotationPitchRad: 0.11,
    rotationRateRadS: 0.045,
    targetClimbPitchRad: 0.09,
  };
}

export function mpsToKt(mps) {
  return mps * MPS_TO_KT;
}

export function initTakeoff(state) {
  const speeds = computeTakeoffSpeeds(state);
  state.takeoff = {
    phase: TAKEOFF_PHASES.ROLL,
    speeds,
    rotationPitchRad: speeds.rotationPitchRad,
    gearUpDone: false,
    startedAt: performance.now(),
  };
  state.status = `Takeoff roll — hold centerline. Rotate at ${speeds.VR_KT} kt (VR).`;
  return state.takeoff;
}

export function clearTakeoff(state) {
  state.takeoff = { phase: TAKEOFF_PHASES.IDLE, speeds: null };
}

export function isTakeoffActive(state) {
  const p = state.takeoff?.phase;
  return p && p !== TAKEOFF_PHASES.IDLE && p !== TAKEOFF_PHASES.COMPLETE;
}

export function takeoffHint(state) {
  const tk = state.takeoff;
  if (!tk?.speeds) return null;
  const f = state.flight;
  const gsKt = Math.round(mpsToKt(f.speed));
  const { VR_KT, V2_KT } = tk.speeds;

  switch (tk.phase) {
    case TAKEOFF_PHASES.ROLL:
      return `Roll — full thrust to ${VR_KT} kt, then rotate (↑). Now ${gsKt} kt.`;
    case TAKEOFF_PHASES.ROTATE:
      return `Rotate — ease nose up to ~7° at ${VR_KT} kt. Now ${gsKt} kt.`;
    case TAKEOFF_PHASES.LIFTOFF:
      return "Liftoff — positive rate; gear up (G) when clear.";
    case TAKEOFF_PHASES.INITIAL_CLIMB:
      return `Climb — target ${V2_KT} kt, gear up, then level off.`;
    default:
      return null;
  }
}

function advanceTakeoffPhase(state, agl, climbing) {
  const tk = state.takeoff;
  const f = state.flight;
  if (!tk?.speeds) return;

  const { VR_MPS, V2_MPS } = tk.speeds;

  if (tk.phase === TAKEOFF_PHASES.ROLL && f.speed >= VR_MPS * 0.98) {
    tk.phase = TAKEOFF_PHASES.ROTATE;
    state.status = `VR ${tk.speeds.VR_KT} kt — rotate (↑), ~2–3°/s nose up.`;
  }

  if (tk.phase === TAKEOFF_PHASES.ROTATE && !f.onGround) {
    tk.phase = TAKEOFF_PHASES.LIFTOFF;
    state.status = "Liftoff — positive rate. Gear up (G) when safe.";
  }

  if (tk.phase === TAKEOFF_PHASES.LIFTOFF && agl > 12 && climbing) {
    tk.phase = TAKEOFF_PHASES.INITIAL_CLIMB;
    state.status = `Initial climb — maintain ≥ ${tk.speeds.V2_KT} kt to 400 ft AGL.`;
  }

  if (tk.phase === TAKEOFF_PHASES.INITIAL_CLIMB && agl > 35 && f.speed >= V2_MPS * 0.85) {
    if (f.gearDown && !tk.gearUpDone) {
      f.gearDown = false;
      tk.gearUpDone = true;
    }
  }

  if (
    tk.phase === TAKEOFF_PHASES.INITIAL_CLIMB &&
    agl > 150 &&
    f.speed >= V2_MPS * 0.88 &&
    !f.gearDown
  ) {
    tk.phase = TAKEOFF_PHASES.COMPLETE;
    state.status = "Takeoff complete — cruise or continue mission.";
  }
}

/** Assisted takeoff — FlyByWire-style: TOGA, rotate at VR, V2 climb, gear after positive rate */
export function applyAssistedTakeoff(state, dt) {
  const tk = state.takeoff;
  if (!tk?.speeds || tk.phase === TAKEOFF_PHASES.COMPLETE) return;

  const f = state.flight;
  const agl = state.telemetry?.agl ?? 0;
  const { VR_MPS, V2_MPS, rotationPitchRad, rotationRateRadS, targetClimbPitchRad } = tk.speeds;
  const t = Math.min(0.12, dt) * (state.gameSpeed ?? 1);

  if (tk.phase === TAKEOFF_PHASES.ROLL) {
    f.throttle = Math.min(1, f.throttle + t * 0.7);
    f.pitch = Math.max(0, f.pitch - t * 0.08);
    if (f.pitch > 0.02) f.pitch = Math.max(0, f.pitch - t * 0.15);
  }

  if (tk.phase === TAKEOFF_PHASES.ROTATE) {
    f.throttle = Math.min(1, f.throttle + t * 0.15);
    if (f.pitch < rotationPitchRad) {
      f.pitch = Math.min(rotationPitchRad, f.pitch + rotationRateRadS * t);
    }
  }

  const prevAlt = state._lastAltForClimb ?? f.alt;
  const climbing = f.alt > prevAlt + 0.5;
  state._lastAltForClimb = f.alt;

  if (tk.phase === TAKEOFF_PHASES.LIFTOFF || tk.phase === TAKEOFF_PHASES.INITIAL_CLIMB) {
    f.throttle = Math.min(1, Math.max(0.88, f.throttle));
    if (f.pitch < targetClimbPitchRad) {
      f.pitch = Math.min(targetClimbPitchRad, f.pitch + t * 0.08);
    } else if (f.pitch > targetClimbPitchRad + 0.02) {
      f.pitch = Math.max(targetClimbPitchRad, f.pitch - t * 0.12);
    }
    if (agl > 18 && climbing && f.gearDown && !tk.gearUpDone) {
      f.gearDown = false;
      tk.gearUpDone = true;
    }
  }

  advanceTakeoffPhase(state, agl, climbing);
}

/** Manual takeoff — only phase tracking + hints; pilot flies */
export function updateTakeoff(state) {
  const tk = state.takeoff;
  if (!tk?.speeds || tk.phase === TAKEOFF_PHASES.COMPLETE) return;

  const f = state.flight;
  const agl = state.telemetry?.agl ?? 0;
  const climbing = f.alt > (state._lastAltForClimb ?? f.alt) + 0.3;
  state._lastAltForClimb = f.alt;

  if (tk.phase === TAKEOFF_PHASES.ROTATE && f.onGround && f.speed >= tk.speeds.VR_MPS) {
    if (state.input.pitchUp && f.pitch < tk.rotationPitchRad) {
      /* pilot rotating */
    }
  }

  if (!tk.gearUpDone && !f.onGround && agl > 15 && climbing && !f.gearDown) {
    tk.gearUpDone = true;
  }

  advanceTakeoffPhase(state, agl, climbing);

  const hint = takeoffHint(state);
  if (hint && hint !== state._lastTakeoffHint) {
    state._lastTakeoffHint = hint;
    state.status = hint;
  }
}

/** Ground roll lift — rotate at VR with pitch, leave ground naturally */
export function applyGroundTakeoffPhysics(f, state, dt, terrainAlt) {
  const tk = state.takeoff;
  if (!f.onGround || !tk?.speeds) return;

  const { VR_MPS } = tk.speeds;
  const agl = f.alt - terrainAlt;

  if (f.speed >= VR_MPS * 0.94 && f.pitch >= 0.04) {
    const excess = Math.max(0, f.speed - VR_MPS * 0.9);
    const pitchFactor = Math.min(1, (f.pitch - 0.03) / 0.08);
    const lift = excess * pitchFactor * 0.35 * dt;
    f.alt += lift;
    if (agl > 1.8 && f.throttle > 0.55) {
      f.onGround = false;
    }
  }
}
