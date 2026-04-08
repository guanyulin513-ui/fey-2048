export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.65;
    this.muted = false;
    this.bgmEnabled = true;
    this.bgmOsc = null;
    this.bgmLfo = null;
  }

  unlock() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);
  }

  setVolume(value) {
    this.volume = Number(value) / 100;
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.value = this.volume;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    return this.muted;
  }

  toggleBgm() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBgm();
    } else {
      this.playBgm(true);
    }
    return this.bgmEnabled;
  }

  playUi(kind) {
    const freq = kind === "switch" ? 460 : 620;
    this.beep({ frequency: freq, duration: 0.06, type: "triangle", volume: 0.09 });
  }

  playSfx(kind) {
    const table = {
      move: () => this.beep({ frequency: 180, duration: 0.05, type: "square", volume: 0.05 }),
      bump: () => this.beep({ frequency: 120, duration: 0.08, type: "sawtooth", volume: 0.06 }),
      card: () => {
        this.beep({ frequency: 540, duration: 0.08, type: "triangle", volume: 0.07 });
        this.beep({ frequency: 760, duration: 0.09, delay: 0.04, type: "triangle", volume: 0.06 });
      },
      attack: () => {
        this.beep({ frequency: 160, duration: 0.06, type: "square", volume: 0.08 });
        this.beep({ frequency: 110, duration: 0.08, delay: 0.03, type: "sawtooth", volume: 0.05 });
      },
      lose: () => {
        this.beep({ frequency: 240, duration: 0.09, type: "triangle", volume: 0.06 });
        this.beep({ frequency: 160, duration: 0.18, delay: 0.08, type: "triangle", volume: 0.06 });
      },
    };
    table[kind]?.();
  }

  playMerge(value) {
    const note = Math.min(900, 260 + Math.log2(value) * 70);
    this.beep({ frequency: note, duration: 0.1, type: "triangle", volume: 0.08 });
  }

  playBgm(loop = false) {
    if (!this.bgmEnabled) return;
    this.unlock();
    if (!this.ctx || this.bgmOsc) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 196;
    gain.gain.value = 0.025;

    lfo.type = "sine";
    lfo.frequency.value = 0.4;
    lfoGain.gain.value = 25;

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    lfo.start();

    this.bgmOsc = osc;
    this.bgmLfo = lfo;

    if (!loop) {
      setTimeout(() => this.stopBgm(), 1500);
    }
  }

  stopBgm() {
    try {
      this.bgmOsc?.stop();
      this.bgmLfo?.stop();
    } catch (_) {}
    this.bgmOsc = null;
    this.bgmLfo = null;
  }

  beep({ frequency = 440, duration = 0.08, delay = 0, type = "sine", volume = 0.08 }) {
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
