// ============================================================
// audio.js —— WebAudio 合成音效，零音频文件
// 懒创建 AudioContext（首次用户手势时 unlockAudio），共享噪声缓冲，
// 高频音效节流，localStorage 记住静音选择
// ============================================================

const MUTE_KEY = 'pixel-survivor-muted';

let ctx = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* 无痕模式 */ }

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // 共享 1 秒噪声缓冲，所有噪声音效复用，不重复创建
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

// 节流：同一音效两次触发的最小间隔（ms）
const lastPlay = {};
function throttled(name, ms) {
  const now = performance.now();
  if (now - (lastPlay[name] || 0) < ms) return false;
  lastPlay[name] = now;
  return true;
}

// 通用滑音 tone
function tone({ f0, f1 = f0, dur = 0.1, type = 'square', vol = 0.06, delay = 0 }) {
  if (muted) return;
  try {
    const c = ac(), t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) { /* 音频不可用时静默 */ }
}

// 滤波噪声 whoosh（带通中心频率 f0 -> f1 扫动）
function whoosh({ dur = 0.08, vol = 0.1, f0 = 3000, f1 = 800, q = 1.2 }) {
  if (muted) return;
  try {
    const c = ac(), t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  } catch (e) { /* 静默 */ }
}

// 低通噪声爆响（爆炸 / 雷击用）
function noiseBurst({ dur = 0.2, vol = 0.12, cutoff = 900 }) {
  if (muted) return;
  try {
    const c = ac(), t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.7;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  } catch (e) { /* 静默 */ }
}

export const sfx = {
  attack() { whoosh({ dur: 0.08, vol: 0.07, f0: 2500, f1: 700 }); }, // 飞弹发射：短促挥击
  hit() { // 击中敌人：低沉 thud（高频时节流）
    if (!throttled('hit', 50)) return;
    tone({ f0: 140, f1: 55, dur: 0.08, type: 'sine', vol: 0.09 });
  },
  kill() { // 敌人死亡：下降低频 blip + 噪声（敌人死得多，70ms 节流）
    if (!throttled('kill', 70)) return;
    tone({ f0: 220, f1: 55, dur: 0.14, type: 'sawtooth', vol: 0.06 });
    noiseBurst({ dur: 0.1, vol: 0.05, cutoff: 1200 });
  },
  pickup(combo = 0) { // 经验宝石：上扬 sine ping，连击轻微升调
    const f = 880 * Math.pow(2, Math.min(combo, 12) / 24);
    tone({ f0: f, f1: f * 1.5, dur: 0.09, type: 'sine', vol: 0.06 });
  },
  coin() {
    if (!throttled('coin', 60)) return;
    tone({ f0: 1200, f1: 1800, dur: 0.09, type: 'sine', vol: 0.05 });
  },
  levelup() { // 小琶音 C-E-G
    [523.25, 659.25, 783.99].forEach((f, i) =>
      tone({ f0: f, dur: 0.16, type: 'triangle', vol: 0.08, delay: i * 0.09 }));
  },
  hurt() { // 玩家受伤：刺耳 buzz
    if (!throttled('hurt', 120)) return;
    tone({ f0: 200, f1: 70, dur: 0.2, type: 'sawtooth', vol: 0.1 });
  },
  lightning() { // 落雷：噪声爆响 + 低频轰鸣
    noiseBurst({ dur: 0.35, vol: 0.16 });
    tone({ f0: 90, f1: 35, dur: 0.4, type: 'sawtooth', vol: 0.09 });
  },
  axe() { whoosh({ dur: 0.12, vol: 0.05, f0: 1800, f1: 500 }); }, // 飞斧解锁：轻 whoosh
  win() { // 胜利：上行 fanfare
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone({ f0: f, dur: 0.22, type: 'triangle', vol: 0.08, delay: i * 0.13 }));
  },
  lose() { // 失败：下行音阶
    [392, 330, 262, 196].forEach((f, i) =>
      tone({ f0: f, f1: f * 0.94, dur: 0.24, type: 'sawtooth', vol: 0.07, delay: i * 0.17 }));
  },
  ui() { tone({ f0: 600, f1: 900, dur: 0.06, type: 'square', vol: 0.045 }); }, // 界面点击
};

// 解锁音频（必须在用户手势中调用一次）
export function unlockAudio() {
  try { ac(); } catch (e) { /* 静默 */ }
}
