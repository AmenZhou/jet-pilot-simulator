/**
 * Hyper Mach cap regression — enable hyper above 120 m AGL, verify MAX_MACH=300 at runtime.
 */
import { chromium } from "playwright";

const GAME_URL = process.env.GAME_URL || "http://localhost:5173/earth.html";
const TICK_MS = 2000;
const MAX_STEPS = 80;
const ACCEL_STEPS = 40;

async function step(page, dt) {
  await page.evaluate(({ step }) => window.__earthStep?.(step), { step: dt });
  await page.waitForTimeout(TICK_MS);
}

async function readHyperState(page) {
  return page.evaluate(() => {
    const s = window.__earthState;
    const f = s.flight;
    const t = s.telemetry;
    return {
      agl: Math.round(t?.agl ?? 0),
      kt: Math.round(f.speed * 1.94384),
      takeoff: s.takeoff?.phase,
      mission: s.mission?.phase,
      hyper: Boolean(s.hyperSpeed),
      canHyper: Boolean(window.__earthAgent?.canEnableHyperSpeed?.()),
      blockReason: window.__earthAgent?.hyperBlockReason?.() || null,
      speedMode: window.__earthAgent?.speedModeLabel?.(),
      maxMachConstant: window.__earthAgent?.maxMachConstant?.() ?? null,
      speedCapMach: window.__earthAgent?.speedCapMach?.() ?? null,
      currentMach: window.__earthAgent?.currentMach?.() ?? null,
      status: s.status,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(GAME_URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__earthAgent && window.__earthStep, null, { timeout: 30000 });

const boot = await readHyperState(page);
console.log(`Runtime MAX_MACH constant: ${boot.maxMachConstant}`);

await page.evaluate(() => {
  window.__earthAgent.setControlMode("assisted");
  window.__earthAgent.startMission("SFO", "LAX");
  window.__earthAgent.beginFlight();
  window.__earthAgent.setGameSpeed(4);
  window.__earthState.paused = false;
  window.__earthState.agentDrive = true;
});

const dt = TICK_MS / 1000;
let hyperEnabled = false;
let enableStep = null;
let peakMach = 0;
let peakCapMach = 0;

for (let i = 1; i <= MAX_STEPS; i += 1) {
  await step(page, dt);
  const st = await readHyperState(page);
  if (i <= 20 || i % 5 === 0 || st.canHyper) {
    console.log(
      `[${String(i).padStart(2)}] ${st.kt}kt mach ${st.currentMach?.toFixed?.(2) ?? "?"} cap ${st.speedCapMach?.toFixed?.(0) ?? "?"} agl ${st.agl}m hyper ${st.hyper}`
    );
  }

  if (st.canHyper && !hyperEnabled) {
    await page.evaluate(() => {
      window.__earthAgent.toggleHyperSpeed();
      window.__earthAgent.setThrottle(1);
    });
    const after = await readHyperState(page);
    hyperEnabled = after.hyper;
    enableStep = i;
    console.log(`>>> toggle_hyper @ step ${i} => hyper=${after.hyper} capMach=${after.speedCapMach} mode=${after.speedMode}`);
    if (!hyperEnabled || after.speedCapMach !== 300) {
      console.error(`FAIL: hyper cap expected 300, got ${after.speedCapMach}`);
      process.exitCode = 1;
    }
    break;
  }
}

if (hyperEnabled) {
  console.log(`\nAccelerating in hyper for ${ACCEL_STEPS} steps…`);
  for (let j = 1; j <= ACCEL_STEPS; j += 1) {
    await page.evaluate(() => window.__earthAgent.setThrottle(1));
    await step(page, dt);
    const st = await readHyperState(page);
    peakMach = Math.max(peakMach, st.currentMach ?? 0);
    peakCapMach = st.speedCapMach ?? peakCapMach;
    if (j % 5 === 0 || j === ACCEL_STEPS) {
      console.log(
        `  accel ${String(j).padStart(2)}: mach ${st.currentMach?.toFixed?.(2)} / cap ${st.speedCapMach?.toFixed?.(0)} (${st.kt} kt)`
      );
    }
  }
}

const final = await readHyperState(page);
await browser.close();

console.log("\n── Mach 300 cap test ──");
console.log(`  MAX_MACH constant : ${final.maxMachConstant}`);
console.log(`  Hyper enabled     : ${hyperEnabled} (step ${enableStep ?? "never"})`);
console.log(`  Speed cap (mach)  : ${final.speedCapMach}`);
console.log(`  Peak mach reached : ${peakMach.toFixed(2)}`);
console.log(`  Final mach        : ${final.currentMach?.toFixed?.(2)}`);

let failed = false;
if (final.maxMachConstant !== 300) {
  console.error(`FAIL: runtime MAX_MACH is ${final.maxMachConstant}, expected 300`);
  failed = true;
}
if (!hyperEnabled) {
  console.error("FAIL: hyper never enabled");
  failed = true;
}
if (hyperEnabled && final.speedCapMach !== 300) {
  console.error(`FAIL: hyper speed cap is ${final.speedCapMach}, expected 300`);
  failed = true;
}
if (hyperEnabled && peakMach <= 100) {
  console.error(`FAIL: peak mach ${peakMach.toFixed(2)} did not exceed 100 — still capped at old Mach 100?`);
  failed = true;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("PASS: hyper cap is Mach 300 and aircraft accelerates past Mach 100");
}
