/** Altitude hold — maintains MSL when enabled (key L or UI toggle) */

export function toggleAltitudeHold(state) {
  if (!state.flying || state.flight.crashed || state.flight.onGround) {
    state.status = "Altitude hold works in the air — take off first.";
    return false;
  }

  if (!state.altitudeHold?.active) {
    state.altitudeHold = {
      active: true,
      targetAlt: state.flight.alt,
    };
    state.status = `Cruise HOLD at ${Math.round(state.altitudeHold.targetAlt)} m MSL — press L to release`;
    return true;
  }

  state.altitudeHold = { active: false, targetAlt: null };
  state.status = "Cruise hold OFF — manual pitch/throttle";
  return false;
}

export function setAltitudeHoldTarget(state, altM) {
  if (!state.altitudeHold) state.altitudeHold = { active: false, targetAlt: null };
  state.altitudeHold.targetAlt = altM;
  if (state.altitudeHold.active) {
    state.status = `HOLD target ${Math.round(altM)} m MSL`;
  }
}

export function applyAltitudeHold(state, dt) {
  const hold = state.altitudeHold;
  if (!hold?.active || !state.flying || state.paused || state.flight.crashed || state.flight.onGround) {
    return;
  }

  const f = state.flight;
  const err = hold.targetAlt - f.alt;
  const t = Math.min(0.12, dt) * (state.gameSpeed ?? 1);
  const userPitch = state.input.pitchUp || state.input.pitchDown;

  if (!userPitch) {
    const pitchCmd = Math.max(-0.18, Math.min(0.18, err * 0.0011));
    f.pitch = Math.max(-0.35, Math.min(0.35, f.pitch * 0.9 + pitchCmd * t * 10));
  }

  if (!state.input.throttleUp && !state.input.throttleDown) {
    if (err > 120) f.throttle = Math.min(1, f.throttle + t * 0.25);
    else if (err < -120) f.throttle = Math.max(0.32, f.throttle - t * 0.18);
    else {
      const trim = err > 0 ? t * 0.04 : -t * 0.04;
      f.throttle = Math.max(0.38, Math.min(0.92, f.throttle + trim));
    }
  }
}
