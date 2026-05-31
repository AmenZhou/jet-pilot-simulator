/**
 * 3D traffic aircraft — glTF model (real mesh) with composite-box fallback.
 */

import { modelHeadingFromFlight } from "./constants.js";

const AIRCRAFT_MODEL_URI = "/models/cesium-air.glb";

function modelScaleForType(t) {
  const L = t.length ?? 18;
  const type = t.type || "regional";
  if (type === "military") return Math.max(2.8, L * 0.38);
  if (type === "private") return Math.max(3.2, L * 0.42);
  if (type === "commercial") return Math.max(4.5, L * 0.52);
  return Math.max(3.8, L * 0.48);
}

function localOffset(Cesium, origin, hpr, east, north, up) {
  const transform = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr);
  return Cesium.Matrix4.multiplyByPoint(
    transform,
    new Cesium.Cartesian3(east, north, up),
    new Cesium.Cartesian3()
  );
}

export function aircraftPartLayout(t) {
  const L = t.length ?? 18;
  const W = t.width ?? 5;
  const H = t.height ?? 5;
  const type = t.type || "regional";

  if (type === "military") {
    return {
      fuselage: { dim: [L * 0.85, W * 0.55, H * 0.45], off: [0, 0, H * 0.08] },
      wings: { dim: [W * 2.4, L * 0.55, H * 0.12], off: [0, L * 0.02, -H * 0.05] },
      tail: { dim: [W * 0.35, L * 0.22, H * 0.55], off: [0, -L * 0.38, H * 0.22] },
      stab: { dim: [W * 1.1, L * 0.18, H * 0.1], off: [0, -L * 0.36, H * 0.08] },
    };
  }

  return {
    fuselage: { dim: [W * 0.72, L * 0.95, H * 0.62], off: [0, L * 0.02, H * 0.1] },
    wings: { dim: [W * 2.6, L * 0.28, H * 0.11], off: [0, L * 0.06, -H * 0.06] },
    tail: { dim: [W * 0.32, L * 0.2, H * 0.75], off: [0, -L * 0.42, H * 0.35] },
    stab: { dim: [W * 1.15, L * 0.16, H * 0.09], off: [0, -L * 0.4, H * 0.12] },
    engineL: { dim: [W * 0.42, L * 0.22, H * 0.42], off: [-W * 0.72, L * 0.12, -H * 0.18] },
    engineR: { dim: [W * 0.42, L * 0.22, H * 0.42], off: [W * 0.72, L * 0.12, -H * 0.18] },
  };
}

function partMaterial(Cesium, t, partName) {
  const base = t.baseColor || t.color || "#9eb4c8";
  const tint = t.color || base;
  if (partName === "fuselage") return Cesium.Color.fromCssColorString(base).withAlpha(0.96);
  if (partName === "engineL" || partName === "engineR") {
    return Cesium.Color.fromCssColorString("#4a5568").withAlpha(0.95);
  }
  return Cesium.Color.fromCssColorString(tint).withAlpha(0.92);
}

function trafficLabel(Cesium, t) {
  if (t.wreckPhase) {
    return {
      text: t.wreckPhase === "impacted" ? `💥 ${t.label}` : `🔥 ${t.label}`,
      font: "bold 12px Inter, Segoe UI, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#ff8844"),
      outlineColor: Cesium.Color.fromCssColorString("#1a0800"),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -36),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 120000),
      show: true,
    };
  }
  const sepLabel = t.verticalSep === "above" ? "↑" : t.verticalSep === "below" ? "↓" : "=";
  const altFt = Math.round((t.altOffsetM ?? 0) / 0.3048);
  return {
    text: `${t.label} ${sepLabel}${altFt >= 0 ? "+" : ""}${altFt}ft`,
    font: "11px Inter, Segoe UI, sans-serif",
    fillColor: Cesium.Color.fromCssColorString(t.color || "#71b0ff"),
    outlineColor: Cesium.Color.fromCssColorString("#06121e"),
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -32),
    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 90000),
    show: true,
  };
}

function modelTint(Cesium, t) {
  if (t.wreckPhase) {
    return Cesium.Color.fromCssColorString(t.wreckPhase === "impacted" ? "#331100" : "#ff5522");
  }
  return Cesium.Color.fromCssColorString(t.baseColor || t.color || "#9eb4c8");
}

