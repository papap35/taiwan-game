// 用 WebAudio 即時合成的復古音效，不需要任何音檔
let ctx = null;
let master = null;

const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = sfx.volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'square', vol = 0.25, delay = 0 }) {
  if (!sfx.enabled) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.1, vol = 0.2, delay = 0, freq = 1200 }) {
  if (!sfx.enabled) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  enabled: load('sfx.enabled', true),
  volume: load('sfx.volume', 0.6),
  setEnabled(v) {
    this.enabled = v;
    save('sfx.enabled', v);
  },
  setVolume(v) {
    this.volume = v;
    save('sfx.volume', v);
    if (master) master.gain.value = v;
  },
  unlock: () => ac(),
  coin() {
    tone({ freq: 988, dur: 0.08, vol: 0.2 });
    tone({ freq: 1319, dur: 0.25, vol: 0.2, delay: 0.08 });
  },
  ding() {
    tone({ freq: 1568, dur: 0.15, type: 'sine', vol: 0.25 });
    tone({ freq: 2093, dur: 0.25, type: 'sine', vol: 0.2, delay: 0.1 });
  },
  click: () => tone({ freq: 600, dur: 0.04, vol: 0.12 }),
  step: () => tone({ freq: 140, dur: 0.03, type: 'triangle', vol: 0.06 }),
  bump: () => tone({ freq: 220, to: 880, dur: 0.1, vol: 0.2 }),
  clack: () => noise({ dur: 0.05, vol: 0.35, freq: 2500 }),
  thud: () => tone({ freq: 120, to: 50, dur: 0.15, type: 'sine', vol: 0.4 }),
  whack() {
    noise({ dur: 0.08, vol: 0.5, freq: 800 });
    tone({ freq: 300, to: 80, dur: 0.12, type: 'triangle', vol: 0.3 });
  },
  boing: () => tone({ freq: 200, to: 600, dur: 0.2, type: 'sine', vol: 0.3 }),
  bad() {
    tone({ freq: 300, to: 100, dur: 0.3, type: 'sawtooth', vol: 0.2 });
  },
  swish: () => noise({ dur: 0.25, vol: 0.3, freq: 3000 }),
  tick: () => tone({ freq: 1200, dur: 0.02, vol: 0.08 }),
  motor: () => tone({ freq: 90, dur: 0.1, type: 'sawtooth', vol: 0.05 }),
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, vol: 0.2, delay: i * 0.1 }));
  },
  win() {
    [784, 988, 1175, 1568, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 0.12, vol: 0.2, delay: i * 0.08 }));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.25, delay: i * 0.18 }));
  },
};
