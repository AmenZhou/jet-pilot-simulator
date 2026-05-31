/**
 * 3D aim markers on locked traffic — bracket diamond in the globe view.
 */

import { modelHeadingFromFlight } from "./constants.js";

const aimMarkerEntities = new Map();

function bracketPoints(Cesium, origin, hpr, spanM) {
  const transform = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr);
  const corners = [
    new Cesium.Cartesian3(-spanM, spanM * 0.35, spanM * 0.15),
    new Cesium.Cartesian3(spanM, spanM * 0.35, spanM * 0.15),
    new Cesium.Cartesian3(spanM, spanM * 0.35, -spanM * 0.15),
    new Cesium.Cartesian3(-spanM, spanM * 0.35, -spanM * 0.15),
    new Cesium.Cartesian3(-spanM, spanM * 0.35, spanM * 0.15),
  ];
  return corners.map((local) =>
    Cesium.Matrix4.multiplyByPoint(transform, local, new Cesium.Cartesian3())
  );
}

function syncMarkerForTarget(viewer, aim, Cesium) {
  const t = aim;
  const origin = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.alt);
  const hpr = new Cesium.HeadingPitchRoll(
    modelHeadingFromFlight(t.heading || 0),
    t.pitch || 0,
    t.roll || 0
  );
  const span = Math.max(28, (t.length ?? 18) * 1.6);
  const lockColor = aim.missileLock || aim.inGunRange ? "#ffee55" : "#ff8844";
  const color = Cesium.Color.fromCssColorString(lockColor).withAlpha(0.92);
  const positions = bracketPoints(Cesium, origin, hpr, span);

  let group = aimMarkerEntities.get(aim.id);
  if (!group) {
    const bracket = viewer.entities.add({
      polyline: {
        positions,
        width: 3,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.4,
          color: new Cesium.ConstantProperty(color),
        }),
      },
    });
    const diamond = viewer.entities.add({
      position: origin,
      ellipse: {
        semiMajorAxis: span * 0.55,
        semiMinorAxis: span * 0.38,
        height: t.alt,
        material: Cesium.Color.TRANSPARENT,
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
      },
    });
    const pip = viewer.entities.add({
      position: origin,
      point: {
        pixelSize: 14,
        color,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    group = { bracket, diamond, pip };
    aimMarkerEntities.set(aim.id, group);
  } else {
    group.bracket.polyline.positions = positions;
    group.bracket.polyline.material.color = new Cesium.ConstantProperty(color);
    group.diamond.position = origin;
    group.diamond.ellipse.semiMajorAxis = span * 0.55;
    group.diamond.ellipse.semiMinorAxis = span * 0.38;
    group.diamond.ellipse.height = t.alt;
    group.diamond.ellipse.outlineColor = color;
    group.pip.position = origin;
    group.pip.point.color = color;
  }
}

export function syncAimTargetMarkers(viewer, state, Cesium) {
  if (!viewer) return;

  const aim = state.combat?.aim;
  const activeId = aim?.active && aim?.hasTarget ? aim.id : null;

  for (const [id, group] of aimMarkerEntities) {
    if (id !== activeId) {
      viewer.entities.remove(group.bracket);
      viewer.entities.remove(group.diamond);
      viewer.entities.remove(group.pip);
      aimMarkerEntities.delete(id);
    }
  }

  if (!activeId || !aim) return;

  const traffic = state.traffic?.find((t) => t.id === aim.id);
  if (!traffic) return;

  syncMarkerForTarget(
    viewer,
    {
      ...traffic,
      missileLock: aim.missileLock,
      inGunRange: aim.inGunRange,
    },
    Cesium
  );
}

export function clearAimTargetMarkers(viewer) {
  if (!viewer) return;
  for (const group of aimMarkerEntities.values()) {
    viewer.entities.remove(group.bracket);
    viewer.entities.remove(group.diamond);
    viewer.entities.remove(group.pip);
  }
  aimMarkerEntities.clear();
}
