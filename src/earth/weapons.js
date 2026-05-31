import { horizontalDistanceM } from "./traffic.js";
import { moveAlongHeading } from "./physics.js";
import { computeNavTo } from "./nav.js";
import { startWreck } from "./traffic-wreck.js";
import {
  createEffectState,
  spawnGunEffects,
  spawnMissileLaunchEffect,
} from "./weapon-effects.js";

const GUN_COOLDOWN_S = 0.08;
const GUN_RANGE_M = 4500;
const GUN_HIT_M = 180;
const GUN_MAX_ALT_DIFF_M = 550;

const MISSILE_COOLDOWN_S = 3.5;
const MISSILE_LOCK_RANGE_M = 18000;
const MISSILE_LOCK_CONE_RAD = 0.65;
const MISSILE_SPEED_MPS = 1100;
const MISSILE_HIT_M = 180;
const MISSILE_TTL_S = 30;

const MAX_PROJECTILES = 20;

export function createCombatState() {
  return {
    kills: 0,
    gunCooldown: 0,
    missileCooldown: 0,
    lockId: null,
    projectiles: [],
    lastHitFlash: 0,
    lastGunFlash: 0,
    lastMissileFlash: 0,
    interceptTargetId: null,
    interceptUntil: 0,
    effects: createEffectState(),
  };
}

export function pickNearestTraffic(state, maxKm = 20) {
  const player = state.flight;
  let best = null;
  let bestKm = Infinity;
  for (const t of state.traffic || []) {
    const km = horizontalDistanceM(player, t) / 1000;
    if (km > maxKm) continue;
    if (km < bestKm) {
      bestKm = km;
      best = t;
    }
  }
  if (!best) return null;
  const nav = computeNavTo(player, best);
  return {
    id: best.id,
    label: best.label,
    km: Math.round(bestKm * 10) / 10,
    altDiffM: Math.round(best.alt - player.alt),
    bearingRad: nav?.bearingRad ?? player.heading,
    headingErrorRad: nav?.headingErrorRad ?? 0,
  };
}

export function setCombatIntercept(state, targetId, seconds = 12) {
  if (!state.combat) state.combat = createCombatState();
  state.combat.interceptTargetId = targetId || null;
  state.combat.interceptUntil = targetId ? performance.now() + seconds * 1000 : 0;
}

export function clearCombatIntercept(state) {
  if (!state.combat) return;
  state.combat.interceptTargetId = null;
  state.combat.interceptUntil = 0;
}

export function isCombatInterceptActive(state) {
  const c = state.combat;
  if (!c?.interceptTargetId) return false;
  if (c.interceptUntil && performance.now() > c.interceptUntil) {
    clearCombatIntercept(state);
    return false;
  }
  return state.traffic.some((t) => t.id === c.interceptTargetId);
}

function separationM(a, b) {
  const horiz = horizontalDistanceM(a, b);
  const vert = (a.alt ?? 0) - (b.alt ?? 0);
  return Math.sqrt(horiz * horiz + vert * vert);
}

function inForwardCone(player, target, halfAngleRad) {
  const nav = computeNavTo(player, target);
  if (!nav) return false;
  return Math.abs(nav.headingErrorRad) <= halfAngleRad;
}

