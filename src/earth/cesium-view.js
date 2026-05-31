import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { modelHeadingFromFlight } from "./constants.js";
import {
  createTrafficAircraftGroup,
  updateTrafficAircraftGroup,
  removeTrafficAircraftGroup,
} from "./traffic-aircraft.js";

let viewer = null;
let aircraftEntity = null;
let destEntity = null;
const trafficEntities = new Map();
const wreckEntities = new Map();

export function getViewer() {
  return viewer;
}

export function getCesium() {
  return Cesium;
}

export async function initGlobe(container) {
  const token = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim();
  const viewerOptions = {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
  };

  // v1 default: no Ion — ellipsoid + free map tiles (see terrain.js for ground model)
  if (token) {
    Cesium.Ion.defaultAccessToken = token;
  }

  viewer = new Cesium.Viewer(container, viewerOptions);

  if (token) {
    try {
      await viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
    } catch (err) {
      console.error("Cesium Ion terrain failed to load:", err);
    }
  }

  if (!token) {
    viewer.imageryLayers.removeAll();
    const useSatellite = import.meta.env.VITE_SATELLITE_IMAGERY !== "false";
    if (useSatellite) {
      viewer.imageryLayers.addImageryProvider(
        await Cesium.ArcGisMapServerImageryProvider.fromUrl(
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
        )
      );
    } else {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          credit: "© CARTO © OpenStreetMap",
        })
      );
    }
  }

  viewer.scene.globe.enableLighting = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.00002;
  viewer.scene.screenSpaceCameraController.enableRotate = false;
  viewer.scene.screenSpaceCameraController.enableTranslate = false;
  viewer.scene.screenSpaceCameraController.enableZoom = false;
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;
  viewer.scene.requestRenderMode = false;
  viewer.scene.maximumRenderTimeChange = Infinity;

  const credit = viewer.cesiumWidget?.creditContainer;
  if (credit) credit.style.display = "none";

  const spawn = window.__earthState?.flight;
  const spawnPos = spawn
    ? Cesium.Cartesian3.fromDegrees(spawn.lon, spawn.lat, spawn.alt)
    : Cesium.Cartesian3.fromDegrees(-122.375, 37.6189, 8);

  const playerHpr = new Cesium.HeadingPitchRoll(
    modelHeadingFromFlight(spawn?.heading ?? 0),
    spawn?.pitch ?? 0,
    spawn?.roll ?? 0
  );
  aircraftEntity = viewer.entities.add({
    name: "Jet",
    show: false,
    position: spawnPos.clone(),
    orientation: Cesium.Transforms.headingPitchRollQuaternion(spawnPos, playerHpr),
    model: {
      uri: "/models/cesium-air.glb",
      scale: 5.2,
      minimumPixelSize: 72,
      maximumScale: 50000,
      runAnimations: false,
      color: Cesium.Color.fromCssColorString("#48b8ff"),
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      colorBlendAmount: 0.2,
      silhouetteColor: Cesium.Color.CYAN,
      silhouetteSize: 2,
    },
  });

  return viewer;
}

export function sampleTerrainHeight(lon, lat) {
  if (!viewer) return 0;
  const carto = Cesium.Cartographic.fromDegrees(lon, lat);
  const h = viewer.scene.globe.getHeight(carto);
  if (h !== undefined && Number.isFinite(h)) return h;
  return 0;
}

export function syncTrafficEntities(trafficList) {
  if (!viewer) return;
  try {
    syncTrafficEntitiesInner(trafficList);
  } catch (err) {
    console.warn("[traffic] sync failed:", err?.message || err);
  }
}

function syncTrafficEntitiesInner(trafficList) {
  const active = new Set((trafficList || []).map((t) => t.id));

  for (const [id, group] of trafficEntities) {
    if (!active.has(id)) {
      removeTrafficAircraftGroup(viewer, group);
      trafficEntities.delete(id);
    }
  }

  for (const t of trafficList || []) {
    let group = trafficEntities.get(t.id);
    if (!group) {
      group = createTrafficAircraftGroup(viewer, t, Cesium);
      trafficEntities.set(t.id, group);
    }
    updateTrafficAircraftGroup(group, t, Cesium);
    if (group.entity) group.entity.show = true;
    if (group.parts) {
      for (const entity of Object.values(group.parts)) {
        if (entity) entity.show = true;
      }
    }
  }
}

export function clearTrafficEntities() {
  if (!viewer) return;
  for (const group of trafficEntities.values()) {
    removeTrafficAircraftGroup(viewer, group);
  }
  trafficEntities.clear();
  clearWreckEntities();
}

export function syncWreckEntities(wreckList) {
  if (!viewer) return;
  try {
    syncWreckEntitiesInner(wreckList);
  } catch (err) {
    console.warn("[wreck] sync failed:", err?.message || err);
  }
}

