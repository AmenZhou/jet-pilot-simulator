/** Sea-level speed of sound (m/s) — used for Mach display and speed cap */
export const SPEED_OF_SOUND_MS = 340.29;

/** cesium-air.glb nose points +X (east) at HPR 0; flight heading 0 is north (+Y). */
export const AIRCRAFT_MODEL_HEADING_OFFSET = -Math.PI / 2;

export function modelHeadingFromFlight(headingRad) {
  return (headingRad + AIRCRAFT_MODEL_HEADING_OFFSET + Math.PI * 4) % (Math.PI * 2);
}

/** Hard cap: 100× Mach (~34,029 m/s horizontal-equivalent in the flight model) */
export const MAX_MACH = 100;

/** Assisted / normal cruise band (AGL above terrain, meters) */
export const CRUISE_AGL_M = 320;
export const CRUISE_AGL_MIN_M = 250;
/** ~Mach 0.6 — ~430 mph / ~375 kt */
export const CRUISE_TARGET_MPS = SPEED_OF_SOUND_MS * 0.6;

export const PHYSICS = {
  MIN_SPEED: 0,
  get MAX_SPEED() {
    return SPEED_OF_SOUND_MS * MAX_MACH;
  },
  THRUST: 1158000,
  DRAG: 0.001,
  THROTTLE_RATE: 0.75,
  PITCH_RATE: 1.2,
  YAW_RATE: 0.9,
  MAX_PITCH: 0.55,
  MIN_PITCH: -0.45,
  GEAR_DRAG: 0.012,
  GROUND_FRICTION: 0.004,
  MIN_FLY_AGL: 8,
  CRASH_SINK: 18,
  GROUND_CLEARANCE: 1.2,
};

export const AIRPORTS = {
  SFO: {
    id: "SFO",
    name: "San Francisco (KSFO)",
    lat: 37.6189,
    lon: -122.375,
    alt: 4,
    heading: 1.75,
  },
  LAX: {
    id: "LAX",
    name: "Los Angeles (KLAX)",
    lat: 33.9425,
    lon: -118.408,
    alt: 38,
    heading: 2.4,
  },
  JFK: {
    id: "JFK",
    name: "New York (KJFK)",
    lat: 40.6413,
    lon: -73.7781,
    alt: 4,
    heading: 1.2,
  },
  LHR: {
    id: "LHR",
    name: "London (EGLL)",
    lat: 51.47,
    lon: -0.4543,
    alt: 25,
    heading: 1.57,
  },
  NRT: {
    id: "NRT",
    name: "Tokyo (RJAA)",
    lat: 35.772,
    lon: 140.3929,
    alt: 4,
    heading: 0.6,
  },
  SYD: {
    id: "SYD",
    name: "Sydney (YSSY)",
    lat: -33.9399,
    lon: 151.1753,
    alt: 6,
    heading: 2.71,
  },
};

export const DEFAULT_AIRPORT = "SFO";
