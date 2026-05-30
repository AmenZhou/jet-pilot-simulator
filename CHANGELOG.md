# Changelog

## 0.2.0 — 2026-05-30

### Fly Earth — takeoff & speed

- **V-speed takeoff sequence** (roll → rotate at VR → liftoff → V2 climb) with assisted autopilot; takeoff capped ~190 kt so VR/V2 stay visible.
- **`speed-mode.js`**: separate thrust/drag for takeoff, normal cruise (~Mach 0.85), and hyper (Mach 100 via **M**); hyper disabled until airborne and above ~120 m AGL.
- **Assisted cruise** climbs to **~320 m AGL** and **~375 kt** instead of locking low/slow (~100 mph) when cruise began at runway height.
- **Terrain**: clamp Ion `groundAlt` on airport pads (fixes bogus 100m+ AGL spikes at KSFO/LAX).
- **Physics**: keep pilot altitude on horizontal moves (no ellipsoid snap); stay on ground during low-speed takeoff roll.

### Fly Earth — traffic & visuals

- **3D traffic aircraft** via `cesium-air.glb` (scaled by type) instead of billboard dots; composite-box fallback if model fails.
- Player aircraft uses the same glTF in chase view.
- Traffic entities sync safely for model vs multi-part groups (`try/catch` on sync errors).

### Agent & simulation

- **`agentDrive`**: browser `requestAnimationFrame` only renders; agent steps physics via `__earthStep` (no double-step / instant takeoff).
- Mission **not paused** at agent start; takeoff roll begins turn 1; **4× sim speed** only after cruise (not during takeoff).
- Assisted mode: agent does not override throttle/pitch/heading during takeoff; `set_heading` treats degrees as radians when LLM passes 138°.
- Mission re-arm if HMR resets state (turns 1–3); richer JSONL (`takeoff_phase`, `hyper_speed`, `groundspeed_kt`).
- **`ai-agent/SKILL.md`**: log signatures, healthy smoke criteria, fix playbook for earth agent runs.

### UI

- Hyper speed toggle (**M** / button); speed mode label on mission telemetry.
- V-speed tape on HUD during takeoff (from prior 0.1.x work, retained).

---

## 0.1.1 — 2026-05-29

### Agent (Earth heuristic)

- Retract gear after liftoff (AGL > 35 m) via explicit `toggle_gear` instead of silent in-page override.
- Level pitch in cruise band (180–320 m AGL) so climb attitude does not stick at 0.14 rad through cruise.
- Run pitch/throttle assist after action execution to avoid gear toggle races with stale `readState`.
