// Web Audio API Synthesizer for 100% reliable offline sound effects

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
    this.lastBounceTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBounce(intensity = 0.5) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    // Rate-limit high frequency collisions
    const now = performance.now();
    if (now - this.lastBounceTime < 30) return;
    this.lastBounceTime = now;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const baseFreq = 220 + Math.random() * 80 + intensity * 150;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.08);

      const hitVol = Math.min(0.2, (0.05 + intensity * 0.15) * this.volume);
      gain.gain.setValueAtTime(hitVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio fallback silent
    }
  }

  playDrop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      // Satisfying drop cascade sound
      const freqs = [580, 480, 360, 240];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = this.ctx.currentTime + idx * 0.04;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.6, startTime + 0.12);

        gain.gain.setValueAtTime(0.2 * this.volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.12);
      });
    } catch {
      // Audio fallback silent
    }
  }

  playElimination() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      // Deep whoosh & falling sweep
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.3 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch {
      // Audio fallback silent
    }
  }

  playTop5Alert() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const notes = [440, 554, 659];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.1);
        gain.gain.setValueAtTime(0.25 * this.volume, this.ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.1 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + idx * 0.1);
        osc.stop(this.ctx.currentTime + idx * 0.1 + 0.25);
      });
    } catch {
      // Audio fallback silent
    }
  }

  playHeartbeat() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.35 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {
      // Audio fallback silent
    }
  }

  playVictory() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      // Trumpet / celebratory fanfare chords: C5, E5, G5, C6
      const fanfare = [
        { f: 523.25, time: 0, dur: 0.15 },
        { f: 659.25, time: 0.15, dur: 0.15 },
        { f: 783.99, time: 0.3, dur: 0.2 },
        { f: 1046.50, time: 0.55, dur: 0.8 }
      ];

      fanfare.forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, this.ctx.currentTime + note.time);

        gain.gain.setValueAtTime(0.35 * this.volume, this.ctx.currentTime + note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + note.time + note.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + note.time);
        osc.stop(this.ctx.currentTime + note.time + note.dur);
      });
    } catch {
      // Audio fallback silent
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

export const sound = new SoundManager();
