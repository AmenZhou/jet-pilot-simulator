/** Quick gun hitscan test — cruise near traffic, aim, fire until hit or timeout. */
import { chromium } from "playwright";

const GAME_URL = process.env.GAME_URL || "http://localhost:5173/earth.html";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(GAME_URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__earthAgent && window.__earthStep, null, { timeout: 30000 });

await page.evaluate(() => {
  window.__earthAgent.setControlMode("assisted");
  window.__earthAgent.startMission("SFO", "LAX");
  window.__earthAgent.beginFlight();
  window.__earthAgent.setGameSpeed(4);
  window.__earthState.paused = false;
  window.__earthState.agentDrive = true;
});

for (let i = 0; i < 50; i++) {
  await page.evaluate(({ step }) => window.__earthStep?.(step), { step: 0.48 });
  await page.waitForTimeout(400);
}

// Force cruise altitude and spawn-like state
const st0 = await page.evaluate(() => {
  const s = window.__earthState;
  s.takeoff.phase = "complete";
  s.mission.phase = "cruise";
  s.flight.gearDown = false;
  s.flight.speed = 200;
  s.flight.throttle = 0.7;
  return { traffic: s.traffic.length, kills: s.combat.kills };
});
console.log("After climb:", st0);

let kills = 0;
for (let step = 0; step < 120; step++) {
  const r = await page.evaluate(() => {
    const s = window.__earthState;
    const f = s.flight;
    let nearest = null;
    let bestKm = Infinity;
    for (const t of s.traffic) {
      const lat1 = (f.lat * Math.PI) / 180;
      const lat2 = (t.lat * Math.PI) / 180;
      const dLon = ((t.lon - f.lon) * Math.PI) / 180;
      const a =
        Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const km = (2 * 6371000 * Math.asin(Math.sqrt(a))) / 1000;
      if (km < bestKm) {
        bestKm = km;
        nearest = t;
      }
    }
    if (nearest && bestKm < 8) {
      const nav = window.__earthAgent;
      const y = Math.sin(((nearest.lon - f.lon) * Math.PI) / 180) * Math.cos((nearest.lat * Math.PI) / 180);
      const x =
        Math.cos((f.lat * Math.PI) / 180) * Math.sin((nearest.lat * Math.PI) / 180) -
        Math.sin((f.lat * Math.PI) / 180) *
          Math.cos((nearest.lat * Math.PI) / 180) *
          Math.cos(((nearest.lon - f.lon) * Math.PI) / 180);
      f.heading = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
      f.pitch = Math.max(-0.05, Math.min(0.08, (nearest.alt - f.alt) * 0.0003));
    }
    const before = s.combat.kills;
    window.__earthAgent.fireGun();
    window.__earthStep?.(0.12);
    return {
      km: bestKm ? Math.round(bestKm * 10) / 10 : null,
      kills: s.combat.kills,
      hit: s.combat.kills > before,
      status: s.status,
    };
  });
  if (r.hit) {
    kills = r.kills;
    console.log(`GUN HIT @ step ${step}: ${r.status} (range ${r.km} km)`);
    break;
  }
  if (step % 20 === 0) console.log(`step ${step}: nearest ${r.km} km, kills ${r.kills}, ${r.status}`);
}

await browser.close();
if (kills > 0) {
  console.log("PASS: gun hitscan works");
} else {
  console.error("FAIL: no gun kill in 120 steps");
  process.exitCode = 1;
}
