import { SPEED_OF_SOUND_MS, MAX_MACH } from "./constants.js";
import { getSpeedCapMps } from "./speed-mode.js";
import { MISSION_PHASES } from "./mission.js";
import { isTakeoffActive, mpsToKt } from "./takeoff.js";

export function drawHud(ctx, width, height, state) {
  const f = state.flight;
  const t = state.telemetry;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(150, 208, 255, 0.75)";
  ctx.lineWidth = 2;
  const cx = width / 2;
  const cy = height / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  const pitchPx = f.pitch * 120;
  for (let deg = -20; deg <= 20; deg += 10) {
    const y = cy + pitchPx - deg * 4;
    ctx.beginPath();
    ctx.moveTo(cx - 70, y);
    ctx.lineTo(cx + 70, y);
    ctx.stroke();
  }

  drawBox(ctx, 16, 16, "GS KT", String(Math.round(t.groundspeedKt)));
  drawBox(ctx, 16, 78, "GS MPH", String(Math.round(t.groundspeedKt * 1.15078)));
  const horizontalMps = t.groundspeedKt / 1.94384;
  const maxMach = getSpeedCapMps(state) / SPEED_OF_SOUND_MS;
  const mach = horizontalMps / SPEED_OF_SOUND_MS;
  const atCap = mach >= maxMach - 0.04;
  const machLabel = state.hyperSpeed && atCap ? String(MAX_MACH) : mach.toFixed(2);
  drawBox(ctx, 16, 140, state.hyperSpeed ? "MACH" : "MACH*", machLabel, atCap);
  const rightInset = 176;
  drawBox(ctx, width - rightInset - 150, 16, "ALT M", String(Math.round(f.alt)));
  drawBox(ctx, 16, height - 72, "AGL M", String(Math.round(t.agl)), t.agl < 30);
  const groundLabel = t.terrain?.nearestAirport || state.airportId || "MSL";
  drawBox(ctx, width / 2 - 75, height - 72, "NEAR", groundLabel, false);
  drawBox(ctx, width - rightInset - 150, height - 72, "THR %", String(Math.round(f.throttle * 100)));
  drawBox(
    ctx,
    width - rightInset - 150,
    height - 136,
    "GEAR",
    f.gearDown ? "DN" : "UP",
    f.gearDown && (t.agl ?? 0) > 80
  );

  ctx.fillStyle = "rgba(6, 18, 30, 0.72)";
  ctx.fillRect(cx - 130, height - 52, 260, 36);
  ctx.strokeStyle = "rgba(113, 176, 255, 0.55)";
  ctx.strokeRect(cx - 130, height - 52, 260, 36);
  ctx.fillStyle = "#cde6ff";
  ctx.font = "12px Inter, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  const hdg = ((f.heading * 180) / Math.PI + 360) % 360;
  const nav = state.telemetry?.navigation;
  const footer =
    state.navTarget && nav
      ? `HDG ${hdg.toFixed(0)}°  ·  → ${state.navTarget.id} ${nav.distKm} km`
      : `HDG ${hdg.toFixed(0)}°  ·  ${f.lat.toFixed(2)}°, ${f.lon.toFixed(2)}°`;
  ctx.fillText(footer, cx, height - 28);
  ctx.textAlign = "start";

  if (state.altitudeHold?.active) {
    drawBox(
      ctx,
      width - rightInset - 150,
      202,
      "HOLD",
      `${Math.round(state.altitudeHold.targetAlt)} m`,
      false
    );
  }

  if (state.flying && isTakeoffActive(state) && state.takeoff?.speeds) {
    drawVSpeedTape(ctx, width, height, state);
  }

  const contacts = state.telemetry?.trafficContacts || [];
  if (contacts.length > 0 && state.flying) {
    drawTrafficTcas(ctx, width, contacts);
  }

  if (state.mission?.active) {
    drawMissionPill(ctx, width, state);
  } else if (!state.flying) {
    drawBanner(
      ctx,
      width,
      height,
      "FLY EARTH",
      "Enter or Fly — W/S throttle · arrows pitch & turn"
    );
  }

  if (f.crashed) {
    drawBanner(ctx, width, height, "CRASH", "Reset airport or restart mission");
  } else if (state.mission?.active && state.mission.phase === MISSION_PHASES.LANDED) {
    drawBanner(ctx, width, height, "LANDED", `${state.mission.originId} → ${state.mission.destId} complete`);
  } else if (state.mission?.active && state.mission.phase === MISSION_PHASES.FAILED) {
    drawBanner(
      ctx,
      width,
      height,
      "MISSION FAILED",
      state.mission.failReason || "Restart mission"
    );
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(4, 12, 24, 0.5)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#e7eefb";
    ctx.textAlign = "center";
    ctx.font = "700 28px Inter, Segoe UI, Arial, sans-serif";
    ctx.fillText("PAUSED", cx, cy);
    ctx.textAlign = "start";
  }
}

