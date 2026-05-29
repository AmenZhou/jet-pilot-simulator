import { PHYSICS } from "./constants.js";

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
  f.heading = (f.heading + yawDelta * dt * PHYSICS.YAW_RATE + Math.PI * 2) % (Math.PI * 2);

  const thrust = PHYSICS.THRUST * f.throttle;
  const drag =
    PHYSICS.DRAG * f.speed * f.speed +
    (f.gearDown ? PHYSICS.GEAR_DRAG * f.speed : 0);
  f.speed = clamp(f.speed + (thrust - drag) * dt, PHYSICS.MIN_SPEED, PHYSICS.MAX_SPEED);

  const climb = f.speed * Math.sin(f.pitch);
  const horizontal = f.speed * Math.cos(f.pitch);
  f.alt += climb * dt;

  f.roll = clamp(-yawDelta * 0.35, -0.45, 0.45);

  const agl = f.alt - terrainAlt;
  state.telemetry.agl = agl;
  state.telemetry.terrainAlt = terrainAlt;
  state.telemetry.groundspeedKt = horizontal * 1.94384;

  if (f.onGround && f.throttle > 0.5 && f.speed > 22 && f.pitch > 0.04) {
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
  f.alt = carto.height;
}
