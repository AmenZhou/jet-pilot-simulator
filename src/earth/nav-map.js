/** Bottom-left navigation globe — orthographic view with real-world map imagery */

const WORLD_MAP_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Whole_world_-_land_and_oceans.jpg/1280px-Whole_world_-_land_and_oceans.jpg";

function toRad(d) {
  return (d * Math.PI) / 180;
}

function latLonToUnit(lat, lon) {
  const cl = Math.cos(lat);
  return { x: cl * Math.cos(lon), y: cl * Math.sin(lon), z: Math.sin(lat) };
}

function orthographicProject(lat, lon, centerLat, centerLon, cx, cy, r) {
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon - centerLon);
  const cosLon = Math.cos(lon - centerLon);
  const sinC = Math.sin(centerLat);
  const cosC = Math.cos(centerLat);

  const k = sinC * sinLat + cosC * cosLat * cosLon;
  if (k <= 0.02) return null;

  const x = cosLat * sinLon;
  const y = cosC * sinLat - sinC * cosLat * cosLon;
  return { x: cx + r * x, y: cy - r * y, k };
}

function inverseOrtho(px, py, cx, cy, r, centerLat, centerLon) {
  const x = (px - cx) / r;
  const y = -(py - cy) / r;
  const rho = Math.hypot(x, y);
  if (rho > 1) return null;
  const c = Math.asin(rho);
  const sinc = Math.sin(c);
  const lat = Math.asin(
    Math.cos(c) * Math.sin(centerLat) + (y * sinc * Math.cos(centerLat)) / rho
  );
  const lon =
    centerLon +
    Math.atan2(
      x * sinc,
      rho * Math.cos(centerLat) * Math.cos(c) - y * Math.sin(centerLat) * Math.sin(c)
    );
  return { lat, lon };
}

function rimPointFor(lat, lon, centerLat, centerLon, cx, cy, r) {
  const pt = orthographicProject(lat, lon, centerLat, centerLon, cx, cy, r);
  if (pt) return { x: pt.x, y: pt.y, onRim: false };

  const c = latLonToUnit(centerLat, centerLon);
  const d = latLonToUnit(lat, lon);
  let vx = d.x - c.x * (d.x * c.x + d.y * c.y + d.z * c.z);
  let vy = d.y - c.y * (d.x * c.x + d.y * c.y + d.z * c.z);
  let vz = d.z - c.z * (d.x * c.x + d.y * c.y + d.z * c.z);
  const len = Math.hypot(vx, vy, vz) || 1;
  vx /= len;
  vy /= len;
  vz /= len;

  const north = {
    x: -Math.sin(centerLat) * Math.cos(centerLon),
    y: -Math.sin(centerLat) * Math.sin(centerLon),
    z: Math.cos(centerLat),
  };
  const east = {
    x: -Math.sin(centerLon),
    y: Math.cos(centerLon),
    z: 0,
  };
  const sx = vx * east.x + vy * east.y + vz * east.z;
  const sy = vx * north.x + vy * north.y + vz * north.z;
  const ang = Math.atan2(sx, sy);
  return { x: cx + Math.sin(ang) * r * 0.9, y: cy - Math.cos(ang) * r * 0.9, onRim: true };
}

function computeGlobeCenter(curLat, curLon, destLat, destLon, hasDest) {
  if (!hasDest) return { lat: curLat, lon: curLon };
  const Bx = Math.cos(destLat) * Math.cos(destLon - curLon);
  const By = Math.cos(destLat) * Math.sin(destLon - curLon);
  const lat = Math.atan2(
    Math.sin(curLat) + Math.sin(destLat),
    Math.sqrt((Math.cos(curLat) + Bx) ** 2 + By ** 2)
  );
  const lon = curLon + Math.atan2(By, Math.cos(curLat) + Bx);
  return { lat, lon };
}

function sampleEquirect(imgData, w, h, lon, lat) {
  let u = (lon + Math.PI) / (2 * Math.PI);
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  const v = (Math.PI / 2 - lat) / Math.PI;
  const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
  const py = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  const i = (py * w + px) * 4;
  return [imgData[i], imgData[i + 1], imgData[i + 2]];
}

const mapState = {
  worldImg: null,
  worldData: null,
  worldW: 0,
  worldH: 0,
  loadPromise: null,
  baseCache: null,
  baseCacheKey: "",
};

function loadWorldMap() {
  if (mapState.loadPromise) return mapState.loadPromise;
  mapState.loadPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      mapState.worldImg = img;
      mapState.worldData = data.data;
      mapState.worldW = c.width;
      mapState.worldH = c.height;
      mapState.baseCache = null;
      resolve(true);
    };
    img.onerror = () => {
      console.warn("[nav-globe] World map image failed; using tiles only");
      resolve(false);
    };
    img.src = WORLD_MAP_URL;
  });
  return mapState.loadPromise;
}

loadWorldMap();

