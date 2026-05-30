import { AIRPORTS, DEFAULT_AIRPORT } from "./constants.js";
import { createState, spawnAtAirport, beginFlight, prepareRunway } from "./state.js";
import {
  startMission as beginMissionRoute,
  cancelMission,
  setControlMode,
  updateMission,
  applyAssistedControls,
  MISSION_PHASES,
} from "./mission.js";
import {
  initGlobe,
  syncCameraFromFlight,
  syncChaseCamera,
  syncAircraftEntity,
  syncTrafficEntities,
  clearTrafficEntities,
  syncNavDestination,
  flyToAirport as cameraFlyTo,
  bindGlobeZoom,
  setAircraftVisible,
  sampleTerrainHeight,
  getCesium,
  getViewer,
} from "./cesium-view.js";
import { getGroundHeight, getTerrainTelemetry } from "./terrain.js";
import { computeNavTo } from "./nav.js";
import { updateFlightPhysics, moveAlongHeading } from "./physics.js";
import { maintainTraffic, updateTraffic, clearTraffic } from "./traffic.js";
import { applyAltitudeHold, toggleAltitudeHold } from "./cruise-hold.js";
import { updateTakeoff, isTakeoffActive } from "./takeoff.js";
import { drawHud } from "./hud.js";
import { drawGlobePanel } from "./nav-map.js";
import { drawRadarPanel } from "./radar-map.js";
import { bindInput, bindPanel } from "./input.js";
import {
  initCockpitOverlay,
  resizeCockpitOverlay,
  updateCockpitOverlay,
  renderCockpitOverlay,
} from "./cockpit-overlay.js";

const state = createState();
window.__earthState = state;
window.__earthDiagnostics = { renderFrames: 0, lastStepTs: 0 };

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
  setGear: (down) => {
    state.flight.gearDown = Boolean(down);
  },
  togglePause: () => {
    state.paused = !state.paused;
  },
  setChaseView: (on) => {
    state.showChase = Boolean(on);
    setAircraftVisible(state.showChase);
  },
  setNavTarget: (target) => {
    if (target) {
      state.navOrigin = {
        id: state.airportId,
        lat: state.flight.lat,
        lon: state.flight.lon,
      };
    } else {
      state.navOrigin = null;
    }
    state.navTarget = target;
    state.autoPatrol = false;
    if (target?.name && !state.mission.active) {
      state.status = `Navigate to ${target.name} (${target.id})`;
    }
  },
  startMission: (originId, destId) => {
    const ok = beginMissionRoute(state, originId, destId);
    if (ok) {
      prepareRunway(state, originId);
      if (els.airportSelect) els.airportSelect.value = originId;
      if (els.navSelect) els.navSelect.value = destId;
    }
    return ok;
  },
  cancelMission: () => cancelMission(state),
  setControlMode: (mode) => setControlMode(state, mode),
  toggleAltitudeHold: () => toggleAltitudeHold(state),
};

