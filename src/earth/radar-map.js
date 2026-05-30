/** Top-right heading-up radar — tile map, you at center, destination as green blip */

const TILE_SIZE = 256;
const TILE_URL = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const tilePromises = new Map();
const tileImages = new Map();

function latLonToWorldPx(lat, lon, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function pickZoom(speedMps) {
  if (speedMps > 1200) return 6;
  if (speedMps > 400) return 7;
  if (speedMps > 120) return 8;
  if (speedMps > 30) return 9;
  return 10;
}

function tileKey(z, x, y) {
  const n = 2 ** z;
  const wrappedX = ((x % n) + n) % n;
  return `${z}/${wrappedX}/${y}`;
}

function ensureTile(z, x, y) {
  const key = tileKey(z, x, y);
  if (tileImages.has(key)) return Promise.resolve(tileImages.get(key));
  if (tilePromises.has(key)) return tilePromises.get(key);

  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      tileImages.set(key, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    const n = 2 ** z;
    const wrappedX = ((x % n) + n) % n;
    img.src = TILE_URL.replace("{z}", String(z))
      .replace("{x}", String(wrappedX))
      .replace("{y}", String(y));
  });
  tilePromises.set(key, p);
  return p;
}

function prefetchTiles(lat, lon, zoom, radiusPx) {
  const center = latLonToWorldPx(lat, lon, zoom);
  const half = Math.ceil(radiusPx / TILE_SIZE) + 1;
  const tileX0 = Math.floor(center.x / TILE_SIZE) - half;
  const tileY0 = Math.floor(center.y / TILE_SIZE) - half;
  const tileX1 = tileX0 + half * 2 + 1;
  const tileY1 = tileY0 + half * 2 + 1;
  for (let ty = tileY0; ty <= tileY1; ty++) {
    for (let tx = tileX0; tx <= tileX1; tx++) {
      ensureTile(zoom, tx, ty);
    }
  }
}

function trafficSpawnScaleKm(state) {
  const speed = state.flight?.speed ?? 0;
  const mach = speed / 340.29;
  if (mach > 20) return 55;
  if (mach > 5) return 38;
  return 28;
}

const radarState = {
  lastPrefetchKey: "",
  displayDistKm: null,
  displayDestId: "",
};

export function drawRadarPanel(ctx, width, height, state) {
  if (width < 40 || height < 40) return;

  const f = state.flight;
  const nav = state.telemetry?.navigation;
  const headerH = 18;
  const pad = 6;
  const size = Math.min(width, height) - pad * 2;
  const cx = width / 2;
  const cy = headerH + pad + size / 2;
  const r = size / 2 - 4;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(6, 18, 30, 0.94)";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(6, 18, 30, 0.92)";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#e7eefb";
  ctx.font = "bold 10px Inter, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("RADAR", pad, 12);

  if (nav) {
    if (nav.distKm !== radarState.displayDistKm || nav.destId !== radarState.displayDestId) {
      radarState.displayDistKm = nav.distKm;
      radarState.displayDestId = nav.destId;
    }
    ctx.fillStyle = "#9db0cf";
    ctx.font = "10px Inter, Segoe UI, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`→ ${nav.destId} ${radarState.displayDistKm} km`, width - pad, 12);
  }
  ctx.textAlign = "start";

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#0c2848";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const zoom = pickZoom(f.speed ?? 0);
  const prefetchKey = `${zoom}:${f.lat.toFixed(3)}:${f.lon.toFixed(3)}`;
  if (prefetchKey !== radarState.lastPrefetchKey) {
    radarState.lastPrefetchKey = prefetchKey;
    prefetchTiles(f.lat, f.lon, zoom, r + TILE_SIZE);
  }

  const center = latLonToWorldPx(f.lat, f.lon, zoom);
  const half = Math.ceil(r / TILE_SIZE) + 1;
  const tileX0 = Math.floor(center.x / TILE_SIZE) - half;
  const tileY0 = Math.floor(center.y / TILE_SIZE) - half;

  for (let ty = tileY0; ty <= tileY0 + half * 2; ty++) {
    for (let tx = tileX0; tx <= tileX0 + half * 2; tx++) {
      const key = tileKey(zoom, tx, ty);
      const img = tileImages.get(key);
      if (!img) {
        ensureTile(zoom, tx, ty);
        continue;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-f.heading);
      const px = tx * TILE_SIZE - center.x;
      const py = ty * TILE_SIZE - center.y;
      ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
      ctx.restore();
    }
  }

  ctx.strokeStyle = "rgba(113, 176, 255, 0.25)";
  ctx.lineWidth = 1;
  for (const ring of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(150, 208, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy - r + 10);
  ctx.stroke();

  const traffic = state.traffic || [];
  if (traffic.length > 0) {
    const maxTrafficKm = Math.max(25, Math.min(60, trafficSpawnScaleKm(state)));
    const tScale = (r * 0.88) / maxTrafficKm;
    for (const t of traffic) {
      const dLat = ((t.lat - f.lat) * Math.PI) / 180;
      const dLon = ((t.lon - f.lon) * Math.PI) / 180;
      const distKm =
        (6371 *
          2 *
          Math.asin(
            Math.sqrt(
              Math.sin(dLat / 2) ** 2 +
                Math.cos((f.lat * Math.PI) / 180) *
                  Math.cos((t.lat * Math.PI) / 180) *
                  Math.sin(dLon / 2) ** 2
            )
          )) /
        1;
      const bearing = Math.atan2(
        Math.sin(dLon) * Math.cos((t.lat * Math.PI) / 180),
        Math.cos((f.lat * Math.PI) / 180) * Math.sin((t.lat * Math.PI) / 180) -
          Math.sin((f.lat * Math.PI) / 180) * Math.cos((t.lat * Math.PI) / 180) * Math.cos(dLon)
      );
      const rel = bearing - f.heading;
      const tx = cx + Math.sin(rel) * distKm * tScale;
      const ty = cy - Math.cos(rel) * distKm * tScale;
      if (Math.hypot(tx - cx, ty - cy) > r - 4) continue;
      ctx.fillStyle = t.color || "#71b0ff";
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fill();
      const arrow = t.verticalSep === "above" ? "↑" : t.verticalSep === "below" ? "↓" : "•";
      ctx.fillStyle = "#fff";
      ctx.font = "9px Inter, sans-serif";
      ctx.fillText(arrow, tx + 5, ty - 3);
    }
  }

  if (nav && state.navTarget) {
    const maxKm = Math.max(80, Math.min(nav.distKm * 1.35, 1200));
    const scale = (r * 0.88) / maxKm;
    const rel = nav.bearingRad - f.heading;
    const bx = cx + Math.sin(rel) * nav.distKm * scale;
    const by = cy - Math.cos(rel) * nav.distKm * scale;
    const onScreen = Math.hypot(bx - cx, by - cy) <= r - 6;

    if (onScreen) {
      ctx.fillStyle = "#52e0a5";
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      const ang = Math.atan2(Math.sin(rel), Math.cos(rel));
      const ex = cx + Math.sin(ang) * (r - 8);
      const ey = cy - Math.cos(ang) * (r - 8);
      ctx.fillStyle = "#52e0a5";
      ctx.beginPath();
      ctx.moveTo(ex, ey - 7);
      ctx.lineTo(ex - 5, ey + 4);
      ctx.lineTo(ex + 5, ey + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx - 4, cy + 5);
  ctx.lineTo(cx + 4, cy + 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  ctx.strokeStyle = "rgba(113, 176, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}
