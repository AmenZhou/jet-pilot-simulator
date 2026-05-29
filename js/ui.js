(() => {
  const ui = {
    cockpitViewport: null,
    hudCanvas: null,
    hudCtx: null,
    cashValue: null,
    reputationValue: null,
    missionValue: null,
    missionDebrief: null,
    hudModeBtn: null,
    lastTs: 0,
  };

  function getPhaseLabel(phase) {
    switch (phase) {
      case "takeoff": return "Takeoff";
      case "cruise": return "Cruise";
      case "approach": return "Approach";
      case "landed": return "Landed";
      case "failed": return "Failed";
      default: return "Idle";
    }
  }

  function syncUI() {
    const s = window.state;
    ui.cashValue.textContent = `$${Math.round(s.cash).toLocaleString()}`;
    ui.reputationValue.textContent = String(Math.round(s.reputation));
    ui.missionValue.textContent = s.ui.startup.active ? "Booting..." : getPhaseLabel(s.mission.phase);
    if (ui.missionDebrief) {
      ui.missionDebrief.textContent = s.mission.debrief || "";
    }
    ui.hudModeBtn.textContent = s.ui.minimalHud ? "HUD Mode: Minimal" : "HUD Mode: Full";
  }

  function updateStartup(dt) {
    const startup = window.state.ui.startup;
    if (!startup.active) return;

    startup.progress = Math.min(1, startup.progress + dt / 3.2);
    if (startup.progress < 0.3) {
      startup.phase = "cold-start";
    } else if (startup.progress < 0.62) {
      startup.phase = "engine-spool";
    } else if (startup.progress < 0.95) {
      startup.phase = "avionics-sync";
    } else {
      startup.phase = "systems-online";
    }

    if (startup.progress >= 1) {
      startup.active = false;
      window.state.mission.debrief =
        "Systems online — press Enter or click Start Training Sortie. W/S throttle, arrows pitch.";
      window.AudioEngine.success();
    }
  }

  function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function resizeAll() {
    if (window.Cockpit3D?.isReady()) window.Cockpit3D.resize();
    ui.hudCtx = resizeCanvas(ui.hudCanvas);
  }

  function frame(ts) {
    if (!ui.lastTs) ui.lastTs = ts;
    const dt = Math.min(0.05, (ts - ui.lastTs) / 1000) * window.state.gameSpeed;
    ui.lastTs = ts;
    updateStartup(dt);

    window.updatePhysics(dt);
    window.updateMission(dt);

    const width = ui.cockpitViewport.clientWidth;
    const height = ui.cockpitViewport.clientHeight;
    if (window.Cockpit3D?.isReady()) {
      window.Cockpit3D.update(dt);
      window.Cockpit3D.render();
    }
    window.drawHUD(ui.hudCtx, width, height);
    syncUI();
    requestAnimationFrame(frame);
  }

  function bindButtons() {
    const startMissionBtn = document.getElementById("startMissionBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const saveBtn = document.getElementById("saveBtn");
    const loadBtn = document.getElementById("loadBtn");
    const hudModeBtn = document.getElementById("hudModeBtn");

    startMissionBtn.addEventListener("click", () => {
      if (window.state.ui.startup.active) {
        window.AudioEngine.warning();
        return;
      }
      window.startMission();
      window.AudioEngine.click();
    });

    pauseBtn.addEventListener("click", () => {
      if (window.state.ui.startup.active) return;
      window.state.paused = !window.state.paused;
      window.AudioEngine.click();
    });

    saveBtn.addEventListener("click", () => {
      window.saveGame();
      window.AudioEngine.success();
    });

    loadBtn.addEventListener("click", () => {
      window.loadGame();
      window.AudioEngine.success();
      syncUI();
    });

    hudModeBtn.addEventListener("click", () => {
      if (window.state.ui.startup.active) return;
      window.state.ui.minimalHud = !window.state.ui.minimalHud;
      window.AudioEngine.click();
      syncUI();
    });
  }

  function bootstrap() {
    ui.cockpitViewport = document.getElementById("cockpitViewport");
    ui.hudCanvas = document.getElementById("hudCanvas");
    window.Cockpit3D.init(ui.cockpitViewport);
    ui.cashValue = document.getElementById("cashValue");
    ui.reputationValue = document.getElementById("reputationValue");
    ui.missionValue = document.getElementById("missionValue");
    ui.missionDebrief = document.getElementById("missionDebrief");
    ui.hudModeBtn = document.getElementById("hudModeBtn");

    resizeAll();
    bindButtons();
    window.addEventListener("resize", resizeAll);
    window.AudioEngine.startupSweep();
    setTimeout(() => window.AudioEngine.startupSweep(), 520);
    syncUI();
    requestAnimationFrame(frame);
  }

  window.addEventListener("DOMContentLoaded", bootstrap);
})();
