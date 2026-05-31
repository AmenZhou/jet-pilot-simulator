import { moveAlongHeading } from "./physics.js";

const EARTH_RADIUS_M = 6371000;
const MAX_TRAFFIC = 12;

/** Vertical separation bands (meters relative to your altitude) */
export const FLIGHT_LEVEL_OFFSETS_M = [-3600, -2400, -1200, 0, 1200, 2400, 3600];
const SAME_ALT_BAND_M = 700;

export const TRAFFIC_TYPES = {
  commercial: {
    label: "A380",
    color: "#71b0ff",
    length: 26,
    width: 8,
    height: 8,
    speed: 245,
    weight: 3,
  },
  regional: {
    label: "B737",
    color: "#52e0a5",
    length: 18,
    width: 5,
    height: 5,
    speed: 210,
    weight: 4,
  },
  cargo: {
    label: "Cargo",
    color: "#ffb347",
    length: 22,
    width: 6,
    height: 6,
    speed: 225,
    weight: 2,
  },
  military: {
    label: "F-16",
    color: "#c9a0ff",
    length: 11,
    width: 3,
    height: 3,
    speed: 380,
    weight: 2,
  },
  private: {
    label: "Citation",
    color: "#ff8fab",
    length: 12,
    width: 4,
    height: 4,
    speed: 190,
    weight: 2,
  },
};

export function classifyVerticalSep(deltaM) {
  if (deltaM > SAME_ALT_BAND_M) return "above";
  if (deltaM < -SAME_ALT_BAND_M) return "below";
  return "same";
}

export function verticalSepColor(sep) {
  if (sep === "above") return "#5eead4";
  if (sep === "below") return "#ffb347";
  return "#ffe566";
}

export function formatAltDelta(deltaM) {
  const ft = Math.round(deltaM / 0.3048);
  const sign = ft > 0 ? "+" : "";
  return `${sign}${ft} ft`;
}

function pickType() {
  const entries = Object.entries(TRAFFIC_TYPES);
  const total = entries.reduce((s, [, t]) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const [id, t] of entries) {
    r -= t.weight;
    if (r <= 0) return id;
  }
  return "regional";
}

export function horizontalDistanceM(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function destinationPoint(lat, lon, bearingRad, distM) {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const δ = distM / EARTH_RADIUS_M;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearingRad)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

function trafficSpawnBandKm(playerSpeedMps) {
  const mach = playerSpeedMps / 340.29;
  const minKm = mach > 20 ? 18 : mach > 5 ? 12 : 6;
  const maxKm = mach > 20 ? 55 : mach > 5 ? 38 : 28;
  const keepKm = maxKm * 1.6 + 25;
  return { minKm, maxKm, keepKm };
}

function pickFlightLevelOffsetM() {
  return FLIGHT_LEVEL_OFFSETS_M[Math.floor(Math.random() * FLIGHT_LEVEL_OFFSETS_M.length)];
}

function spawnTrafficPlane(player) {
  const typeId = pickType();
  const spec = TRAFFIC_TYPES[typeId];
  const playerSpeed = Math.max(80, player.speed || 0);
  const { minKm, maxKm } = trafficSpawnBandKm(playerSpeed);
  const distM = (minKm + Math.random() * (maxKm - minKm)) * 1000;

  const encounterRoll = Math.random();
  let heading;
  if (encounterRoll < 0.45) {
    heading = player.heading + (Math.random() - 0.5) * 0.5;
  } else if (encounterRoll < 0.75) {
    heading = player.heading + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.9);
  } else {
    heading = player.heading + Math.PI + (Math.random() - 0.5) * 0.6;
  }

  const bearingToSpawn = player.heading + (Math.random() - 0.35) * 1.1;
  const pos = destinationPoint(player.lat, player.lon, bearingToSpawn, distM);

  const altOffsetM = pickFlightLevelOffsetM();
  const alt = Math.max(350, player.alt + altOffsetM);
  const verticalSep = classifyVerticalSep(altOffsetM);

  return {
    id: `traffic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: typeId,
    label: spec.label,
    lat: pos.lat,
    lon: pos.lon,
    alt,
    altOffsetM,
    verticalSep,
    heading,
    pitch: 0,
    roll: 0,
    speed: Math.max(
      spec.speed,
      Math.min(playerSpeed, 290) * (0.82 + Math.random() * 0.14)
    ),
    color: verticalSepColor(verticalSep),
    baseColor: spec.color,
    length: spec.length,
    width: spec.width,
    height: spec.height,
  };
}

export function clearTraffic(state) {
  state.traffic = [];
  clearWrecks(state);
  state.telemetry.trafficNearby = 0;
  state.telemetry.nearestTrafficKm = null;
  state.telemetry.trafficContacts = [];
}

function spawnBanditAhead(player) {
  const typeId = Math.random() < 0.35 ? "military" : "regional";
  const spec = TRAFFIC_TYPES[typeId];
  const distM = (2800 + Math.random() * 5200);
  const bearingToSpawn = player.heading + (Math.random() - 0.5) * 0.35;
  const pos = destinationPoint(player.lat, player.lon, bearingToSpawn, distM);
  const altOffsetM = (Math.random() - 0.5) * 320;
  const alt = Math.max(player.alt + 80, player.alt + altOffsetM);
  return {
    id: `bandit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: typeId,
    label: spec.label,
    lat: pos.lat,
    lon: pos.lon,
    alt,
    altOffsetM: alt - player.alt,
    verticalSep: classifyVerticalSep(alt - player.alt),
    heading: player.heading + Math.PI + (Math.random() - 0.5) * 0.8,
    pitch: 0,
    roll: 0,
    speed: Math.max(170, Math.min(player.speed * 0.95, 260)),
    color: "#ff6b6b",
    baseColor: spec.color,
    length: spec.length,
    width: spec.width,
    height: spec.height,
  };
}

