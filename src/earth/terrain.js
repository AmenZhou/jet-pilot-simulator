import { AIRPORTS } from "./constants.js";

const AIRPORT_GROUND_RADIUS_M = 12000;
const EARTH_RADIUS_M = 6371000;

/** v1 without Ion: ellipsoid + airport elevation pads + optional globe sample */
export const TERRAIN_MODE = "ellipsoid-airport-v1";

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function nearestAirport(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const ap of Object.values(AIRPORTS)) {
    const dist = haversineMeters(lat, lon, ap.lat, ap.lon);
    if (dist < bestDist) {
      bestDist = dist;
      best = ap;
    }
  }
  return { airport: best, distM: bestDist };
}

/**
 * Subtle game height away from airports (not real DEM) — keeps cruise interesting without Ion.
 */
function proceduralBumpMeters(lat, lon) {
  const x = lon * 0.17;
  const y = lat * 0.23;
  return (
    (Math.sin(x * 1.7) + Math.cos(y * 2.1)) * 120 +
    Math.sin((x + y) * 0.9) * 80
  );
}

export function getGroundHeight(lon, lat, globeSampleFn, { useGlobeSample = false } = {}) {
  const { airport, distM } = nearestAirport(lat, lon);
  let globeH = 0;
  // Without Ion, globe.getHeight is unreliable on ellipsoid — ignore unless opted in
  if (useGlobeSample && globeSampleFn) {
    const sampled = globeSampleFn(lon, lat);
    if (Number.isFinite(sampled) && sampled > -500 && sampled < 9000) globeH = sampled;
  }

  if (airport && distM <= AIRPORT_GROUND_RADIUS_M) {
    const t = 1 - distM / AIRPORT_GROUND_RADIUS_M;
    const pad = airport.alt * Math.max(0, t * t);
    // Ion globe.getHeight often spikes on runways (logs: groundAlt 186m at KSFO pad).
    if (distM < 2500) return Math.max(pad, airport.alt);
    if (useGlobeSample && Number.isFinite(globeH)) {
      const cap = airport.alt + 40;
      return Math.max(pad, Math.min(globeH, cap));
    }
    return Math.max(globeH, pad);
  }

  return Math.max(globeH, proceduralBumpMeters(lat, lon) * 0.15);
}

export function getTerrainTelemetry(lat, lon, groundAlt, { ionActive = false } = {}) {
  const { airport, distM } = nearestAirport(lat, lon);
  let source = ionActive ? "globe-ion" : "ellipsoid";
  if (airport && distM <= AIRPORT_GROUND_RADIUS_M) source = ionActive ? "airport-pad+ion" : "airport-pad";
  else if (!ionActive && Math.abs(proceduralBumpMeters(lat, lon)) > 1) source = "procedural";

  return {
    mode: ionActive ? "cesium-ion" : TERRAIN_MODE,
    source,
    nearestAirport: airport?.id ?? null,
    distToAirportM: Math.round(distM),
    groundAlt: Math.round(groundAlt),
  };
}

export { nearestAirport };
