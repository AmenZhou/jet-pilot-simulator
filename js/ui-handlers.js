(() => {
  function onKeyDown(event) {
    const s = window.state;
    if (!s) return;
    if (s.ui && s.ui.startup && s.ui.startup.active) return;

    if (event.code === "Enter" && !s.mission.active) {
      window.startMission();
      window.AudioEngine.click();
      event.preventDefault();
      return;
    }

    if (!s.mission.active) {
      if (["KeyW", "KeyS", "ArrowUp", "ArrowDown", "KeyG", "KeyF"].includes(event.code)) {
        window.AudioEngine.warning();
        event.preventDefault();
      }
      return;
    }

    switch (event.code) {
      case "KeyW":
        s.input.throttleUp = true;
        break;
      case "KeyS":
        s.input.throttleDown = true;
        break;
      case "ArrowUp":
        s.input.pitchUp = true;
        break;
      case "ArrowDown":
        s.input.pitchDown = true;
        break;
      case "KeyG":
        s.flight.gearDown = !s.flight.gearDown;
        window.AudioEngine.click();
        break;
      case "KeyF":
        s.flight.flaps = (s.flight.flaps + 1) % (window.CONSTANTS.MAX_FLAPS + 1);
        window.AudioEngine.click();
        break;
      case "Space":
        s.paused = !s.paused;
        window.AudioEngine.click();
        break;
      case "KeyH":
        s.ui.minimalHud = !s.ui.minimalHud;
        window.AudioEngine.click();
        break;
      default:
        break;
    }
  }

  function onKeyUp(event) {
    const s = window.state;
    if (!s) return;
    switch (event.code) {
      case "KeyW":
        s.input.throttleUp = false;
        break;
      case "KeyS":
        s.input.throttleDown = false;
        break;
      case "ArrowUp":
        s.input.pitchUp = false;
        break;
      case "ArrowDown":
        s.input.pitchDown = false;
        break;
      default:
        break;
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
})();
