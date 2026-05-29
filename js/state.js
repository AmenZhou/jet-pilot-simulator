(() => {
  const defaultState = () => ({
    cash: window.CONSTANTS.STARTING_CASH,
    reputation: window.CONSTANTS.STARTING_REPUTATION,
    gameSpeed: 1,
    paused: false,
    ui: {
      minimalHud: false,
      startup: {
        active: true,
        phase: "cold-start",
        progress: 0,
      },
    },
    mission: {
      active: false,
      phase: "idle",
      score: 0,
      groundRoll: 0,
      touchdownVy: 0,
      debrief: "Start a training sortie when systems are online.",
    },
    camera: {
      shakeX: 0,
      shakeY: 0,
      time: 0,
    },
    flight: {
      x: 120,
      y: 260,
      vx: 24,
      vy: 0,
      pitch: 0,
      throttle: 0.5,
      gearDown: true,
      flaps: 0,
      onGround: true,
      crashed: false,
    },
    input: {
      throttleUp: false,
      throttleDown: false,
      pitchUp: false,
      pitchDown: false,
    },
  });

  const state = defaultState();

  function resetForMission() {
    state.mission.active = true;
    state.mission.phase = "takeoff";
    state.mission.score = 0;
    state.mission.groundRoll = 0;
    state.mission.touchdownVy = 0;
    state.mission.debrief = "Sortie active — full throttle, rotate at 22m.";
    state.flight.x = 0;
    state.flight.y = 260;
    state.flight.vx = 18;
    state.flight.vy = 0;
    state.flight.pitch = 0.1;
    state.flight.throttle = 0.75;
    state.flight.gearDown = true;
    state.flight.flaps = 1;
    state.flight.onGround = true;
    state.flight.crashed = false;
  }

  function saveGame() {
    localStorage.setItem("jet-pilot-sim-save", JSON.stringify(state));
  }

  function loadGame() {
    const raw = localStorage.getItem("jet-pilot-sim-save");
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
      return true;
    } catch (_err) {
      return false;
    }
  }

  window.state = state;
  window.resetForMission = resetForMission;
  window.saveGame = saveGame;
  window.loadGame = loadGame;
})();
