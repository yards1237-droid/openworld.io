// Tiny WebAudio synth: engine hum, crashes, coins, sirens. No assets needed.
class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noise!: AudioBuffer;
  o1!: OscillatorNode;
  o2!: OscillatorNode;
  eg!: GainNode;
  ef!: BiquadFilterNode;
  so!: OscillatorNode;
  sg!: GainNode;
  muted = false;
  coinT = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem("neon-outlaw-muted") === "1";
    } catch {
      /* ignore */
    }
  }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      this.ctx = c;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(c.destination);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.o1 = c.createOscillator();
      this.o1.type = "sawtooth";
      this.o2 = c.createOscillator();
      this.o2.type = "square";
      this.ef = c.createBiquadFilter();
      this.ef.type = "lowpass";
      this.ef.frequency.value = 400;
      this.eg = c.createGain();
      this.eg.gain.value = 0;
      this.o1.connect(this.ef);
      this.o2.connect(this.ef);
      this.ef.connect(this.eg);
      this.eg.connect(this.master);
      this.o1.start();
      this.o2.start();
      this.so = c.createOscillator();
      this.so.type = "triangle";
      this.sg = c.createGain();
      this.sg.gain.value = 0;
      this.so.connect(this.sg);
      this.sg.connect(this.master);
      this.so.start();
    }
    void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem("neon-outlaw-muted", m ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  engine(ratio: number, boost: boolean, on: boolean) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const f = 48 + ratio * 120 + (boost ? 40 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * 1.505, t, 0.05);
    this.ef.frequency.setTargetAtTime(300 + ratio * 900 + (boost ? 600 : 0), t, 0.05);
    this.eg.gain.setTargetAtTime(on ? 0.07 + ratio * 0.06 : 0, t, 0.08);
  }

  siren(level: number) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    this.so.frequency.setTargetAtTime(760 + Math.sin(t * 7) * 220, t, 0.01);
    this.sg.gain.setTargetAtTime(level * 0.035, t, 0.1);
  }

  tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur: number, vol: number, freq: number, type: BiquadFilterType = "lowpass", slide = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  crash(k: number) {
    const v = Math.min(1, k);
    this.burst(0.25 + v * 0.3, 0.25 + v * 0.5, 900 + v * 600, "lowpass", -600);
    this.tone(90 - v * 30, 0.2, "square", 0.15 * v + 0.05, -40);
  }
  explode() {
    this.burst(1.1, 0.9, 1400, "lowpass", -1200);
    this.tone(70, 0.8, "sawtooth", 0.35, -50);
  }
  thump() {
    this.tone(160, 0.12, "sine", 0.3, -90);
    this.burst(0.1, 0.18, 1200, "bandpass");
  }
  coin(streak: number) {
    const f = 880 * Math.pow(1.0595, Math.min(12, streak));
    this.tone(f, 0.09, "square", 0.07);
    this.tone(f * 1.5, 0.14, "square", 0.06, 0, 0.06);
  }
  power() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, "triangle", 0.15, 0, i * 0.06));
  }
  boost() {
    this.burst(0.5, 0.25, 500, "bandpass", 2500);
  }
  door() {
    this.tone(220, 0.08, "square", 0.12, -80);
    this.burst(0.08, 0.15, 800);
  }
  jobDone() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, "square", 0.1, 0, i * 0.07));
  }
  star() {
    this.tone(440, 0.15, "sawtooth", 0.14, 0);
    this.tone(660, 0.25, "sawtooth", 0.14, 0, 0.12);
  }
  over() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, "sawtooth", 0.16, -10, i * 0.16));
  }
  ui() {
    this.tone(660, 0.07, "square", 0.08);
  }
  skid(v: number) {
    if (Math.random() < 0.06) this.burst(0.12, 0.05 * v, 3000, "bandpass");
  }
}

export const sfx = new Sfx();
