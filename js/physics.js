(() => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getTargetAltitudeMeters(s, c) {
    const dist = Math.max(0, c.MISSION_LANDING_X - s.flight.x);
    return Math.max(12, dist * c.GLIDE_SLOPE);
  }

  function updatePhysics(dt) {
    const s = window.state;
    const f = s.flight;
    const c = window.CONSTANTS;
    const groundY = c.GROUND_Y;

    if (!s.mission.active || s.paused || f.crashed) return;

    const throttleDelta = (s.input.throttleUp ? 1 : 0) - (s.input.throttleDown ? 1 : 0);
    f.throttle = clamp(f.throttle + throttleDelta * dt * 0.45, 0, 1);

    const pitchDelta = (s.input.pitchUp ? 1 : 0) - (s.input.pitchDown ? 1 : 0);
    f.pitch = clamp(f.pitch + pitchDelta * dt * c.PITCH_RATE, -0.55, 0.55);

    const thrust = c.THRUST_FORCE * f.throttle;
    const pitchLift = thrust * Math.sin(Math.max(0, f.pitch)) * 1.15;
    const wingLift = Math.max(0, f.vx - 12) * 0.32;
    let lift = pitchLift + wingLift;
    const drag = c.DRAG_COEFF * f.vx * Math.abs(f.vx);
    const gravity = c.GRAVITY;

    const altitude = Math.max(0, groundY - f.y);

    if (f.onGround && f.throttle > 0.45) {
      f.vy -= (12 + f.throttle * 6) * dt;
      if (f.pitch < 0.22) f.pitch = Math.min(0.22, f.pitch + 0.8 * dt);
    }

    if (s.mission.phase === "cruise" && altitude > c.MAX_ALTITUDE) {
      f.pitch = Math.min(f.pitch, 0.05);
      f.throttle = Math.min(f.throttle, 0.55);
    }

    if (s.mission.phase === "approach" && !f.onGround) {
      const targetAlt = getTargetAltitudeMeters(s, c);
      const targetY = groundY - targetAlt;
      if (f.y < targetY - 8) {
        f.vy += 2.5 * dt;
      } else if (f.y > targetY + 15) {
        lift *= 0.85;
      }
      f.throttle = Math.min(f.throttle, altitude > targetAlt + 25 ? 0.35 : 0.5);
      if (altitude < 25) {
        f.pitch = Math.max(f.pitch, -0.03);
        f.vy = Math.min(f.vy, 14);
      }
      if (altitude < 12) {
        f.vy = Math.min(f.vy, 8);
        f.pitch = Math.max(f.pitch, 0.02);
      }
    }

    f.vx += (thrust * Math.cos(f.pitch) - drag) * dt;
    f.vy += (gravity - lift) * dt;

    const minY = groundY - c.MAX_ALTITUDE;
    if (f.y < minY) {
      f.y = minY;
      f.vy = Math.max(0, f.vy);
    }

    f.x += f.vx * dt;
    f.y += f.vy * dt;

    if (f.onGround && f.y >= groundY - 1 && f.vx >= 16 && f.pitch >= 0.08 && f.throttle >= 0.5) {
      f.y = groundY - 6;
      f.vy = -6;
      f.onGround = false;
    }

    const wasOnGround = f.onGround;

    if (f.y >= groundY) {
      if (!wasOnGround) {
        const sink = Math.max(0, f.vy);
        s.mission.touchdownVy = sink;
        if (s.mission.phase === "approach") {
          if (!f.gearDown && sink > 2) f.crashed = true;
          else if (sink > c.MAX_HARD_SINK) f.crashed = true;
          else if (sink > c.MAX_SAFE_SINK && Math.abs(f.pitch) > 0.5) f.crashed = true;
        } else if (sink > c.MAX_HARD_SINK + 8) {
          f.crashed = true;
        }
      }
      f.y = groundY;
      f.vy = 0;
      f.onGround = true;
    } else {
      f.onGround = false;
    }
  }

  window.getTargetAltitudeMeters = getTargetAltitudeMeters;
  window.updatePhysics = updatePhysics;
})();
