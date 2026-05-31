/**
 * Hit traffic — burn, tumble, and crash to the ground before despawn.
 */

import { moveAlongHeading } from "./physics.js";

const MAX_WRECKS = 8;
const WRECK_TTL_S = 120;
const IMPACT_AGL_M = 12;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function startWreck(state, target) {
  if (!state.wrecks) state.wrecks = [];

  const wreck = {
    id: `wreck-${target.id}`,
    sourceId: target.id,
    type: target.type,
    label: target.label,
    lat: target.lat,
    lon: target.lon,
    alt: target.alt,
    heading: target.heading + (Math.random() - 0.5) * 0.35,
    pitch: -0.12 - Math.random() * 0.08,
    roll: (Math.random() - 0.5) * 0.55,
    speed: Math.max(55, (target.speed || 180) * (0.45 + Math.random() * 0.2)),
    sinkMps: 45 + Math.random() * 55,
    rollRate: (Math.random() - 0.5) * 1.4,
    headingDrift: (Math.random() - 0.5) * 0.35,
    wreckPhase: "falling",
    flameSeed: Math.random() * 1000,
    born: performance.now(),
    ttl: WRECK_TTL_S,
    smokeTrail: [],
    smokeTimer: 0,
    color: "#ff5533",
    baseColor: "#cc3311",
    length: target.length,
    width: target.width,
    height: target.height,
    verticalSep: "same",
    altOffsetM: 0,
  };

  state.wrecks.push(wreck);
  while (state.wrecks.length > MAX_WRECKS) {
    state.wrecks.shift();
  }
  return wreck;
}

export function clearWrecks(state) {
  state.wrecks = [];
}

/**
 * @param {Function} getGroundAlt (lon, lat) => meters MSL
 * @returns {Array} wrecks that just impacted (for explosion FX)
 */
export function updateWrecks(state, dt, Cesium, getGroundAlt) {
  if (!state.wrecks?.length) return [];

  const impacted = [];
  const keep = [];

  for (const w of state.wrecks) {
    const age = (performance.now() - w.born) / 1000;
    if (w.wreckPhase === "falling" && age > w.ttl) continue;

    if (w.wreckPhase === "falling") {
      w.speed = Math.max(35, w.speed * (1 - dt * 0.08));
      w.pitch = clamp(w.pitch - dt * 0.22, -0.92, 0.1);
      w.roll = clamp(w.roll + w.rollRate * dt, -1.1, 1.1);
      w.heading = (w.heading + w.headingDrift * dt + Math.PI * 2) % (Math.PI * 2);
      w.sinkMps = Math.min(200, w.sinkMps + dt * 32);
      w.alt -= w.sinkMps * dt;

      moveAlongHeading(w, w.speed, dt, Cesium);

      w.smokeTimer = (w.smokeTimer || 0) + dt;
      if (w.smokeTimer >= 0.12) {
        w.smokeTimer = 0;
        w.smokeTrail.push({ lat: w.lat, lon: w.lon, alt: w.alt + 4 });
        while (w.smokeTrail.length > 36) w.smokeTrail.shift();
      }

      const ground = getGroundAlt?.(w.lon, w.lat) ?? 0;
      const agl = w.alt - ground;
      if (agl <= IMPACT_AGL_M) {
        w.alt = ground + 2;
        w.wreckPhase = "impacted";
        w.impactAt = performance.now();
        w.speed = 0;
        w.sinkMps = 0;
        impacted.push(w);
      }
      keep.push(w);
    } else if (w.wreckPhase === "impacted") {
      if (performance.now() - (w.impactAt || 0) < 900) {
        keep.push(w);
      }
    }
  }

  state.wrecks = keep;
  return impacted;
}
