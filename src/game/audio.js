// ============================================================
// audio.js —— WebAudio 合成音效，零音频文件
// 简单方波/正弦 blip：射击、命中、拾取、升级、受伤、雷击
// ============================================================

let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 通用：频率滑音 blip
function blip(freq0, freq1, dur, type = 'square', vol = 0.08) {
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  } catch (e) {
    /* 音频不可用时静默 */
  }
}

// 噪声 burst（爆炸/雷击用）
function noise(dur, vol = 0.12) {
  try {
    const c = ac();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g).connect(c.destination);
    src.start();
  } catch (e) {
    /* 静默 */
  }
}

export const sfx = {
  shoot() { blip(700, 300, 0.08, 'square', 0.04); },
  hit() { blip(300, 150, 0.06, 'square', 0.05); },
  kill() { noise(0.12, 0.08); blip(200, 60, 0.12, 'sawtooth', 0.05); },
  pickup() { blip(900, 1400, 0.07, 'sine', 0.06); },
  coin() { blip(1200, 1800, 0.09, 'sine', 0.05); },
  levelup() { blip(400, 800, 0.18, 'square', 0.07); setTimeout(() => blip(600, 1200, 0.22, 'square', 0.07), 120); },
  hurt() { blip(220, 90, 0.15, 'sawtooth', 0.09); },
  thunder() { noise(0.3, 0.14); blip(120, 40, 0.3, 'sawtooth', 0.08); },
  select() { blip(500, 900, 0.1, 'square', 0.06); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, f, 0.25, 'square', 0.07), i * 150)); },
  lose() { [400, 300, 220, 150].forEach((f, i) => setTimeout(() => blip(f, f * 0.8, 0.25, 'sawtooth', 0.07), i * 160)); },
};

// 解锁音频（必须在用户手势中调用一次）
export function unlockAudio() {
  try { ac(); } catch (e) { /* 静默 */ }
}