function ensureBanditTraffic(state) {
  const player = state.flight;
  const hasBandit = state.traffic.some((t) => {
    const km = horizontalDistanceM(player, t) / 1000;
    return km >= 2 && km <= 14 && Math.abs(t.alt - player.alt) < 600;
  });
  if (hasBandit) return;
  if (state.traffic.length >= MAX_TRAFFIC) {
    state.traffic.shift();
  }
  state.traffic.push(spawnBanditAhead(player));
}

export function maintainTraffic(state) {
  if (!state.flying || state.paused || state.flight.crashed) {
    if (state.traffic.length) clearTraffic(state);
    return;
  }

  const player = state.flight;
  const { keepKm } = trafficSpawnBandKm(Math.max(80, player.speed || 0));

  state.traffic = state.traffic.filter((t) => {
    const km = horizontalDistanceM(player, t) / 1000;
    return km < keepKm;
  });

  while (state.traffic.length < MAX_TRAFFIC) {
    state.traffic.push(spawnTrafficPlane(player));
  }

  ensureBanditTraffic(state);
}

export function updateTraffic(state, dt, Cesium) {
  if (!state.flying || state.paused) return;

  const player = state.flight;

  for (const t of state.traffic) {
    t.altOffsetM = t.alt - player.alt;
    t.verticalSep = classifyVerticalSep(t.altOffsetM);
    t.color = verticalSepColor(t.verticalSep);
    t.heading += (Math.random() - 0.5) * 0.012 * dt;
    const bank = Math.sin((t.id.length + performance.now() * 0.0008) % 100) * 0.06;
    t.roll = bank;
    t.pitch = Math.sin(performance.now() * 0.0005 + t.lat) * 0.015;
    moveAlongHeading(t, t.speed, dt, Cesium);
  }

  const contacts = state.traffic
    .map((t) => {
      const km = horizontalDistanceM(player, t) / 1000;
      return {
        id: t.id,
        label: t.label,
        km: Math.round(km * 10) / 10,
        altOffsetM: Math.round(t.altOffsetM),
        verticalSep: t.verticalSep,
        altDelta: formatAltDelta(t.altOffsetM),
      };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, 4);

  let nearestKm = contacts[0]?.km ?? null;
  state.telemetry.trafficNearby = state.traffic.length;
  state.telemetry.nearestTrafficKm = nearestKm;
  state.telemetry.trafficContacts = contacts;
}
