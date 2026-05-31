import { horizontalDistanceM } from "./traffic.js";
import { moveAlongHeading } from "./physics.js";
import { computeNavTo } from "./nav.js";

const GUN_COOLDOWN_S = 0.1;
const GUN_RANGE_M = 2500;
const GUN_HIT_M = 85;

const MISSILE_COOLDOWN_S = 4;
const MISSILE_LOCK_RANGE_M = 15000;
const MISSILE_LOCK_CONE_RAD = 0.55;
const MISSILE_SPEED_MPS = 950;
const MISSILE_HIT_M = 140;
const MISSILE_TTL_S = 25;

const MAX_PROJECTILES = 20;

export function createCombatState() {
  return {
    kills: 0,
    gunCooldown: 0,
    missileCooldown: 0,
    lockId: null,
    projectiles: [],
    lastHitFlash: 0,
  };
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
  state.traffic = state.traffic.filter((t) => t.id !== target.id);
  state.combat.kills += 1;
  state.combat.lastHitFlash = performance.now();
  state.combat.lockId = null;
  state.status = `${label} destroyed — ${state.combat.kills} kill(s)`;
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
    const lateral = horiz * Math.abs(Math.sin(nav.headingErrorRad));
    const score = lateral + altDiff * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best && bestScore <= GUN_HIT_M) {
    destroyTraffic(state, best, best.label);
    return true;
  }
  return false;
}

export function fireGun(state) {
  if (!state.flying || state.paused || state.flight.crashed) return false;
  if (state.combat.gunCooldown > 0) return false;
  state.combat.gunCooldown = GUN_COOLDOWN_S;
  const hit = gunHitscan(state);
  if (!hit) state.status = "Guns — no hit (aim at traffic, <2.5 km)";
  return hit;
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
  state.combat.missileCooldown = MISSILE_COOLDOWN_S;
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
