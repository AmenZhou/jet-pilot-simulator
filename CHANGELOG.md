# Changelog

## 0.1.1 — 2026-05-29

### Agent (Earth heuristic)

- Retract gear after liftoff (AGL > 35 m) via explicit `toggle_gear` instead of silent in-page override.
- Level pitch in cruise band (180–320 m AGL) so climb attitude does not stick at 0.14 rad through cruise.
- Run pitch/throttle assist after action execution to avoid gear toggle races with stale `readState`.
