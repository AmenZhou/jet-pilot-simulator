import { AIRPORTS, DEFAULT_AIRPORT } from "./constants.js";
import { createState, spawnAtAirport, beginFlight } from "./state.js";
import {
  initGlobe,
  syncCameraFromFlight,
  syncChaseCamera,
  flyToAirport as cameraFlyTo,
  setAircraftVisible,
  sampleTerrainHeight,
  getCesium,
} from "./cesium-view.js";
import { getGroundHeight, getTerrainTelemetry } from "./terrain.js";
import { updateFlightPhysics, moveAlongHeading } from "./physics.js";
import { drawHud } from "./hud.js";
import { bindInput, bindPanel } from "./input.js";
import {
  initCockpitOverlay,
  resizeCockpitOverlay,
  updateCockpitOverlay,
  renderCockpitOverlay,
} from "./cockpit-overlay.js";

const state = createState();
window.__earthState = state;

window.__earthAgent = {
  beginFlight: () => beginFlight(state),
  spawnAtAirport: (id) => {
    spawnAtAirport(state, id);
    state.status = `Reset at ${AIRPORTS[id]?.name || id}`;
  },
  setThrottle: (v) => {
    state.flight.throttle = Math.max(0, Math.min(1, v));
  },
  setPitch: (v) => {
    state.flight.pitch = Math.max(-0.8, Math.min(0.8, v));
  },
  setHeading: (v) => {
    state.flight.heading = ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  },
  setGameSpeed: (v) => {
    state.gameSpeed = [1, 2, 4].includes(v) ? v : state.gameSpeed;
  },
  toggleGear: () => {
    state.flight.gearDown = !state.flight.gearDown;
  },
  togglePause: () => {
    state.paused = !state.paused;
  },
};

const els = {
  globe: document.getElementById("cesiumContainer"),
  cockpit: document.getElementById("cockpitOverlay"),
  hud: document.getElementById("hudCanvas"),
  status: document.getElementById("statusText"),
  telAgl: document.getElementById("telAgl"),
  telSpeed: document.getElementById("telSpeed"),
  telHdg: document.getElementById("telHdg"),
  telTerrain: document.getElementById("telTerrain"),
  airportSelect: document.getElementById("airportSelect"),
  flyBtn: document.getElementById("flyBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  chaseBtn: document.getElementById("chaseBtn"),
};

let hudCtx = null;
let lastTs = 0;
state.showChase = false;

function syncPanel() {
  const f = state.flight;
  const t = state.telemetry;
  els.status.textContent = state.status;
  els.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  els.chaseBtn.textContent = state.showChase ? "Camera: Chase" : "Camera: Cockpit";
  if (els.telAgl) els.telAgl.textContent = `${Math.round(t.agl)} m`;
  if (els.telSpeed) els.telSpeed.textContent = `${Math.round(t.groundspeedKt)} kt`;
  if (els.telHdg) {
    const hdg = ((f.heading * 180) / Math.PI + 360) % 360;
    els.telHdg.textContent = `${hdg.toFixed(0)}°`;
  }
  if (els.telTerrain && t.terrain) {
    els.telTerrain.textContent = `${t.terrain.source} · ${t.terrain.nearestAirport || "—"}`;
  }
}

function resizeAll() {
  resizeCockpitOverlay();
  const rect = els.hud.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.hud.width = Math.round(rect.width * dpr);
  els.hud.height = Math.round(rect.height * dpr);
  hudCtx = els.hud.getContext("2d");
  hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function flyToAirport(id) {
  const ap = AIRPORTS[id];
  if (!ap) return;
  cameraFlyTo(ap);
}

function onChange() {
  syncPanel();
  setAircraftVisible(state.showChase);
}

async function bootstrap() {
  populateAirports();
  await initGlobe(els.globe);
  initCockpitOverlay(els.cockpit);

  spawnAtAirport(state, DEFAULT_AIRPORT);
  flyToAirport(DEFAULT_AIRPORT);

  bindInput(state, onChange);
  bindPanel(state, els, { flyToAirport, onChange });

  resizeAll();
  window.addEventListener("resize", resizeAll);
  state.status = "Ready — Enter or Fly to depart. v1 uses free globe (no Ion).";
  syncPanel();
  requestAnimationFrame(loop);
}

function populateAirports() {
  els.airportSelect.innerHTML = "";
  Object.values(AIRPORTS).forEach((ap) => {
    const opt = document.createElement("option");
    opt.value = ap.id;
    opt.textContent = ap.name;
    els.airportSelect.appendChild(opt);
  });
  els.airportSelect.value = DEFAULT_AIRPORT;
}

function stepFrame(dt) {
  const Cesium = getCesium();
  const useGlobeSample = Boolean(import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim());
  const globeSample = (lon, lat) => sampleTerrainHeight(lon, lat);
  const groundAlt = getGroundHeight(state.flight.lon, state.flight.lat, globeSample, {
    useGlobeSample,
  });
  state.telemetry.terrain = getTerrainTelemetry(
    state.flight.lat,
    state.flight.lon,
    groundAlt
  );

  const motion = updateFlightPhysics(state, dt, groundAlt);

  if (motion && state.flying && !state.paused && !state.flight.crashed) {
    moveAlongHeading(state.flight, motion.horizontal, motion.dt, Cesium);
  }

  const cockpitVisible = state.flying && !state.showChase;
  updateCockpitOverlay(state.flight, cockpitVisible);

  if (state.flying) {
    if (state.showChase) {
      syncChaseCamera();
    } else {
      syncCameraFromFlight(state.flight);
    }
  }

  renderCockpitOverlay();

  const w = els.hud.clientWidth;
  const h = els.hud.clientHeight;
  if (hudCtx) drawHud(hudCtx, w, h, state);
  syncPanel();
}

window.__earthStep = (dt) => {
  const seconds = Math.min(0.12, Math.max(0.001, Number(dt) || 0.016));
  stepFrame(seconds * state.gameSpeed);
};

function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  stepFrame(dt);
  requestAnimationFrame(loop);
}

bootstrap().catch((err) => {
  console.error(err);
  els.status.textContent = `Failed to load globe: ${err.message}`;
});
