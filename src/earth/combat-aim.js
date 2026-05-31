/**
 * Weapon aim solution — target pick, screen projection, HUD aim state.
 */

import { computeNavTo } from "./nav.js";
import { horizontalDistanceM } from "./traffic.js";

export const GUN_AIM_RANGE_M = 4500;
export const MISSILE_AIM_RANGE_M = 18000;
const AIM_CONE_RAD = 0.65;
const GUN_MAX_ALT_DIFF_M = 550;
const WEAPON_AIM_HOLD_MS = 900;

function buildAimFromTraffic(player, t) {
  const nav = computeNavTo(player, t);
  const distM = horizontalDistanceM(player, t);
  const km = distM / 1000;
  const altDiffM = Math.round(t.alt - player.alt);
  const headingErrorRad = nav?.headingErrorRad ?? 0;
  return {
    traffic: t,
    id: t.id,
    label: t.label,
    km: Math.round(km * 10) / 10,
    distM,
    altDiffM,
    headingErrorRad,
    inCone: Math.abs(headingErrorRad) <= AIM_CONE_RAD,
    inGunRange: distM <= GUN_AIM_RANGE_M && Math.abs(altDiffM) <= GUN_MAX_ALT_DIFF_M,
    inMissileRange: distM <= MISSILE_AIM_RANGE_M,
  };
}

export function pickAimTarget(state) {
  const player = state.flight;
  const traffic = state.traffic || [];
  if (!traffic.length) return null;

  const lockId = state.combat?.lockId;
  if (lockId) {
    const locked = traffic.find((t) => t.id === lockId);
    if (locked) return buildAimFromTraffic(player, locked);
  }

  let best = null;
  let bestDist = Infinity;
  for (const t of traffic) {
    const info = buildAimFromTraffic(player, t);
    if (!info.inCone) continue;
    if (info.distM < bestDist) {
      bestDist = info.distM;
      best = info;
    }
  }
  return best;
}

export function isWeaponAimActive(state) {
  if (!state.flying || state.paused || state.flight?.crashed) return false;
  const c = state.combat;
  if (!c) return false;
  if (state.input?.fireGun) return true;
  if (c.lockId) return true;
  if (c.lastGunFlash && performance.now() - c.lastGunFlash < WEAPON_AIM_HOLD_MS) return true;
  if (c.lastMissileFlash && performance.now() - c.lastMissileFlash < 1400) return true;
  return false;
}

function projectWorldPoint(viewer, Cesium, lon, lat, alt, width, height) {
  const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
  const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);
  if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
    return { onScreen: false, visible: false };
  }

  const margin = 8;
  const onScreen =
    win.x >= margin &&
    win.x <= width - margin &&
    win.y >= margin &&
    win.y <= height - margin &&
    (win.z === undefined || (win.z >= 0 && win.z <= 1));

  const cx = width / 2;
  const cy = height / 2;
  let edgeX = win.x;
  let edgeY = win.y;
  let edgeAngle = Math.atan2(win.y - cy, win.x - cx);

  if (!onScreen) {
    const inset = Math.min(cx, cy) - 48;
    edgeX = cx + Math.cos(edgeAngle) * inset;
    edgeY = cy + Math.sin(edgeAngle) * inset;
  }

  return {
    visible: true,
    onScreen,
    x: win.x,
    y: win.y,
    edgeX,
    edgeY,
    edgeAngle,
  };
}

export function updateCombatAim(state, viewer, Cesium, width, height) {
  if (!state.combat) return;
  if (!viewer || viewer.isDestroyed?.()) {
    state.combat.aim = { active: false };
    return;
  }

  const active = isWeaponAimActive(state);
  if (!active) {
    state.combat.aim = { active: false };
    return;
  }

  const picked = pickAimTarget(state);
  if (!picked) {
    state.combat.aim = {
      active: true,
      hasTarget: false,
      mode: state.input?.fireGun ? "GUN" : state.combat.lockId ? "MSL" : "SCAN",
    };
    return;
  }

  const t = picked.traffic;
  const screen = projectWorldPoint(viewer, Cesium, t.lon, t.lat, t.alt, width, height);

  state.combat.aim = {
    active: true,
    hasTarget: true,
    mode: state.input?.fireGun ? "GUN" : state.combat.lockId ? "MSL" : "TRACK",
    id: picked.id,
    label: picked.label,
    km: picked.km,
    altDiffM: picked.altDiffM,
    headingErrorRad: picked.headingErrorRad,
    inCone: picked.inCone,
    inGunRange: picked.inGunRange,
    inMissileRange: picked.inMissileRange,
    missileLock: state.combat.lockId === picked.id,
    lat: t.lat,
    lon: t.lon,
    alt: t.alt,
    ...screen,
  };
}
