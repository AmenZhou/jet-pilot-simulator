import { PHYSICS } from "./constants.js";
import { applyGroundTakeoffPhysics, isTakeoffActive } from "./takeoff.js";
import { getPhysicsCoeffs } from "./speed-mode.js";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function updateFlightPhysics(state, dt, terrainAlt) {
  const f = state.flight;
  if (!state.flying || state.paused || f.crashed) return;

  const throttleDelta =
    (state.input.throttleUp ? 1 : 0) - (state.input.throttleDown ? 1 : 0);
  f.throttle = clamp(f.throttle + throttleDelta * dt * PHYSICS.THROTTLE_RATE, 0, 1);

  const pitchDelta =
    (state.input.pitchUp ? 1 : 0) - (state.input.pitchDown ? 1 : 0);
  f.pitch = clamp(f.pitch + pitchDelta * dt * PHYSICS.PITCH_RATE, PHYSICS.MIN_PITCH, PHYSICS.MAX_PITCH);

  const yawDelta =
    (state.input.yawLeft ? 1 : 0) - (state.input.yawRight ? 1 : 0);
  const prevHeading = f._prevHeading ?? f.heading;
  f.heading = (f.heading + yawDelta * dt * PHYSICS.YAW_RATE + Math.PI * 2) % (Math.PI * 2);
  const hdgDelta = Math.atan2(
    Math.sin(f.heading - prevHeading),
    Math.cos(f.heading - prevHeading)
  );
  if (Math.abs(hdgDelta) > 0.00001) {
    f.roll = clamp(-hdgDelta * 7, -0.45, 0.45);
  } else if (yawDelta !== 0) {
    f.roll = clamp(-yawDelta * 0.35, -0.45, 0.45);
  } else {
    f.roll = clamp(f.roll * 0.94, -0.45, 0.45);
  }
  f._prevHeading = f.heading;

  const coeffs = getPhysicsCoeffs(state);
  const thrust = coeffs.thrust * f.throttle;
  const groundExtra = f.onGround ? coeffs.groundFriction * f.speed : 0;
  const drag =
    coeffs.drag * f.speed * f.speed +
    (f.gearDown ? coeffs.gearDrag * f.speed : 0) +
    groundExtra;
  f.speed = clamp(
    f.speed + (thrust - drag) * dt,
    PHYSICS.MIN_SPEED,
    coeffs.maxSpeed
  );

  const climb = f.speed * Math.sin(f.pitch);
  const horizontal = f.speed * Math.cos(f.pitch);
  f.alt += climb * dt;

  const agl = f.alt - terrainAlt;
  state.telemetry.agl = agl;
  state.telemetry.terrainAlt = terrainAlt;
  state.telemetry.groundspeedKt = horizontal * 1.94384;

  if (isTakeoffActive(state)) {
    applyGroundTakeoffPhysics(f, state, dt, terrainAlt);
  } else if (f.onGround && f.throttle > 0.55 && f.speed > 68 && f.pitch > 0.05) {
    f.onGround = false;
  }

  if (agl < 1.5 && !f.onGround && climb < -PHYSICS.CRASH_SINK) {
    f.crashed = true;
    state.status = "Terrain impact — pick an airport to reset.";
    return;
  }

  const clearance = PHYSICS.GROUND_CLEARANCE;
  if (agl <= clearance + 0.2) {
    f.alt = terrainAlt + clearance;
    if (climb < -4) {
      f.crashed = true;
      state.status = "Hard landing — pick an airport to reset.";
      return;
    }
    f.onGround = true;
    if (f.pitch < 0) f.pitch = 0;
  } else if (agl < 8 && f.speed < 40 && isTakeoffActive(state)) {
    f.onGround = true;
  } else {
    f.onGround = false;
  }

  return { horizontal, dt };
}

export function moveAlongHeading(f, horizontal, dt, Cesium) {
  const east = Math.sin(f.heading) * horizontal * dt;
  const north = Math.cos(f.heading) * horizontal * dt;
  const up = 0;

  const origin = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt);
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const delta = new Cesium.Cartesian3(east, north, up);
  const next = Cesium.Matrix4.multiplyByPoint(transform, delta, new Cesium.Cartesian3());
  const carto = Cesium.Cartographic.fromCartesian(next);

  f.lon = Cesium.Math.toDegrees(carto.longitude);
  f.lat = Cesium.Math.toDegrees(carto.latitude);
  // Keep pilot altitude — carto.height is ellipsoid/geoid and jumps on horizontal moves.
}