function pickLockTarget(state) {
  const player = state.flight;
  let best = null;
  let bestDist = Infinity;
  for (const t of state.traffic) {
    const dist = horizontalDistanceM(player, t);
    if (dist > MISSILE_LOCK_RANGE_M) continue;
    if (!inForwardCone(player, t, MISSILE_LOCK_CONE_RAD)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

function destroyTraffic(state, target, label) {
  startWreck(state, target);
  state.traffic = state.traffic.filter((t) => t.id !== target.id);
  state.combat.kills += 1;
  state.combat.lastHitFlash = performance.now();
  state.combat.lockId = null;
  state.status = `${label} hit — burning and falling! (${state.combat.kills} kill${state.combat.kills === 1 ? "" : "s"})`;
}

function gunHitscan(state) {
  const player = state.flight;
  let best = null;
  let bestScore = Infinity;
  for (const t of state.traffic) {
    const horiz = horizontalDistanceM(player, t);
    if (horiz > GUN_RANGE_M) continue;
    const nav = computeNavTo(player, t);
    if (!nav || Math.abs(nav.headingErrorRad) > MISSILE_LOCK_CONE_RAD) continue;
    const altDiff = Math.abs(t.alt - player.alt);
    if (altDiff > GUN_MAX_ALT_DIFF_M) continue;
    const lateral = horiz * Math.abs(Math.sin(nav.headingErrorRad));
    const score = lateral + altDiff * 0.12;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best && bestScore <= GUN_HIT_M) {
    return { hit: true, target: best };
  }
  return { hit: false, target: best };
}

export function fireGun(state) {
  if (!state.flying || state.paused || state.flight.crashed) return false;
  if (state.combat.gunCooldown > 0) return false;
  state.combat.gunCooldown = GUN_COOLDOWN_S;
  state.combat.lastGunFlash = performance.now();
  const scan = gunHitscan(state);
  spawnGunEffects(state, {
    hitTarget: scan.hit ? scan.target : null,
    rangeM: GUN_RANGE_M,
  });
  if (scan.hit) {
    destroyTraffic(state, scan.target, scan.target.label);
    clearCombatIntercept(state);
    return true;
  }
  if (!scan.hit) {
    const near = pickNearestTraffic(state, GUN_RANGE_M / 1000);
    if (near) {
      setCombatIntercept(state, near.id);
      state.status = `Guns — no hit (${near.label} ${near.km} km, Δalt ${near.altDiffM} m)`;
    } else {
      state.status = "Guns — no traffic in range (<4.5 km ahead)";
    }
  }
  return false;
}

export function fireMissile(state) {
  if (!state.flying || state.paused || state.flight.crashed) return false;
  if (state.combat.missileCooldown > 0) {
    state.status = `Missile reloading — ${state.combat.missileCooldown.toFixed(1)}s`;
    return false;
  }
  const lock = pickLockTarget(state);
  if (!lock) {
    state.status = "Missile — no lock (traffic ahead, <15 km)";
    return false;
  }
  if (state.combat.projectiles.length >= MAX_PROJECTILES) {
    state.combat.projectiles.shift();
  }
  const player = state.flight;
  state.combat.projectiles.push({
    id: `msl-${Date.now()}`,
    kind: "missile",
    lat: player.lat,
    lon: player.lon,
    alt: player.alt,
    heading: player.heading,
    pitch: 0.04,
    roll: 0,
    speed: MISSILE_SPEED_MPS,
    targetId: lock.id,
    ttl: MISSILE_TTL_S,
  });
  state.combat.lockId = lock.id;
  setCombatIntercept(state, lock.id);
  state.combat.missileCooldown = MISSILE_COOLDOWN_S;
  state.combat.lastMissileFlash = performance.now();
  spawnMissileLaunchEffect(state);
  state.status = `Missile away — locked ${lock.label}`;
  return true;
}

function updateMissileProjectile(state, p, dt, Cesium) {
  const target = state.traffic.find((t) => t.id === p.targetId);
  if (target) {
    const nav = computeNavTo(p, target);
    if (nav) {
      let err = nav.headingErrorRad;
      p.heading = (p.heading + err * Math.min(1, dt * 2.8) + Math.PI * 2) % (Math.PI * 2);
      const altErr = target.alt - p.alt;
      p.pitch = Math.max(-0.2, Math.min(0.35, altErr * 0.0008));
    }
  }
  moveAlongHeading(p, p.speed, dt, Cesium);
  p.ttl -= dt;

  for (const t of state.traffic) {
    if (separationM(p, t) <= MISSILE_HIT_M) {
      destroyTraffic(state, t, t.label);
      return false;
    }
  }
  return p.ttl > 0;
}

export function updateWeapons(state, dt, Cesium) {
  if (!state.combat) state.combat = createCombatState();

  state.combat.gunCooldown = Math.max(0, state.combat.gunCooldown - dt);
  state.combat.missileCooldown = Math.max(0, state.combat.missileCooldown - dt);

  if (state.input?.fireGun && state.combat.gunCooldown <= 0) {
    fireGun(state);
  }

  const lock = pickLockTarget(state);
  state.combat.lockId = lock?.id ?? null;

  if (!state.flying || state.paused) return;

  state.combat.projectiles = state.combat.projectiles.filter((p) =>
    updateMissileProjectile(state, p, dt, Cesium)
  );
}
