/**
 * Cesium visuals for guns, missiles, and explosions.
 */

import { modelHeadingFromFlight } from "./constants.js";
import { clearAimTargetMarkers } from "./aim-target-view.js";

const EARTH_RADIUS_M = 6371000;
const MAX_TRACERS = 32;
const MAX_PUFFS = 16;
const MAX_EXPLOSIONS = 10;

const tracerEntities = new Map();
const missileEntities = new Map();
const puffEntities = new Map();
const explosionEntities = new Map();
const wreckFlameEntities = new Map();
const wreckSmokeEntities = new Map();

function destinationPoint(lat, lon, bearingRad, distM) {
  const d = distM / EARTH_RADIUS_M;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

function nosePoint(flight, offsetM = 14) {
  const horiz = destinationPoint(flight.lat, flight.lon, flight.heading, offsetM);
  const alt = flight.alt + Math.sin(flight.pitch) * offsetM;
  return { lat: horiz.lat, lon: horiz.lon, alt };
}

function posFromDegrees(Cesium, lat, lon, alt) {
  return Cesium.Cartesian3.fromDegrees(lon, lat, alt);
}

function pushLimited(list, item, max) {
  list.push(item);
  while (list.length > max) list.shift();
}

export function createEffectState() {
  return {
    tracers: [],
    puffs: [],
    explosions: [],
  };
}

/** Bright muzzle flash + tracer line when guns fire. */
export function spawnGunEffects(state, { hitTarget = null, rangeM = 4500 } = {}) {
  if (!state.combat) return;
  if (!state.combat.effects) state.combat.effects = createEffectState();
  const fx = state.combat.effects;
  const player = state.flight;
  const muzzle = nosePoint(player, 10);
  const now = performance.now();

  pushLimited(fx.puffs, {
    id: `muzzle-${now}`,
    kind: "muzzle",
    lat: muzzle.lat,
    lon: muzzle.lon,
    alt: muzzle.alt,
    born: now,
    ttl: 90,
  }, MAX_PUFFS);

  let end;
  if (hitTarget) {
    end = { lat: hitTarget.lat, lon: hitTarget.lon, alt: hitTarget.alt };
  } else {
    const tip = destinationPoint(player.lat, player.lon, player.heading, rangeM);
    end = {
      lat: tip.lat,
      lon: tip.lon,
      alt: player.alt + Math.tan(player.pitch) * rangeM,
    };
  }

  pushLimited(
    fx.tracers,
    {
      id: `tracer-${now}`,
      startLat: muzzle.lat,
      startLon: muzzle.lon,
      startAlt: muzzle.alt,
      endLat: end.lat,
      endLon: end.lon,
      endAlt: end.alt,
      hit: Boolean(hitTarget),
      born: now,
      ttl: hitTarget ? 220 : 160,
    },
    MAX_TRACERS
  );
}

/** Smoke puff when a missile launches. */
export function spawnMissileLaunchEffect(state) {
  if (!state.combat) return;
  if (!state.combat.effects) state.combat.effects = createEffectState();
  const fx = state.combat.effects;
  const wing = destinationPoint(state.flight.lat, state.flight.lon, state.flight.heading, 8);
  const now = performance.now();
  pushLimited(
    fx.puffs,
    {
      id: `launch-${now}`,
      kind: "launch",
      lat: wing.lat,
      lon: wing.lon,
      alt: state.flight.alt - 1,
      born: now,
      ttl: 450,
    },
    MAX_PUFFS
  );
}

/** Ground impact fireball when a wreck hits terrain. */
export function spawnWreckImpactEffect(state, wreck) {
  if (!state.combat || !wreck) return;
  spawnExplosionEffect(state, wreck);
}

/** Expanding fireball on ground impact. */
export function spawnExplosionEffect(state, target) {
  if (!state.combat || !target) return;
  if (!state.combat.effects) state.combat.effects = createEffectState();
  const fx = state.combat.effects;
  const now = performance.now();
  pushLimited(
    fx.explosions,
    {
      id: `boom-${now}`,
      lat: target.lat,
      lon: target.lon,
      alt: target.alt,
      born: now,
      ttl: 1800,
    },
    MAX_EXPLOSIONS
  );
}

function pruneEffects(fx, now) {
  fx.tracers = fx.tracers.filter((e) => now - e.born < e.ttl);
  fx.puffs = fx.puffs.filter((e) => now - e.born < e.ttl);
  fx.explosions = fx.explosions.filter((e) => now - e.born < e.ttl);
}

function syncTracers(viewer, fx, Cesium, now) {
  const active = new Set(fx.tracers.map((t) => t.id));
  for (const [id, ent] of tracerEntities) {
    if (!active.has(id)) {
      viewer.entities.remove(ent);
      tracerEntities.delete(id);
    }
  }

  for (const t of fx.tracers) {
    const age = now - t.born;
    const fade = 1 - age / t.ttl;
    const color = t.hit
      ? Cesium.Color.fromCssColorString("#ff6644").withAlpha(0.35 + fade * 0.65)
      : Cesium.Color.fromCssColorString("#ffe566").withAlpha(0.25 + fade * 0.75);

    const positions = [
      posFromDegrees(Cesium, t.startLat, t.startLon, t.startAlt),
      posFromDegrees(Cesium, t.endLat, t.endLon, t.endAlt),
    ];

    let ent = tracerEntities.get(t.id);
    if (!ent) {
      ent = viewer.entities.add({
        polyline: {
          positions,
          width: t.hit ? 4 : 2.5,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            color: new Cesium.ConstantProperty(color),
          }),
        },
      });
      tracerEntities.set(t.id, ent);
    } else {
      ent.polyline.positions = positions;
    }
  }
}

