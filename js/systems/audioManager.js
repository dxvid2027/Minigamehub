// ==========================================================================
// AudioManager — fully procedural Web Audio SFX + ambient music.
// No external audio files are used so the platform runs 100% offline.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { eventBus } from "../core/eventBus.js";

const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // C major-ish pentatonic-friendly

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this._musicTimer = null;
    this._musicStep = 0;
    this._unlocked = false;
    const unlock = () => this._ensureCtx();
    ["pointerdown", "keydown", "touchstart"].forEach(evt => window.addEventListener(evt, unlock, { once: true, passive: true }));
  }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this._unlocked = true;
    this.applySettings();
  }

  applySettings() {
    if (!this.ctx) return;
    const s = saveManager.data.settings;
    const muteMult = s.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(s.masterVolume * muteMult, this.ctx.currentTime, 0.02);
    this.musicGain.gain.setTargetAtTime(s.musicVolume, this.ctx.currentTime, 0.02);
    this.sfxGain.gain.setTargetAtTime(s.sfxVolume, this.ctx.currentTime, 0.02);
  }

  setVolume(kind, value) {
    saveManager.data.settings[kind] = value;
    saveManager.save();
    this.applySettings();
  }

  toggleMute(force) {
    const s = saveManager.data.settings;
    s.muted = force !== undefined ? force : !s.muted;
    saveManager.save();
    this.applySettings();
    eventBus.emit("audio:mute", s.muted);
    return s.muted;
  }

  // --- low level synth helpers -------------------------------------------
  _tone({ freq = 440, dur = 0.15, type = "sine", gain = 0.22, delay = 0, slideTo = null, gainNode = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(gainNode || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.2, gain = 0.18, delay = 0, filterFreq = 1200 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t0);
  }

  // --- named SFX -----------------------------------------------------------
  play(name) {
    this._ensureCtx();
    if (!this.ctx) return;
    switch (name) {
      case "click": this._tone({ freq: 520, dur: 0.06, type: "square", gain: 0.12 }); break;
      case "hover": this._tone({ freq: 700, dur: 0.035, type: "sine", gain: 0.06 }); break;
      case "toggle": this._tone({ freq: 440, dur: 0.05, type: "triangle", gain: 0.1 }); this._tone({ freq: 660, dur: 0.05, delay: 0.04, type: "triangle", gain: 0.08 }); break;
      case "start": this._tone({ freq: 330, dur: 0.12, type: "triangle", gain: 0.16, slideTo: 660 }); break;
      case "pause": this._tone({ freq: 440, dur: 0.09, type: "sine", gain: 0.14 }); break;
      case "coin": this._tone({ freq: 987, dur: 0.09, type: "square", gain: 0.14 }); this._tone({ freq: 1318, dur: 0.12, delay: 0.05, type: "square", gain: 0.12 }); break;
      case "score": this._tone({ freq: 660, dur: 0.08, type: "sine", gain: 0.14 }); break;
      case "pop": this._noise({ dur: 0.06, gain: 0.16, filterFreq: 2200 }); break;
      case "hit": this._noise({ dur: 0.12, gain: 0.22, filterFreq: 900 }); break;
      case "explosion": this._noise({ dur: 0.4, gain: 0.3, filterFreq: 500 }); this._tone({ freq: 90, dur: 0.35, type: "sawtooth", gain: 0.2, slideTo: 40 }); break;
      case "swoosh": this._noise({ dur: 0.18, gain: 0.12, filterFreq: 2600 }); break;
      case "error": this._tone({ freq: 220, dur: 0.18, type: "sawtooth", gain: 0.16, slideTo: 110 }); break;
      case "win": [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone({ freq: f, dur: 0.2, delay: i * 0.09, type: "triangle", gain: 0.17 })); break;
      case "lose": [392, 349.23, 293.66, 220].forEach((f, i) => this._tone({ freq: f, dur: 0.22, delay: i * 0.1, type: "sawtooth", gain: 0.15 })); break;
      case "levelup": [440, 554.37, 659.25, 880, 1108.7].forEach((f, i) => this._tone({ freq: f, dur: 0.22, delay: i * 0.07, type: "square", gain: 0.15 })); break;
      case "achievement": [659.25, 880, 1108.7].forEach((f, i) => this._tone({ freq: f, dur: 0.18, delay: i * 0.06, type: "triangle", gain: 0.18 })); break;
      case "combo": this._tone({ freq: 800 + Math.random() * 400, dur: 0.07, type: "square", gain: 0.13 }); break;
      case "select": this._tone({ freq: 600, dur: 0.05, type: "sine", gain: 0.12 }); break;
      case "flap": this._tone({ freq: 300, dur: 0.08, type: "sine", gain: 0.14, slideTo: 500 }); break;
      case "jump": this._tone({ freq: 340, dur: 0.09, type: "square", gain: 0.14, slideTo: 620 }); break;
      case "gameover": this._noise({ dur: 0.3, gain: 0.2, filterFreq: 700 }); [330, 220].forEach((f, i) => this._tone({ freq: f, dur: 0.3, delay: i * 0.12, type: "sawtooth", gain: 0.16 })); break;
      default: this._tone({ freq: 440, dur: 0.08, gain: 0.1 });
    }
  }

  // --- ambient background music -------------------------------------------
  startMusic() {
    this._ensureCtx();
    if (!this.ctx || this._musicTimer) return;
    const step = () => {
      if (!saveManager.data.settings.muted) {
        const note = SCALE[Math.floor(Math.random() * SCALE.length)] / 2;
        this._tone({ freq: note, dur: 1.6, type: "sine", gain: 0.05, gainNode: this.musicGain });
        if (Math.random() > 0.6) this._tone({ freq: note * 2, dur: 0.9, delay: 0.3, type: "triangle", gain: 0.03, gainNode: this.musicGain });
      }
      this._musicTimer = setTimeout(step, 1500 + Math.random() * 900);
    };
    step();
  }

  stopMusic() {
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  }
}

export const audioManager = new AudioManager();
export default audioManager;
