export const PHYSICS = {
  MIN_SPEED: 0,
  MAX_SPEED: 220,
  THRUST: 28,
  DRAG: 0.018,
  THROTTLE_RATE: 0.5,
  PITCH_RATE: 1.2,
  YAW_RATE: 0.9,
  MAX_PITCH: 0.55,
  MIN_PITCH: -0.45,
  GEAR_DRAG: 0.006,
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
};

export const DEFAULT_AIRPORT = "SFO";