function syncPuffs(viewer, fx, Cesium, now) {
  const active = new Set(fx.puffs.map((p) => p.id));
  for (const [id, ent] of puffEntities) {
    if (!active.has(id)) {
      viewer.entities.remove(ent);
      puffEntities.delete(id);
    }
  }

  for (const p of fx.puffs) {
    const age = now - p.born;
    const fade = 1 - age / p.ttl;
    const isMuzzle = p.kind === "muzzle";
    const baseSize = isMuzzle ? 18 : 28;
    const size = baseSize * (0.4 + fade * 0.9);
    const color = isMuzzle
      ? Cesium.Color.fromCssColorString("#fff2aa").withAlpha(fade * 0.95)
      : Cesium.Color.fromCssColorString("#ffb347").withAlpha(fade * 0.75);

    let ent = puffEntities.get(p.id);
    const pos = posFromDegrees(Cesium, p.lat, p.lon, p.alt);
    if (!ent) {
      ent = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: size,
          color,
          outlineColor: Cesium.Color.fromCssColorString("#ff8800").withAlpha(fade * 0.5),
          outlineWidth: isMuzzle ? 1 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      puffEntities.set(p.id, ent);
    } else {
      ent.position = pos;
      ent.point.pixelSize = size;
      ent.point.color = color;
    }
  }
}

