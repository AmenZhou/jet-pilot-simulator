(() => {
  function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawWorld(ctx, width, height) {
    const s = window.state;
    const f = s.flight;
    const cam = s.camera;
    const speedRatio = Math.min(1.4, Math.max(0, f.vx / 60));
    cam.time += 0.016;
    const turbulence = Math.max(0, (f.y < 220 ? 0.6 : 0.2) + speedRatio * 0.5);
    cam.shakeX = Math.sin(cam.time * 18.0) * turbulence * window.CONSTANTS.CAMERA_SHAKE_MAX * 0.18;
    cam.shakeY = Math.cos(cam.time * 22.0) * turbulence * window.CONSTANTS.CAMERA_SHAKE_MAX * 0.12;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(cam.shakeX, cam.shakeY);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#0f2747");
    sky.addColorStop(1, "#24628f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#1f2937";
    const horizonY = 210 + f.pitch * 30;
    ctx.fillRect(0, horizonY + 50, width, height - (horizonY + 50));

    const cloudParallax = -((f.x * 0.25) % (width + 160));
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    for (let i = 0; i < 6; i += 1) {
      const cx = cloudParallax + i * 220;
      const cy = 70 + (i % 2) * 24 - f.pitch * 20;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 56, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#f3f4f6";
    ctx.setLineDash([12, 12]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const runwayY = 300 + f.pitch * 36;
    const runwayShift = -((f.x * (0.8 + speedRatio)) % 48);
    ctx.moveTo(0, runwayY);
    ctx.lineTo(width, runwayY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(230, 240, 255, 0.5)";
    ctx.lineWidth = 1;
    for (let x = runwayShift; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, runwayY - 8);
      ctx.lineTo(x + 18, runwayY - 8);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(f.x, f.y - 20);
    ctx.rotate(f.pitch);
    ctx.fillStyle = f.crashed ? "#ef4444" : "#e5e7eb";
    ctx.fillRect(-24, -6, 48, 12);
    ctx.fillRect(-10, -12, 20, 24);
    ctx.restore();
    ctx.restore();
  }

  window.resizeCanvas = resizeCanvas;
  window.drawWorld = drawWorld;
})();
