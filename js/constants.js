(() => {
  const AudioEngine = {
    ctx: null,
    enabled: true,
    ensureContext() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this.ctx = new Ctx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    },
    playTone(freq, duration = 0.08, type = "sine", volume = 0.045) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },
    click() { this.playTone(680, 0.06, "square", 0.03); },
    success() { this.playTone(880, 0.07, "triangle", 0.035); setTimeout(() => this.playTone(1100, 0.08, "triangle", 0.03), 70); },
    warning() { this.playTone(210, 0.12, "sawtooth", 0.03); },
    startupSweep() {
      this.playTone(160, 0.14, "sawtooth", 0.025);
      setTimeout(() => this.playTone(260, 0.12, "sawtooth", 0.022), 120);
      setTimeout(() => this.playTone(420, 0.1, "triangle", 0.02), 240);
    },
  };

  const CONSTANTS = {
    STARTING_CASH: 12000,
    STARTING_REPUTATION: 50,
    GRAVITY: 9.8,
    THRUST_FORCE: 32,
    DRAG_COEFF: 0.022,
    PITCH_RATE: 1.8,
    MAX_FLAPS: 3,
    MISSION_PAYOUT_BASE: 1800,
    CRASH_PENALTY: 1400,
    CAMERA_SHAKE_MAX: 5.5,
    GROUND_Y: 260,
    MAX_ALTITUDE: 100,
    TAKEOFF_ALTITUDE: 22,
    MISSION_CRUISE_X: 280,
    MISSION_LANDING_X: 500,
    LANDING_ZONE_X: 460,
    GROUND_ROLL_SEC: 0.45,
    MAX_SAFE_SINK: 34,
    MAX_HARD_SINK: 48,
    GLIDE_SLOPE: 0.11,
  };

  window.CONSTANTS = CONSTANTS;
  window.AudioEngine = AudioEngine;
})();
