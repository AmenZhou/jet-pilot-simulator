import { AIRPORTS, DEFAULT_AIRPORT, PHYSICS } from "./constants.js";

function airportSpawn(id) {
  const ap = AIRPORTS[id] || AIRPORTS[DEFAULT_AIRPORT];
  return {
    lat: ap.lat,
    lon: ap.lon,
    alt: ap.alt + 3.5,
    heading: ap.heading,
    pitch: 0.06,
    roll: 0,
    speed: 0,
    throttle: 0.55,
    gearDown: true,
    onGround: true,
    crashed: false,
    airportId: ap.id,
  };
}

export function createState() {
  return {
    mode: "earth",
    paused: false,
    flying: false,
    gameSpeed: 1,
    airportId: DEFAULT_AIRPORT,
    flight: airportSpawn(DEFAULT_AIRPORT),
    input: {
      throttleUp: false,
      throttleDown: false,
      pitchUp: false,
      pitchDown: false,
      yawLeft: false,
      yawRight: false,
    },
    telemetry: {
      agl: 0,
      terrainAlt: 0,
      groundspeedKt: 0,
      terrain: { mode: "ellipsoid-airport-v1", source: "airport-pad", nearestAirport: null },
    },
    status: "Press Enter or Fly to begin — then explore the globe.",
  };
}

export function spawnAtAirport(state, airportId) {
  state.airportId = airportId;
  state.flight = airportSpawn(airportId);
  state.flying = false;
  state.flight.crashed = false;
  state.paused = false;
  state.status = `Positioned at ${AIRPORTS[airportId]?.name || airportId} — Enter or Fly to depart.`;
}

export function beginFlight(state) {
  if (state.flying) return;
  state.flying = true;
  state.flight.crashed = false;
  state.status = "Free flight — W/S throttle, arrows pitch & turn.";
}

export { PHYSICS, AIRPORTS };