function rebuildBaseCache(cx, cy, r, centerLat, centerLon) {
  const key = `${centerLat.toFixed(4)}:${centerLon.toFixed(4)}:${Math.round(r)}`;
  if (mapState.baseCache && mapState.baseCacheKey === key) return mapState.baseCache;

  const size = Math.ceil(r * 2) + 2;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const ctx = off.getContext("2d");
  const img = ctx.createImageData(size, size);
  const ocX = size / 2;
  const ocY = size / 2;
  const hasWorld = Boolean(mapState.worldData);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const ll = inverseOrtho(px + (cx - r), py + (cy - r), cx, cy, r, centerLat, centerLon);
      if (!ll) {
        img.data[i + 3] = 0;
        continue;
      }
      if (hasWorld) {
        const rgb = sampleEquirect(mapState.worldData, mapState.worldW, mapState.worldH, ll.lon, ll.lat);
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      } else {
        img.data[i] = 10;
        img.data[i + 1] = 40;
        img.data[i + 2] = 90;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  mapState.baseCache = off;
  mapState.baseCacheKey = key;
  return off;
}

function drawGreatCircle(ctx, cx, cy, r, lat1, lon1, lat2, lon2, centerLat, centerLon) {
  const d = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(lat1) * Math.sin(lat2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
      )
    )
  );
  if (d < 0.001) return;

  ctx.strokeStyle = "rgba(82, 224, 165, 0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 56; i++) {
    const t = i / 56;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x3 = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y3 = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z3 = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z3, Math.sqrt(x3 * x3 + y3 * y3));
    const lon = Math.atan2(y3, x3);
    const pt = orthographicProject(lat, lon, centerLat, centerLon, cx, cy, r);
    if (!pt) {
      started = false;
      continue;
    }
    started ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y);
    started = true;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarker(ctx, x, y, color, size = 6, label = "") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (label) {
    ctx.font = "bold 10px Inter, Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(6, 18, 30, 0.95)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, x + 8, y - 6);
    ctx.fillText(label, x + 8, y - 6);
  }
}

function drawAircraft(ctx, x, y, heading) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = "#ffb347";
  ctx.strokeStyle = "rgba(6, 18, 30, 0.95)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(-6, 8);
  ctx.lineTo(6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawGlobePanel(ctx, width, height, state) {
  if (width < 16 || height < 16) return;

  const f = state.flight;
  const nav = state.telemetry?.navigation;
  const headerH = 22;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(6, 18, 30, 0.96)";
  ctx.fillRect(0, 0, width, height);

  const bodyH = height - headerH;
  const r = Math.max(28, Math.min((width - 16) / 2, (bodyH - 12) / 2));
  const cx = width / 2;
  const cy = headerH + bodyH / 2;

  const curLat = toRad(f.lat);
  const curLon = toRad(f.lon);
  const hasDest = Boolean(state.navTarget);
  const destLat = hasDest ? toRad(state.navTarget.lat) : curLat;
  const destLon = hasDest ? toRad(state.navTarget.lon) : curLon;
  const destId = state.navTarget?.id || nav?.destId || "";

  const center = computeGlobeCenter(curLat, curLon, destLat, destLon, hasDest);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#0c3d6e";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const base = rebuildBaseCache(cx, cy, r, center.lat, center.lon);
  ctx.drawImage(base, cx - r, cy - r);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 0.5;
  for (let latDeg = -60; latDeg <= 60; latDeg += 30) {
    const lat = toRad(latDeg);
    ctx.beginPath();
    let started = false;
    for (let lonDeg = -180; lonDeg <= 180; lonDeg += 4) {
      const pt = orthographicProject(lat, toRad(lonDeg), center.lat, center.lon, cx, cy, r);
      if (!pt) {
        started = false;
        continue;
      }
      started ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y);
      started = true;
    }
    ctx.stroke();
  }

  if (hasDest) {
    drawGreatCircle(ctx, cx, cy, r, curLat, curLon, destLat, destLon, center.lat, center.lon);
  }

  const youPt = orthographicProject(curLat, curLon, center.lat, center.lon, cx, cy, r);
  const destPt = hasDest ? rimPointFor(destLat, destLon, center.lat, center.lon, cx, cy, r) : null;

  if (destPt) {
    if (destPt.onRim) {
      ctx.strokeStyle = "rgba(82, 224, 165, 0.7)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(destPt.x, destPt.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawMarker(ctx, destPt.x, destPt.y, "#52e0a5", destPt.onRim ? 5 : 7, destId);
  }
  if (youPt) drawAircraft(ctx, youPt.x, youPt.y, f.heading);

  const grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.05, cx, cy, r);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.06)");
  grad.addColorStop(0.6, "rgba(0, 0, 0, 0)");
  grad.addColorStop(1, "rgba(0, 20, 50, 0.45)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.strokeStyle = "rgba(113, 176, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(6, 18, 30, 0.92)";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#e7eefb";
  ctx.font = "bold 10px Inter, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("GLOBE", 8, 14);
  ctx.fillStyle = "#9db0cf";
  ctx.font = "10px Inter, Segoe UI, Arial, sans-serif";
  const sub = hasDest
    ? `→ ${destId} · ${nav?.distKm ?? "—"} km`
    : `${f.lat.toFixed(1)}°, ${f.lon.toFixed(1)}°`;
  ctx.fillText(sub, 52, 14);
  ctx.textAlign = "start";
}

/** @deprecated use drawGlobePanel */
export function drawNavMapPanel(ctx, width, height, state) {
  drawGlobePanel(ctx, width, height, state);
}