function modelBlendAmount(t) {
  return t.wreckPhase ? 0.72 : 0.35;
}

function silhouetteFor(Cesium, t) {
  if (t.wreckPhase) {
    return Cesium.Color.fromCssColorString("#ffaa33");
  }
  return Cesium.Color.fromCssColorString(t.color || "#71b0ff");
}

function silhouetteSizeFor(t) {
  return t.wreckPhase ? 3.2 : 1.8;
}

function createModelEntity(viewer, t, Cesium) {
  const origin = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.alt);
  const hpr = new Cesium.HeadingPitchRoll(
    modelHeadingFromFlight(t.heading),
    t.pitch,
    t.roll ?? 0
  );
  const tint = modelTint(Cesium, t);

  const entity = viewer.entities.add({
    name: t.label,
    show: true,
    position: origin,
    orientation: Cesium.Transforms.headingPitchRollQuaternion(origin, hpr),
    model: {
      uri: AIRCRAFT_MODEL_URI,
      scale: modelScaleForType(t),
      minimumPixelSize: 64,
      maximumScale: 50000,
      runAnimations: false,
      color: tint,
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      colorBlendAmount: modelBlendAmount(t),
      silhouetteColor: silhouetteFor(Cesium, t),
      silhouetteSize: silhouetteSizeFor(t),
    },
    label: trafficLabel(Cesium, t),
  });

  return { id: t.id, mode: "model", entity, parts: null, layout: null };
}

function createCompositeGroup(viewer, t, Cesium) {
  const layout = aircraftPartLayout(t);
  const parts = {};
  const partNames = ["fuselage", "wings", "tail", "stab", "engineL", "engineR"];

  for (const name of partNames) {
    const part = layout[name];
    if (!part) continue;
    const [dx, dy, dz] = part.dim;
    parts[name] = viewer.entities.add({
      name: `${t.label}-${name}`,
      show: true,
      box: {
        dimensions: new Cesium.Cartesian3(dx, dy, dz),
        material: partMaterial(Cesium, t, name),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#0a1628").withAlpha(0.5),
      },
      label: name === "fuselage" ? trafficLabel(Cesium, t) : undefined,
    });
  }

  return { id: t.id, mode: "composite", entity: null, parts, layout };
}

export function createTrafficAircraftGroup(viewer, t, Cesium) {
  return createModelEntity(viewer, t, Cesium);
}

export function updateTrafficAircraftGroup(group, t, Cesium) {
  const origin = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.alt);
  const hpr = new Cesium.HeadingPitchRoll(
    modelHeadingFromFlight(t.heading),
    t.pitch,
    t.roll ?? 0
  );
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(origin, hpr);

  if (group.mode === "model" && group.entity) {
    group.entity.position = origin;
    group.entity.orientation = orientation;
    if (group.entity.model) {
      group.entity.model.scale = modelScaleForType(t);
      group.entity.model.color = modelTint(Cesium, t);
      group.entity.model.colorBlendAmount = modelBlendAmount(t);
      group.entity.model.silhouetteColor = silhouetteFor(Cesium, t);
      group.entity.model.silhouetteSize = silhouetteSizeFor(t);
    }
    if (group.entity.label) {
      const lbl = trafficLabel(Cesium, t);
      group.entity.label.text = lbl.text;
      group.entity.label.fillColor = lbl.fillColor;
      group.entity.label.font = lbl.font;
    }
    return;
  }

  if (!group.parts || !group.layout) return;

  for (const [name, entity] of Object.entries(group.parts)) {
    const part = group.layout[name];
    if (!part || !entity) continue;
    entity.position = localOffset(Cesium, origin, hpr, ...part.off);
    entity.orientation = orientation;
    if (entity.box) entity.box.material = partMaterial(Cesium, t, name);
    if (name === "fuselage" && entity.label) {
      Object.assign(entity.label, trafficLabel(Cesium, t));
    }
  }
}

export function removeTrafficAircraftGroup(viewer, group) {
  if (!viewer || !group) return;
  if (group.entity) viewer.entities.remove(group.entity);
  if (group.parts) {
    for (const entity of Object.values(group.parts)) {
      viewer.entities.remove(entity);
    }
  }
}