function syncExplosions(viewer, fx, Cesium, now) {
  const active = new Set(fx.explosions.map((e) => e.id));
  for (const [id, ent] of explosionEntities) {
    if (!active.has(id)) {
      viewer.entities.remove(ent);
      explosionEntities.delete(id);
    }
  }

  for (const e of fx.explosions) {
    const age = now - e.born;
    const t = age / e.ttl;
    const fade = 1 - t;
    const radius = 40 + t * 220;
    const pos = posFromDegrees(Cesium, e.lat, e.lon, e.alt);

    let ent = explosionEntities.get(e.id);
    if (!ent) {
      ent = viewer.entities.add({
        position: pos,
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: e.alt,
          material: Cesium.Color.fromCssColorString("#ff5522").withAlpha(fade * 0.55),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#ffcc66").withAlpha(fade * 0.8),
          outlineWidth: 2,
        },
        point: {
          pixelSize: 24 * fade,
          color: Cesium.Color.WHITE.withAlpha(fade * 0.9),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      explosionEntities.set(e.id, ent);
    } else {
      ent.position = pos;
      ent.ellipse.semiMajorAxis = radius;
      ent.ellipse.semiMinorAxis = radius;
      ent.ellipse.material = Cesium.Color.fromCssColorString("#ff5522").withAlpha(fade * 0.55);
      ent.ellipse.outlineColor = Cesium.Color.fromCssColorString("#ffcc66").withAlpha(fade * 0.8);
      ent.point.pixelSize = 24 * fade;
      ent.point.color = Cesium.Color.WHITE.withAlpha(fade * 0.9);
    }
  }
}

function syncMissiles(viewer, projectiles, Cesium) {
  const active = new Set((projectiles || []).map((p) => p.id));
  for (const [id, group] of missileEntities) {
    if (!active.has(id)) {
      if (group.body) viewer.entities.remove(group.body);
      if (group.trail) viewer.entities.remove(group.trail);
      missileEntities.delete(id);
    }
  }

  for (const p of projectiles || []) {
    const pos = posFromDegrees(Cesium, p.lat, p.lon, p.alt);
    const hpr = new Cesium.HeadingPitchRoll(
      modelHeadingFromFlight(p.heading),
      p.pitch ?? 0,
      0
    );
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);

    let group = missileEntities.get(p.id);
    if (!group) {
      const body = viewer.entities.add({
        position: pos,
        orientation,
        cylinder: {
          length: 5.5,
          topRadius: 0.12,
          bottomRadius: 0.28,
          material: Cesium.Color.fromCssColorString("#ff9933"),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#fff0cc"),
          outlineWidth: 1,
        },
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#ffee88"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      const trail = viewer.entities.add({
        polyline: {
          positions: [pos.clone(), pos.clone()],
          width: 3,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.fromCssColorString("#ffaa44").withAlpha(0.85),
          }),
        },
      });
      group = { body, trail, trailPoints: [pos.clone()] };
      missileEntities.set(p.id, group);
    } else {
      group.body.position = pos;
      group.body.orientation = orientation;

      const trailPts = group.trailPoints;
      const last = trailPts[trailPts.length - 1];
      if (!last || Cesium.Cartesian3.distance(last, pos) > 8) {
        trailPts.push(pos.clone());
        while (trailPts.length > 28) trailPts.shift();
      }
      group.trail.polyline.positions = trailPts;
    }
  }
}

function flameWorldPoint(Cesium, w, east, north, up) {
  const origin = posFromDegrees(Cesium, w.lat, w.lon, w.alt);
  const hpr = new Cesium.HeadingPitchRoll(
    modelHeadingFromFlight(w.heading),
    w.pitch,
    w.roll ?? 0
  );
  const transform = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr);
  return Cesium.Matrix4.multiplyByPoint(
    transform,
    new Cesium.Cartesian3(east, north, up),
    new Cesium.Cartesian3()
  );
}

