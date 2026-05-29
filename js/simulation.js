(() => {
  function setPhase(phase) {
    const prev = window.state.mission.phase;
    window.state.mission.phase = phase;
    if (prev !== phase) {
      if (phase === "failed") {
        window.AudioEngine.warning();
      } else if (phase === "landed") {
        window.AudioEngine.success();
      } else {
        window.AudioEngine.click();
      }
    }
  }

  function completeLanding(s, f, c) {
    const pitchPenalty = Math.round(Math.abs(f.pitch) * 35);
    const sinkPenalty = Math.round(Math.max(0, s.mission.touchdownVy - 10) * 2.5);
    const gearBonus = f.gearDown ? 0 : 25;
    s.mission.score = Math.max(0, 100 - pitchPenalty - sinkPenalty - gearBonus);
    s.cash += c.MISSION_PAYOUT_BASE + s.mission.score * 6;
    s.reputation = Math.min(100, s.reputation + (s.mission.score >= 70 ? 2 : 1));
    s.mission.active = false;
    s.mission.debrief = `Touchdown sink ${s.mission.touchdownVy.toFixed(1)} · Pitch ${(f.pitch * 57).toFixed(0)}° · Payout +$${c.MISSION_PAYOUT_BASE + s.mission.score * 6}`;
    setPhase("landed");
  }

  function startMission() {
    window.resetForMission();
    window.state.mission.debrief = "Sortie active — rotate at 22m, intercept glide at 460m, land past 500m with gear down.";
    window.AudioEngine.success();
  }

  function updateMission(dt) {
    const s = window.state;
    const f = s.flight;
    const c = window.CONSTANTS;
    if (!s.mission.active || s.paused) return;

    if (f.crashed) {
      setPhase("failed");
      s.cash = Math.max(0, s.cash - c.CRASH_PENALTY);
      s.reputation = Math.max(0, s.reputation - 8);
      s.mission.active = false;
      const reason = !f.gearDown
        ? "Gear up on touchdown"
        : s.mission.touchdownVy > c.MAX_SAFE_SINK
          ? `Sink rate too high (${s.mission.touchdownVy.toFixed(1)})`
          : "Hard landing";
      s.mission.debrief = `Sortie failed — ${reason}. Penalty $${c.CRASH_PENALTY}.`;
      return;
    }

    const altitude = Math.max(0, c.GROUND_Y - f.y);

    if (s.mission.phase === "takeoff" && !f.onGround && altitude >= c.TAKEOFF_ALTITUDE) {
      setPhase("cruise");
    } else if (s.mission.phase === "cruise" && f.x >= c.MISSION_CRUISE_X) {
      setPhase("approach");
      s.mission.debrief = "Approach — gear down, follow HUD glide path to runway.";
    } else if (s.mission.phase === "approach") {
      if (f.onGround) {
        if (f.x >= c.LANDING_ZONE_X) {
          s.mission.groundRoll += dt;
        }
        const inZone = f.x >= c.MISSION_LANDING_X - 15;
        const rolled = s.mission.groundRoll >= c.GROUND_ROLL_SEC;
        const safeSink = s.mission.touchdownVy <= c.MAX_SAFE_SINK;

        if (inZone && rolled && f.gearDown && safeSink) {
          completeLanding(s, f, c);
        } else if (inZone && rolled && (!f.gearDown || !safeSink)) {
          f.crashed = true;
        }
      } else {
        s.mission.groundRoll = 0;
      }
    }

    if (s.mission.active && dt > 0) {
      s.cash = Math.max(0, s.cash - 0.25 * dt);
    }
  }

  window.startMission = startMission;
  window.updateMission = updateMission;
})();
