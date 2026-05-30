import { beginFlight, spawnAtAirport, AIRPORTS } from "./state.js";
import { cancelMission, setControlMode } from "./mission.js";
import { adjustCameraZoom } from "./cesium-view.js";
import { toggleAltitudeHold } from "./cruise-hold.js";
import { toggleHyperSpeed } from "./speed-mode.js";

export function bindInput(state, onChange) {
  function down(event) {
    if (event.code === "Enter" && !state.flying) {
      beginFlight(state);
      onChange();
      event.preventDefault();
      return;
    }

    if (!state.flying || state.flight.crashed) return;

    switch (event.code) {
      case "KeyW":
        state.input.throttleUp = true;
        break;
      case "KeyS":
        state.input.throttleDown = true;
        break;
      case "ArrowUp":
        state.input.pitchUp = true;
        break;
      case "ArrowDown":
        state.input.pitchDown = true;
        break;
      case "ArrowLeft":
        state.input.yawLeft = true;
        break;
      case "ArrowRight":
        state.input.yawRight = true;
        break;
      case "KeyG":
        state.flight.gearDown = !state.flight.gearDown;
        break;
      case "Space":
        state.paused = !state.paused;
        break;
      case "BracketLeft":
      case "Minus":
        adjustCameraZoom(state, -1);
        onChange();
        break;
      case "BracketRight":
      case "Equal":
        adjustCameraZoom(state, 1);
        onChange();
        break;
      case "KeyL":
        toggleAltitudeHold(state);
        onChange();
        break;
      case "KeyM":
        toggleHyperSpeed(state);
        onChange();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function up(event) {
    switch (event.code) {
      case "KeyW":
        state.input.throttleUp = false;
        break;
      case "KeyS":
        state.input.throttleDown = false;
        break;
      case "ArrowUp":
        state.input.pitchUp = false;
        break;
      case "ArrowDown":
        state.input.pitchDown = false;
        break;
      case "ArrowLeft":
        state.input.yawLeft = false;
        break;
      case "ArrowRight":
        state.input.yawRight = false;
        break;
      default:
        return;
    }
  }

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);

  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}

export function bindPanel(state, elements, { flyToAirport, onChange, startMissionFromPanel }) {
  elements.flyBtn.addEventListener("click", () => {
    beginFlight(state);
    onChange();
  });

  if (elements.missionBtn && startMissionFromPanel) {
    elements.missionBtn.addEventListener("click", () => {
      startMissionFromPanel();
    });
  }

  if (elements.cancelMissionBtn) {
    elements.cancelMissionBtn.addEventListener("click", () => {
      cancelMission(state);
      onChange();
    });
  }

  if (elements.controlModeSelect) {
    elements.controlModeSelect.addEventListener("change", () => {
      setControlMode(state, elements.controlModeSelect.value);
      onChange();
    });
  }

  if (elements.navSelect) {
    elements.navSelect.addEventListener("change", () => {
      const id = elements.navSelect.value;
      if (!id) {
        state.navTarget = null;
        state.navOrigin = null;
        state.status = "Navigation cleared.";
      } else {
        const ap = AIRPORTS[id];
        if (ap) {
          window.__earthAgent.setNavTarget({
            id: ap.id,
            name: ap.name,
            lat: ap.lat,
            lon: ap.lon,
          });
        }
      }
      onChange();
    });
  }

  elements.pauseBtn.addEventListener("click", () => {
    if (!state.flying) return;
    state.paused = !state.paused;
    onChange();
  });

  elements.chaseBtn.addEventListener("click", () => {
    state.showChase = !state.showChase;
    onChange();
  });

  if (elements.holdBtn) {
    elements.holdBtn.addEventListener("click", () => {
      if (!state.flying) return;
      toggleAltitudeHold(state);
      onChange();
    });
  }

  if (elements.hyperBtn) {
    elements.hyperBtn.addEventListener("click", () => {
      if (!state.flying) return;
      toggleHyperSpeed(state);
      onChange();
    });
  }

  elements.airportSelect.addEventListener("change", () => {
    const id = elements.airportSelect.value;
    if (state.mission?.active) cancelMission(state);
    spawnAtAirport(state, id);
    flyToAirport(id);
    onChange();
  });

  document.querySelectorAll("[data-airport]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-airport");
      elements.airportSelect.value = id;
      if (state.mission?.active) cancelMission(state);
      spawnAtAirport(state, id);
      flyToAirport(id);
      onChange();
    });
  });
}
