import { beginFlight, spawnAtAirport } from "./state.js";

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

export function bindPanel(state, elements, { flyToAirport, onChange }) {
  elements.flyBtn.addEventListener("click", () => {
    beginFlight(state);
    onChange();
  });

  elements.pauseBtn.addEventListener("click", () => {
    if (!state.flying) return;
    state.paused = !state.paused;
    onChange();
  });

  elements.chaseBtn.addEventListener("click", () => {
    state.showChase = !state.showChase;
    onChange();
  });

  elements.airportSelect.addEventListener("change", () => {
    const id = elements.airportSelect.value;
    spawnAtAirport(state, id);
    flyToAirport(id);
    onChange();
  });

  document.querySelectorAll("[data-airport]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-airport");
      elements.airportSelect.value = id;
      spawnAtAirport(state, id);
      flyToAirport(id);
      onChange();
    });
  });
}
