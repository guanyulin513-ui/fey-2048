export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.65;
    this.muted = false;
    this.bgmEnabled = true;
    this.bgmNodes = [];
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
    if (!this.bgmEnabled) this.stopBgm();
    else this.playBgm(true);
    return this.bgmEnabled;
  }

  playUi(kind) {
    const freq = kind === "switch" ? 420 : 620;
    this.beep({ frequency: freq, duration: 0.06, type: "triangle", volume: 0.09 });
  }

  playSfx(kind) {
    const table = {
      move: () => this.beep({ frequency: 170, duration: 0.05, type: "square", volume: 0.05 }),
      bump: () => this.beep({ frequency: 120, duration: 0.08, type: "sawtooth", volume: 0.05 }),
      attack: () => {
        this.beep({ frequency: 150, duration: 0.06, type: "square", volume: 0.07 });
        this.beep({ frequency: 110, duration: 0.08, delay: 0.03, type: "sawtooth", volume: 0.04 });
      },
      lose: () => {
        this.beep({ frequency: 220, duration: 0.12, type: "triangle", volume: 0.05 });
        this.beep({ frequency: 160, duration: 0.2, delay: 0.09, type: "triangle", volume: 0.05 });
      },
    };
    table[kind]?.();
  }

  playMerge(value) {
    const note = Math.min(760, 220 + Math.log2(value) * 52);
    this.beep({ frequency: note, duration: 0.1, type: "triangle", volume: 0.07 });
  }

  playBgm(loop = false) {
    if (!this.bgmEnabled) return;
    this.unlock();
    if (!this.ctx || this.bgmNodes.length) return;

    const notes = [220, 277.18, 329.63];
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = index === 0 ? 0.018 : 0.012;
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.bgmNodes.push(osc, gain);
    });

    const sway = this.ctx.createOscillator();
    const swayGain = this.ctx.createGain();
    sway.type = "sine";
    sway.frequency.value = 0.08;
    swayGain.gain.value = 9;
    sway.connect(swayGain);

    for (let i = 0; i < this.bgmNodes.length; i += 2) {
      const osc = this.bgmNodes[i];
      swayGain.connect(osc.frequency);
    }

    sway.start();
    this.bgmNodes.push(sway, swayGain);

    if (!loop) {
      setTimeout(() => this.stopBgm(), 3000);
    }
  }

  stopBgm() {
    this.bgmNodes.forEach((node) => {
      try { node.stop?.(); } catch (_) {}
      try { node.disconnect?.(); } catch (_) {}
    });
    this.bgmNodes = [];
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
