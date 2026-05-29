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
  drawBox(ctx, width - 166, 16, "ALT M", String(Math.round(f.alt)));
  drawBox(ctx, 16, height - 72, "AGL M", String(Math.round(t.agl)), t.agl < 30);
  const terrainLabel = t.terrain?.source ? t.terrain.source.toUpperCase() : "ELLIPSOID";
  drawBox(ctx, width / 2 - 75, height - 72, "GROUND", terrainLabel, false);
  drawBox(ctx, width - 166, height - 72, "THR %", String(Math.round(f.throttle * 100)));

  ctx.fillStyle = "rgba(6, 18, 30, 0.72)";
  ctx.fillRect(cx - 130, height - 52, 260, 36);
  ctx.strokeStyle = "rgba(113, 176, 255, 0.55)";
  ctx.strokeRect(cx - 130, height - 52, 260, 36);
  ctx.fillStyle = "#cde6ff";
  ctx.font = "12px Inter, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  const hdg = ((f.heading * 180) / Math.PI + 360) % 360;
  ctx.fillText(
    `HDG ${hdg.toFixed(0)}°  ·  ${f.lat.toFixed(4)}°, ${f.lon.toFixed(4)}°  ·  ${state.airportId}`,
    cx,
    height - 28
  );
  ctx.textAlign = "start";

  if (!state.flying) {
    drawBanner(
      ctx,
      width,
      height,
      "FLY EARTH",
      "Enter or Fly — W/S throttle · arrows pitch & turn · free globe v1"
    );
  }

  if (f.crashed) {
    drawBanner(ctx, width, height, "CRASH", "Select an airport to respawn");
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
