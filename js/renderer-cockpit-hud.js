(() => {
  function drawLadder(ctx, width, height, pitch) {
    const centerX = width / 2;
    const centerY = height / 2;
    const pxPerRad = 140;
    ctx.strokeStyle = "rgba(150, 208, 255, 0.8)";
    ctx.lineWidth = 2;
    for (let deg = -30; deg <= 30; deg += 10) {
      const y = centerY + ((pitch * 180) / Math.PI - deg) * (pxPerRad / 20);
      ctx.beginPath();
      ctx.moveTo(centerX - 80, y);
      ctx.lineTo(centerX + 80, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(188, 229, 255, 0.9)";
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.fillText(String(deg), centerX + 88, y + 4);
      ctx.fillText(String(deg), centerX - 106, y + 4);
    }
  }

  function drawDataBox(ctx, x, y, label, value, warning) {
    ctx.fillStyle = warning ? "rgba(120, 28, 48, 0.75)" : "rgba(7, 20, 34, 0.62)";
    ctx.strokeStyle = warning ? "rgba(255, 117, 142, 0.8)" : "rgba(113, 176, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, 150, 56);
    ctx.strokeRect(x, y, 150, 56);
    ctx.fillStyle = "rgba(175, 214, 247, 0.9)";
    ctx.font = "11px Inter, Arial, sans-serif";
    ctx.fillText(label, x + 10, y + 18);
    ctx.fillStyle = "#e7eefb";
    ctx.font = "bold 22px Inter, Arial, sans-serif";
    ctx.fillText(value, x + 10, y + 43);
  }

  function drawApproachGuide(ctx, width, height, s, f) {
    if (s.mission.phase !== "approach" && s.mission.phase !== "takeoff") return;
    const c = window.CONSTANTS;
    const altitude = Math.max(0, c.GROUND_Y - f.y);
    const dist = Math.max(0, c.MISSION_LANDING_X - f.x);
    const targetAlt = window.getTargetAltitudeMeters
      ? window.getTargetAltitudeMeters(s, c)
      : Math.max(12, dist * c.GLIDE_SLOPE);
    const glideOk = Math.abs(altitude - targetAlt) < 22;
    const gearOk = f.gearDown;

    ctx.fillStyle = "rgba(6, 18, 30, 0.72)";
    ctx.fillRect(width / 2 - 110, height - 118, 220, 72);
    ctx.strokeStyle = glideOk ? "rgba(82, 224, 165, 0.8)" : "rgba(255, 180, 90, 0.85)";
    ctx.strokeRect(width / 2 - 110, height - 118, 220, 72);

    ctx.fillStyle = "#cde6ff";
    ctx.font = "11px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`DIST ${Math.round(dist)} m  ·  TGT ALT ${Math.round(targetAlt)} m`, width / 2, height - 98);
    ctx.fillText(`GLIDE ${glideOk ? "ON" : "ADJUST"}  ·  GEAR ${gearOk ? "DOWN" : "DOWN NOW"}`, width / 2, height - 82);

    const barX = width / 2 - 80;
    const barY = height - 68;
    ctx.fillStyle = "rgba(40, 60, 90, 0.8)";
    ctx.fillRect(barX, barY, 160, 8);
    const markerX = barX + (altitude / Math.max(targetAlt, 1)) * 80;
    ctx.fillStyle = glideOk ? "#52e0a5" : "#ffb347";
    ctx.fillRect(Math.max(barX, Math.min(barX + 152, markerX - 4)), barY - 2, 8, 12);
    ctx.textAlign = "start";
  }

  function drawHUD(ctx, width, height) {
    const s = window.state;
    const f = s.flight;
    const c = window.CONSTANTS;
    ctx.clearRect(0, 0, width, height);

    drawLadder(ctx, width, height, f.pitch);
    const minimalHud = Boolean(s.ui && s.ui.minimalHud);

    const speed = Math.max(0, Math.round(f.vx));
    const altitude = Math.max(0, Math.round(c.GROUND_Y - f.y));
    drawDataBox(ctx, 18, 18, "AIRSPEED", `${speed} kt`, speed < 16);
    drawDataBox(ctx, width - 168, 18, "ALTITUDE", `${altitude} m`, altitude < 8 && !f.onGround);
    if (!minimalHud) {
      drawDataBox(ctx, 18, height - 76, "THROTTLE", `${Math.round(f.throttle * 100)}%`, false);
      drawDataBox(ctx, width - 168, height - 76, "GEAR / FLAPS", `${f.gearDown ? "DOWN" : "UP"} / ${f.flaps}`, !f.gearDown && altitude < 10);
    }

    ctx.strokeStyle = "rgba(115, 197, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 28, height / 2);
    ctx.lineTo(width / 2 - 8, height / 2);
    ctx.moveTo(width / 2 + 8, height / 2);
    ctx.lineTo(width / 2 + 28, height / 2);
    ctx.stroke();

    drawApproachGuide(ctx, width, height, s, f);

    if (s.mission.phase === "landed") {
      ctx.fillStyle = "rgba(17, 48, 40, 0.82)";
      ctx.fillRect(width / 2 - 160, height * 0.34, 320, 72);
      ctx.strokeStyle = "rgba(82, 224, 165, 0.8)";
      ctx.strokeRect(width / 2 - 160, height * 0.34, 320, 72);
      ctx.fillStyle = "#cdfbe8";
      ctx.textAlign = "center";
      ctx.font = "bold 24px Inter, Arial, sans-serif";
      ctx.fillText(`LANDED — Score ${s.mission.score}`, width / 2, height * 0.37 + 8);
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.fillText(s.mission.debrief || "Sortie complete", width / 2, height * 0.37 + 30, 280);
      ctx.textAlign = "start";
    }

    if (s.mission.phase === "failed") {
      ctx.fillStyle = "rgba(80, 20, 32, 0.78)";
      ctx.fillRect(width / 2 - 160, height * 0.34, 320, 64);
      ctx.strokeStyle = "rgba(255, 120, 140, 0.85)";
      ctx.strokeRect(width / 2 - 160, height * 0.34, 320, 64);
      ctx.fillStyle = "#ffdbe1";
      ctx.textAlign = "center";
      ctx.font = "bold 22px Inter, Arial, sans-serif";
      ctx.fillText("SORTIE FAILED", width / 2, height * 0.37 + 6);
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.fillText(s.mission.debrief || "Crash", width / 2, height * 0.37 + 28, 300);
      ctx.textAlign = "start";
    }

    if (minimalHud) {
      ctx.fillStyle = "rgba(6, 18, 30, 0.55)";
      ctx.fillRect(width / 2 - 124, height - 44, 248, 28);
      ctx.strokeStyle = "rgba(113, 176, 255, 0.55)";
      ctx.strokeRect(width / 2 - 124, height - 44, 248, 28);
      ctx.fillStyle = "rgba(206, 232, 255, 0.95)";
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`THR ${Math.round(f.throttle * 100)}%   GEAR ${f.gearDown ? "DN" : "UP"}   FLAPS ${f.flaps}`, width / 2, height - 25);
      ctx.textAlign = "start";
    }

    if (f.crashed && s.mission.phase !== "failed") {
      ctx.fillStyle = "rgba(255, 92, 115, 0.22)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffdbe1";
      ctx.font = "bold 42px Inter, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CRASH", width / 2, height / 2 - 8);
      ctx.textAlign = "start";
    }

    if (!s.mission.active && !(s.ui && s.ui.startup && s.ui.startup.active)) {
      ctx.fillStyle = "rgba(4, 12, 24, 0.45)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(6, 18, 30, 0.88)";
      ctx.fillRect(width / 2 - 200, height * 0.38, 400, 88);
      ctx.strokeStyle = "rgba(94, 167, 255, 0.75)";
      ctx.strokeRect(width / 2 - 200, height * 0.38, 400, 88);
      ctx.fillStyle = "#e7eefb";
      ctx.textAlign = "center";
      ctx.font = "700 22px Inter, Arial, sans-serif";
      ctx.fillText("READY FOR SORTIE", width / 2, height * 0.38 + 32);
      ctx.font = "14px Inter, Arial, sans-serif";
      ctx.fillStyle = "#b8d4f0";
      ctx.fillText("Enter or Start Training Sortie — then W/S and arrow keys", width / 2, height * 0.38 + 58);
      ctx.textAlign = "start";
    }

    if (s.ui && s.ui.startup && s.ui.startup.active) {
      const startup = s.ui.startup;
      ctx.fillStyle = "rgba(4, 12, 24, 0.58)";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(94, 167, 255, 0.65)";
      ctx.strokeRect(width * 0.18, height * 0.42, width * 0.64, 66);
      ctx.fillStyle = "rgba(92, 188, 255, 0.3)";
      ctx.fillRect(width * 0.18 + 2, height * 0.42 + 2, (width * 0.64 - 4) * startup.progress, 62);

      ctx.fillStyle = "#cde6ff";
      ctx.textAlign = "center";
      ctx.font = "700 20px Inter, Arial, sans-serif";
      ctx.fillText("COCKPIT BOOT SEQUENCE", width / 2, height * 0.35);
      ctx.font = "14px Inter, Arial, sans-serif";
      ctx.fillText(`Phase: ${startup.phase.toUpperCase()}  |  ${Math.round(startup.progress * 100)}%`, width / 2, height * 0.54);
      ctx.font = "12px Inter, Arial, sans-serif";
      ctx.fillStyle = "rgba(185, 221, 255, 0.9)";
      ctx.fillText("Controls unlock after systems online", width / 2, height * 0.59);
      ctx.textAlign = "start";
    }
  }

  window.drawHUD = drawHUD;
})();