function drawVSpeedTape(ctx, width, height, state) {
  const f = state.flight;
  const sp = state.takeoff.speeds;
  const gsKt = mpsToKt(f.speed);
  const x = width - 52;
  const y0 = height * 0.32;
  const h = 140;

  ctx.fillStyle = "rgba(6, 18, 30, 0.88)";
  ctx.fillRect(x - 8, y0 - 8, 56, h + 16);
  ctx.strokeStyle = "rgba(113, 176, 255, 0.5)";
  ctx.strokeRect(x - 8, y0 - 8, 56, h + 16);

  const marks = [
    { kt: sp.V2_KT, label: "V2", color: "#52e0a5" },
    { kt: sp.VR_KT, label: "VR", color: "#5eb8ff" },
    { kt: sp.V1_KT, label: "V1", color: "#9db0cf" },
  ];

  const minKt = sp.V1_KT - 25;
  const maxKt = sp.V2_KT + 35;
  const span = maxKt - minKt;

  for (const m of marks) {
    const py = y0 + h - ((m.kt - minKt) / span) * h;
    ctx.strokeStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + 22, py);
    ctx.stroke();
    ctx.fillStyle = m.color;
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.fillText(m.label, x + 26, py + 4);
    ctx.fillText(String(m.kt), x + 26, py + 14);
  }

  const pyGs = y0 + h - ((gsKt - minKt) / span) * h;
  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.moveTo(x - 6, pyGs);
  ctx.lineTo(x + 18, pyGs - 5);
  ctx.lineTo(x + 18, pyGs + 5);
  ctx.closePath();
  ctx.fill();

  const phase = state.takeoff.phase?.toUpperCase() || "TO";
  ctx.fillStyle = "#cde6ff";
  ctx.font = "9px Inter, sans-serif";
  ctx.fillText(phase, x, y0 - 2);
  ctx.fillText(`${gsKt} kt`, x, y0 + h + 10);
}

function drawTrafficTcas(ctx, width, contacts) {
  const x = width - 168;
  let y = 268;
  ctx.fillStyle = "rgba(6, 18, 30, 0.88)";
  ctx.fillRect(x, y - 14, 158, 14 + contacts.length * 16);
  ctx.strokeStyle = "rgba(113, 176, 255, 0.45)";
  ctx.strokeRect(x, y - 14, 158, 14 + contacts.length * 16);
  ctx.font = "10px Inter, Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#9db0cf";
  ctx.fillText("TCAS", x + 8, y);
  y += 14;
  for (const c of contacts.slice(0, 3)) {
    const arrow = c.verticalSep === "above" ? "↑" : c.verticalSep === "below" ? "↓" : "●";
    ctx.fillStyle =
      c.verticalSep === "above" ? "#5eead4" : c.verticalSep === "below" ? "#ffb347" : "#ffe566";
    ctx.fillText(`${arrow} ${c.label} ${c.km}km ${c.altDelta}`, x + 8, y);
    y += 16;
  }
}

function drawMissionPill(ctx, width, state) {
  const m = state.mission;
  const phase = m.phase.toUpperCase();
  const mode = m.controlMode === "assisted" ? "ASSIST" : "MANUAL";
  const label = `${phase} · ${m.originId}→${m.destId} · ${mode}`;
  ctx.font = "11px Inter, Segoe UI, Arial, sans-serif";
  const tw = ctx.measureText(label).width + 20;
  const x = (width - tw) / 2;
  const y = 12;
  ctx.fillStyle = "rgba(6, 18, 30, 0.85)";
  ctx.strokeStyle = "rgba(113, 176, 255, 0.5)";
  ctx.fillRect(x, y, tw, 22);
  ctx.strokeRect(x, y, tw, 22);
  ctx.fillStyle = "#cde6ff";
  ctx.textAlign = "center";
  ctx.fillText(label, width / 2, y + 15);
  ctx.textAlign = "start";
}

function drawBox(ctx, x, y, label, value, warn = false) {
  ctx.fillStyle = warn ? "rgba(120, 28, 48, 0.75)" : "rgba(7, 20, 34, 0.62)";
  ctx.strokeStyle = warn ? "rgba(255, 117, 142, 0.8)" : "rgba(113, 176, 255, 0.55)";
  ctx.fillRect(x, y, 150, 56);
  ctx.strokeRect(x, y, 150, 56);
  ctx.fillStyle = "rgba(175, 214, 247, 0.9)";
  ctx.font = "11px Inter, Segoe UI, Arial, sans-serif";
  ctx.fillText(label, x + 10, y + 18);
  ctx.fillStyle = "#e7eefb";
  ctx.font = "bold 22px Inter, Segoe UI, Arial, sans-serif";
  ctx.fillText(value, x + 10, y + 43);
}

function drawBanner(ctx, width, height, title, sub) {
  ctx.fillStyle = "rgba(6, 18, 30, 0.88)";
  ctx.fillRect(width / 2 - 200, height * 0.38, 400, 88);
  ctx.strokeStyle = "rgba(94, 167, 255, 0.75)";
  ctx.strokeRect(width / 2 - 200, height * 0.38, 400, 88);
  ctx.fillStyle = "#e7eefb";
  ctx.textAlign = "center";
  ctx.font = "700 22px Inter, Segoe UI, Arial, sans-serif";
  ctx.fillText(title, width / 2, height * 0.38 + 32);
  ctx.font = "14px Inter, Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#b8d4f0";
  ctx.fillText(sub, width / 2, height * 0.38 + 58);
  ctx.textAlign = "start";
}