function syncWreckFlames(viewer, wrecks, Cesium) {
  const active = new Set();
  const now = performance.now();

  for (const w of wrecks || []) {
    if (w.wreckPhase !== "falling") continue;
    active.add(w.id);

    const L = w.length ?? 18;
    const H = w.height ?? 5;
    const pulse = 0.7 + Math.sin(now * 0.014 + (w.flameSeed || 0)) * 0.3;
    const flameOffsets = [
      [0, L * 0.05, H * 0.05],
      [-L * 0.22, L * 0.02, -1],
      [L * 0.22, L * 0.02, -1],
      [0, -L * 0.35, H * 0.06],
    ];

    let flames = wreckFlameEntities.get(w.id);
    if (!flames) {
      flames = flameOffsets.map((_, i) =>
        viewer.entities.add({
          position: posFromDegrees(Cesium, w.lat, w.lon, w.alt),
          point: {
            pixelSize: 16,
            color: Cesium.Color.fromCssColorString("#ffee55"),
            outlineColor: Cesium.Color.fromCssColorString("#ff4400"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      );
      wreckFlameEntities.set(w.id, flames);
    }

    flameOffsets.forEach((off, i) => {
      const pos = flameWorldPoint(Cesium, w, ...off);
      const size = (i === 3 ? 28 : 20) * pulse;
      const ent = flames[i];
      ent.position = pos;
      ent.point.pixelSize = size;
      ent.point.color = Cesium.Color.fromCssColorString(i === 3 ? "#ff6622" : "#ffdd44").withAlpha(
        0.85 + pulse * 0.15
      );
    });
  }

  for (const [id, flames] of wreckFlameEntities) {
    if (!active.has(id)) {
      for (const ent of flames) viewer.entities.remove(ent);
      wreckFlameEntities.delete(id);
    }
  }
}

function syncWreckSmoke(viewer, wrecks, Cesium) {
  const active = new Set();

  for (const w of wrecks || []) {
    if (w.wreckPhase !== "falling" || !w.smokeTrail?.length) continue;
    active.add(w.id);

    const positions = w.smokeTrail.map((p) => posFromDegrees(Cesium, p.lat, p.lon, p.alt));
    let ent = wreckSmokeEntities.get(w.id);
    if (!ent) {
      ent = viewer.entities.add({
        polyline: {
          positions,
          width: 5,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: Cesium.Color.fromCssColorString("#666666").withAlpha(0.65),
          }),
        },
      });
      wreckSmokeEntities.set(w.id, ent);
    } else {
      ent.polyline.positions = positions;
    }
  }

  for (const [id, ent] of wreckSmokeEntities) {
    if (!active.has(id)) {
      viewer.entities.remove(ent);
      wreckSmokeEntities.delete(id);
    }
  }
}

export function syncWreckEffects(viewer, wrecks, Cesium) {
  if (!viewer) return;
  syncWreckFlames(viewer, wrecks, Cesium);
  syncWreckSmoke(viewer, wrecks, Cesium);
}

export function syncWeaponEffects(viewer, state, Cesium) {
  if (!viewer || !state.combat) return;
  const fx = state.combat.effects || createEffectState();
  state.combat.effects = fx;
  const now = performance.now();
  pruneEffects(fx, now);

  if (!state.flying) {
    clearWeaponEffects(viewer);
    return;
  }

  syncTracers(viewer, fx, Cesium, now);
  syncPuffs(viewer, fx, Cesium, now);
  syncExplosions(viewer, fx, Cesium, now);
  syncMissiles(viewer, state.combat.projectiles, Cesium);
  syncWreckEffects(viewer, state.wrecks, Cesium);
}

export function clearWeaponEffects(viewer) {
  if (!viewer) return;
  clearAimTargetMarkers(viewer);
  for (const ent of tracerEntities.values()) viewer.entities.remove(ent);
  for (const group of missileEntities.values()) {
    if (group.body) viewer.entities.remove(group.body);
    if (group.trail) viewer.entities.remove(group.trail);
  }
  for (const ent of puffEntities.values()) viewer.entities.remove(ent);
  for (const ent of explosionEntities.values()) viewer.entities.remove(ent);
  for (const flames of wreckFlameEntities.values()) {
    for (const ent of flames) viewer.entities.remove(ent);
  }
  for (const ent of wreckSmokeEntities.values()) viewer.entities.remove(ent);
  tracerEntities.clear();
  missileEntities.clear();
  puffEntities.clear();
  explosionEntities.clear();
  wreckFlameEntities.clear();
  wreckSmokeEntities.clear();
}