function syncWreckEntitiesInner(wreckList) {
  const active = new Set((wreckList || []).map((w) => w.id));

  for (const [id, group] of wreckEntities) {
    if (!active.has(id)) {
      removeTrafficAircraftGroup(viewer, group);
      wreckEntities.delete(id);
    }
  }

  for (const w of wreckList || []) {
    let group = wreckEntities.get(w.id);
    if (!group) {
      group = createTrafficAircraftGroup(viewer, w, Cesium);
      wreckEntities.set(w.id, group);
    }
    updateTrafficAircraftGroup(group, w, Cesium);
    if (group.entity) group.entity.show = true;
    if (group.parts) {
      for (const entity of Object.values(group.parts)) {
        if (entity) entity.show = true;
      }
    }
  }
}

export function clearWreckEntities() {
  if (!viewer) return;
  for (const group of wreckEntities.values()) {
    removeTrafficAircraftGroup(viewer, group);
  }
  wreckEntities.clear();
}

export function syncNavDestination(navTarget) {
  if (!viewer) return;
  const Cesium = getCesium();

  if (!navTarget) {
    if (destEntity) {
      viewer.entities.remove(destEntity);
      destEntity = null;
    }
    return;
  }

  const pos = Cesium.Cartesian3.fromDegrees(navTarget.lon, navTarget.lat, 120);
  if (!destEntity) {
    destEntity = viewer.entities.add({
      id: "nav-destination",
      position: pos,
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString("#52e0a5"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: navTarget.id || "DEST",
        font: "bold 13px Inter, Segoe UI, sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#52e0a5"),
        outlineColor: Cesium.Color.fromCssColorString("#06121e"),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  } else {
    destEntity.position = pos;
    destEntity.label.text = navTarget.id || "DEST";
    destEntity.show = true;
  }
}

export function syncAircraftEntity(f) {
  if (!aircraftEntity || !f || !viewer) return;
  const pos = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt);
  aircraftEntity.position = pos;
  aircraftEntity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
    pos,
    new Cesium.HeadingPitchRoll(modelHeadingFromFlight(f.heading), f.pitch, f.roll)
  );
}

export function syncCameraFromFlight(f) {
  if (!viewer || !f) return;
  viewer.trackedEntity = undefined;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  const position = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt + 1.4);
  viewer.camera.setView({
    destination: position,
    orientation: new Cesium.HeadingPitchRoll(f.heading, f.pitch + 0.03, f.roll * 0.5),
  });
  viewer.scene.requestRender();
}

export function syncChaseCamera(f, cameraZoom = 1) {
  if (!viewer || !f) return;
  viewer.trackedEntity = undefined;

  const position = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt);
  const zoom = Math.max(0.35, Math.min(3.5, cameraZoom || 1));
  const range = Math.max(80, 90 + f.speed * 2.8) * zoom;
  const transform = Cesium.Transforms.headingPitchRollToFixedFrame(
    position,
    new Cesium.HeadingPitchRoll(f.heading, f.pitch, f.roll)
  );

  // Aircraft-local offset: behind the nose, slightly above — follows pitch and roll.
  viewer.camera.lookAtTransform(
    transform,
    new Cesium.Cartesian3(-f.roll * 40, -range, 35 + f.pitch * 90)
  );
  viewer.scene.requestRender();
}

export function bindGlobeZoom(state, container) {
  if (!container) return () => {};

  const onWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    state.cameraZoom = Math.max(0.35, Math.min(3.5, (state.cameraZoom ?? 1) * factor));

    if (!state.flying && viewer) {
      viewer.camera.zoomIn(event.deltaY > 0 ? 1.15 : -1.15);
      viewer.scene.requestRender();
    }
  };

  container.addEventListener("wheel", onWheel, { passive: false });
  return () => container.removeEventListener("wheel", onWheel);
}

export function adjustCameraZoom(state, direction) {
  const factor = direction > 0 ? 1.15 : 0.87;
  state.cameraZoom = Math.max(0.35, Math.min(3.5, (state.cameraZoom ?? 1) * factor));
  if (!state.flying && viewer) {
    viewer.camera.zoomIn(direction > 0 ? 1.2 : -1.2);
    viewer.scene.requestRender();
  }
}

export function flyToAirport(ap) {
  if (!viewer) return;
  const zoom = Math.max(0.35, Math.min(3.5, window.__earthState?.cameraZoom ?? 1));
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(ap.lon, ap.lat, ap.alt + 1200 * zoom),
    orientation: {
      heading: ap.heading,
      pitch: Cesium.Math.toRadians(-22),
      roll: 0,
    },
    duration: 2.2,
  });
}

export function setAircraftVisible(show) {
  if (aircraftEntity) aircraftEntity.show = show;
}

export function destroyGlobe() {
  clearTrafficEntities();
  clearWreckEntities();
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = null;
  aircraftEntity = null;
}
