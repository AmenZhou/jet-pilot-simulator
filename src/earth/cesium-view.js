import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

let viewer = null;
let aircraftEntity = null;

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
    viewerOptions.terrain = Cesium.Terrain.fromWorldTerrain();
  }

  viewer = new Cesium.Viewer(container, viewerOptions);

  if (!token) {
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        credit: "© CARTO © OpenStreetMap",
      })
    );
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

  aircraftEntity = viewer.entities.add({
    name: "Jet",
    show: false,
    position: new Cesium.CallbackProperty(() => {
      const f = window.__earthState?.flight;
      if (!f) return Cesium.Cartesian3.ZERO;
      return Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt);
    }, false),
    orientation: new Cesium.CallbackProperty(() => {
      const f = window.__earthState?.flight;
      if (!f) return Cesium.Quaternion.IDENTITY;
      const pos = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt);
      return Cesium.Transforms.headingPitchRollQuaternion(
        pos,
        new Cesium.HeadingPitchRoll(f.heading, f.pitch, f.roll)
      );
    }, false),
    box: {
      dimensions: new Cesium.Cartesian3(14, 5, 5),
      material: Cesium.Color.fromCssColorString("#48b8ff").withAlpha(0.75),
      outline: true,
      outlineColor: Cesium.Color.CYAN,
    },
    path: {
      show: true,
      width: 2,
      leadTime: 0,
      trailTime: 60,
      material: Cesium.Color.CYAN.withAlpha(0.45),
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

export function syncCameraFromFlight(f) {
  if (!viewer || !f) return;
  viewer.trackedEntity = undefined;

  const position = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt + 1.4);
  viewer.camera.setView({
    destination: position,
    orientation: new Cesium.HeadingPitchRoll(f.heading, f.pitch + 0.03, f.roll * 0.5),
  });
}

export function syncChaseCamera() {
  if (!viewer || !aircraftEntity) return;
  viewer.trackedEntity = aircraftEntity;
  viewer.trackedEntityOffset = new Cesium.Cartesian3(-120, 0, 45);
}

export function flyToAirport(ap) {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(ap.lon, ap.lat, ap.alt + 1200),
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
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = null;
  aircraftEntity = null;
}