const els = {
  globe: document.getElementById("cesiumContainer"),
  cockpit: document.getElementById("cockpitOverlay"),
  hud: document.getElementById("hudCanvas"),
  navMap: document.getElementById("navMapCanvas"),
  radar: document.getElementById("radarCanvas"),
  status: document.getElementById("statusText"),
  telAgl: document.getElementById("telAgl"),
  telSpeed: document.getElementById("telSpeed"),
  telHdg: document.getElementById("telHdg"),
  telTerrain: document.getElementById("telTerrain"),
  telTraffic: document.getElementById("telTraffic"),
  navSelect: document.getElementById("navSelect"),
  airportSelect: document.getElementById("airportSelect"),
  missionBtn: document.getElementById("missionBtn"),
  cancelMissionBtn: document.getElementById("cancelMissionBtn"),
  controlModeSelect: document.getElementById("controlModeSelect"),
  telMission: document.getElementById("telMission"),
  flyBtn: document.getElementById("flyBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  chaseBtn: document.getElementById("chaseBtn"),
  holdBtn: document.getElementById("holdBtn"),
  telTrafficList: document.getElementById("telTrafficList"),
};

let hudCtx = null;
let navMapCtx = null;
let radarCtx = null;
let lastTs = 0;
state.showChase = true;

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
    const nav = t.navigation;
    els.telTerrain.textContent = nav
      ? `${nav.destId} · ${nav.distKm} km · hdg err ${nav.hdgErrorDeg}°`
      : `${t.terrain.source} · ${t.terrain.nearestAirport || "—"}`;
  }
  if (els.telTraffic) {
    if (state.flying && t.trafficNearby > 0) {
      els.telTraffic.textContent = `${t.trafficNearby} · nearest ${t.nearestTrafficKm} km`;
    } else {
      els.telTraffic.textContent = state.flying ? "scanning…" : "—";
    }
  }
  if (els.telTrafficList) {
    const contacts = t.trafficContacts || [];
    if (!state.flying || contacts.length === 0) {
      els.telTrafficList.textContent = state.flying
        ? "No traffic in range yet — climb and cruise."
        : "—";
    } else {
      els.telTrafficList.innerHTML = contacts
        .map((c) => {
          const arrow = c.verticalSep === "above" ? "↑" : c.verticalSep === "below" ? "↓" : "●";
          const sep =
            c.verticalSep === "above"
              ? "above"
              : c.verticalSep === "below"
                ? "below"
                : "same alt";
          return `<div class="traffic-row traffic-${c.verticalSep}">${arrow} ${c.label} ${c.km} km · ${c.altDelta} (${sep})</div>`;
        })
        .join("");
    }
  }
  if (els.holdBtn) {
    const on = state.altitudeHold?.active;
    els.holdBtn.textContent = on
      ? `HOLD ${Math.round(state.altitudeHold.targetAlt)} m`
      : "Cruise hold";
    els.holdBtn.classList.toggle("active-hold", Boolean(on));
  }
  if (els.navSelect) {
    const destId = state.navTarget?.id || "";
    if (els.navSelect.value !== destId) els.navSelect.value = destId;
  }
  if (els.telMission) {
    const m = state.mission;
    els.telMission.textContent = m.active
      ? `${m.phase} · ${m.controlMode}`
      : "—";
  }
  if (els.missionBtn) {
    const m = state.mission;
    const dest = els.navSelect?.value;
    const origin = els.airportSelect?.value;
    els.missionBtn.disabled = !dest || dest === origin || m?.phase === MISSION_PHASES.LANDED;
    els.missionBtn.textContent = m?.active ? "Restart mission" : "Start mission";
  }
  if (els.cancelMissionBtn) {
    els.cancelMissionBtn.hidden = !state.mission?.active;
  }
  if (els.controlModeSelect && state.mission) {
    els.controlModeSelect.value = state.mission.controlMode;
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

  if (els.navMap) {
    const navRect = els.navMap.getBoundingClientRect();
    els.navMap.width = Math.round(navRect.width * dpr);
    els.navMap.height = Math.round(navRect.height * dpr);
    navMapCtx = els.navMap.getContext("2d");
    navMapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  if (els.radar) {
    const radarRect = els.radar.getBoundingClientRect();
    els.radar.width = Math.round(radarRect.width * dpr);
    els.radar.height = Math.round(radarRect.height * dpr);
    radarCtx = els.radar.getContext("2d");
    radarCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
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

function applyRouteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from")?.toUpperCase();
  const to = params.get("to")?.toUpperCase();
  if (from && AIRPORTS[from]) {
    spawnAtAirport(state, from);
    flyToAirport(from);
    if (els.airportSelect) els.airportSelect.value = from;
  }
  if (to && AIRPORTS[to]) {
    const ap = AIRPORTS[to];
    window.__earthAgent.setNavTarget({ id: ap.id, name: ap.name, lat: ap.lat, lon: ap.lon });
    if (els.navSelect) els.navSelect.value = to;
    if (from && AIRPORTS[from] && from !== to) {
      setControlMode(state, els.controlModeSelect?.value || "manual");
      beginMissionRoute(state, from, to);
      prepareRunway(state, from);
    }
  }
}

function startMissionFromPanel() {
  const origin = els.airportSelect?.value;
  const dest = els.navSelect?.value;
  if (!origin || !dest || origin === dest) return;
  setControlMode(state, els.controlModeSelect?.value || "manual");
  beginMissionRoute(state, origin, dest);
  prepareRunway(state, origin);
  flyToAirport(origin);
  onChange();
}

async function bootstrap() {
  populateAirports();
  populateNavTargets();
  await initGlobe(els.globe);
  window.__earthViewer = getViewer();
  initCockpitOverlay(els.cockpit);

  spawnAtAirport(state, DEFAULT_AIRPORT);
  flyToAirport(DEFAULT_AIRPORT);
  applyRouteFromUrl();

  bindInput(state, onChange);
  bindPanel(state, els, { flyToAirport, onChange, startMissionFromPanel });
  bindGlobeZoom(state, els.globe);

  resizeAll();
  window.addEventListener("resize", resizeAll);
  state.status = "Ready — Enter or Fly to depart. v1 uses free globe (no Ion).";
  if (import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim()) {
    state.status = "Ready — Cesium Ion terrain active. Enter or Fly to depart.";
  }
  syncPanel();
  requestAnimationFrame(loop);
}

function populateNavTargets() {
  if (!els.navSelect) return;
  Object.values(AIRPORTS).forEach((ap) => {
    const opt = document.createElement("option");
    opt.value = ap.id;
    opt.textContent = `Fly to ${ap.name}`;
    els.navSelect.appendChild(opt);
  });
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
  window.__earthDiagnostics.renderFrames += 1;
  window.__earthDiagnostics.lastStepTs = performance.now();

  const Cesium = getCesium();
  const useGlobeSample = Boolean(import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim());
  const globeSample = (lon, lat) => sampleTerrainHeight(lon, lat);
  const groundAlt = getGroundHeight(state.flight.lon, state.flight.lat, globeSample, {
    useGlobeSample,
  });
  state.telemetry.terrain = getTerrainTelemetry(
    state.flight.lat,
    state.flight.lon,
    groundAlt,
    { ionActive: useGlobeSample }
  );
  state.telemetry.navigation = state.navTarget
    ? computeNavTo(state.flight, state.navTarget)
    : null;

  const motion = updateFlightPhysics(state, dt, groundAlt);

  applyAssistedControls(state, dt);
  applyAltitudeHold(state, dt);
  updateMission(state);
  if (state.flying && !state.mission?.active && isTakeoffActive(state)) {
    updateTakeoff(state);
  }

  if (motion && state.flying && !state.paused && !state.flight.crashed) {
    moveAlongHeading(state.flight, motion.horizontal, motion.dt, Cesium);
  }

  maintainTraffic(state);
  updateTraffic(state, dt * state.gameSpeed, Cesium);

  const cockpitVisible = state.flying && !state.showChase;
  updateCockpitOverlay(state.flight, cockpitVisible);

  syncAircraftEntity(state.flight);
  syncTrafficEntities(state.traffic);
  syncNavDestination(state.navTarget);

  if (state.flying) {
    if (state.showChase) {
      syncChaseCamera(state.flight, state.cameraZoom ?? 1);
    } else {
      syncCameraFromFlight(state.flight);
    }
  }

  const viewer = getViewer();
  if (viewer && !viewer.isDestroyed()) {
    viewer.scene.requestRender();
  }

  renderCockpitOverlay();

  const w = els.hud.clientWidth;
  const h = els.hud.clientHeight;
  if (hudCtx) drawHud(hudCtx, w, h, state);

  if (els.radar && radarCtx) {
    const rw = Math.max(els.radar.clientWidth, 1);
    const rh = Math.max(els.radar.clientHeight, 1);
    drawRadarPanel(radarCtx, rw, rh, state);
  }

  if (els.navMap && navMapCtx) {
    const w = Math.max(els.navMap.clientWidth, 1);
    const h = Math.max(els.navMap.clientHeight, 1);
    drawGlobePanel(navMapCtx, w, h, state);
  }

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
