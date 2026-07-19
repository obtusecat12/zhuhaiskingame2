// ============================================================================
// js/audio.js — 《珠海剥皮人》WebAudio 全程序化音频（开发者A）
// 契约 §8：
//   Audio.init()         首次用户手势后调用（可安全重复调用）
//   Audio.sfx(name)      'step','run','search','pickup','door','hide',
//                        'teleport','save','plank','cracker','sting','hit',
//                        'skinned','win','click','flashlight'
//   Audio.startAmbient() 低频嗡鸣+滤波风声循环，偶发远处狗叫/猫叫
//   Audio.setTension(x)  0..1 追击时叠加急促心跳鼓点/高频弦音（平滑过渡）
//   Audio.stopAll()
// 无任何外部音频文件：振荡器 + 白噪声缓冲实时合成。
// ============================================================================

let ctx = null, master = null, noiseBuf = null;
let ambient = null;        // {nodes, timers, gain}
let tension = null;        // {nodes, timer, gain}
let tensionLevel = 0;

/* ---------- 基础 ---------- */
function init() {
  if (ctx) {                                   // 幂等：已建则仅确保 resume
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const len = ctx.sampleRate | 0;              // 共享 1s 白噪声缓冲
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function now() { return ctx.currentTime; }
function G(v) { const n = ctx.createGain(); n.gain.value = v; return n; }
function O(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
function N() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s; }
function F(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
/* 启音包络：快速起音、指数衰减 */
function env(g, t, peak, dur, a = 0.008) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
/* 噪声短促声 */
function burst(t, o) {
  const n = N(), f = F(o.type || 'lowpass', o.freq || 800, o.q || 1), g = G(0);
  n.playbackRate.value = o.rate || 1;
  n.connect(f); f.connect(g); g.connect(o.dest || master);
  env(g, t, o.peak || 0.15, o.dur || 0.1);
  n.start(t); n.stop(t + (o.dur || 0.1) + 0.05);
}
/* 单音（可滑音 f0->f1） */
function tone(t, o) {
  const osc = O(o.type || 'sine', o.f0 || 440), g = G(0);
  if (o.f1 > 0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.dur || 0.15));
  env(g, t, o.peak || 0.15, o.dur || 0.15, o.a || 0.008);
  if (o.lpf) { const fl = F('lowpass', o.lpf); osc.connect(fl); fl.connect(g); }
  else osc.connect(g);
  g.connect(o.dest || master);
  osc.start(t); osc.stop(t + (o.dur || 0.15) + 0.1);
  return osc;
}
/* 颤音 LFO */
function vib(param, t, rate, depth) {
  const l = O('sine', rate), lg = G(depth);
  l.connect(lg); lg.connect(param);
  l.start(t); l.stop(t + 2.5);
}

/* ================= SFX ================= */
const SFX = {
  step() {   // 脚步（沥青闷踏，带随机性）
    const t = now();
    burst(t, { freq: 620 + Math.random() * 160, peak: 0.11, dur: 0.10, rate: 0.9 + Math.random() * 0.3 });
  },
  run() {    // 奔跑（更重更急）
    const t = now();
    burst(t, { freq: 880 + Math.random() * 220, peak: 0.17, dur: 0.08, rate: 1.1 + Math.random() * 0.3 });
    tone(t, { type: 'sine', f0: 90, f1: 60, peak: 0.05, dur: 0.06 });
  },
  search() { // 搜刮（翻找刮擦）
    const t = now();
    for (let i = 0; i < 4; i++)
      burst(t + i * 0.10 + Math.random() * 0.03,
        { type: 'bandpass', freq: 420 + Math.random() * 700, q: 2, peak: 0.09, dur: 0.07 });
  },
  pickup() { // 拾取（上行双音）
    const t = now();
    tone(t, { type: 'sine', f0: 660, peak: 0.12, dur: 0.08 });
    tone(t + 0.07, { type: 'sine', f0: 990, peak: 0.12, dur: 0.12 });
  },
  door() {   // 开门（门轴吱呀 + 锁舌 + 闷响）
    const t = now();
    tone(t, { type: 'sawtooth', f0: 140, f1: 65, peak: 0.05, dur: 0.25, lpf: 500 });
    burst(t + 0.02, { type: 'bandpass', freq: 900, q: 2, peak: 0.07, dur: 0.05 });
    tone(t + 0.10, { type: 'sine', f0: 80, f1: 45, peak: 0.16, dur: 0.16 });
  },
  hide() {   // 躲藏（柜门闷合）
    const t = now();
    tone(t, { type: 'sine', f0: 115, f1: 42, peak: 0.18, dur: 0.22 });
    burst(t + 0.02, { freq: 320, peak: 0.06, dur: 0.14 });
    burst(t + 0.06, { type: 'bandpass', freq: 700, q: 3, peak: 0.05, dur: 0.04 });
  },
  teleport() { // 传送（下坠滑音 + 风噪扫频）
    const t = now(), d = 0.55;
    const o = tone(t, { type: 'sine', f0: 880, f1: 85, peak: 0.16, dur: d });
    vib(o.frequency, t, 11, 35);
    tone(t, { type: 'triangle', f0: 884, f1: 88, peak: 0.07, dur: d });
    const n = N(), f = F('bandpass', 2200, 1.5), g = G(0);
    f.frequency.exponentialRampToValueAtTime(180, t + d);
    n.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.08, d + 0.1);
    n.start(t); n.stop(t + d + 0.2);
  },
  save() {   // 存档（电话拨号音 DTMF 双音多频）
    const t = now();
    const digits = [[941, 1336], [697, 1209], [770, 1336], [852, 1477]];
    digits.forEach((dg, i) => {
      const tt = t + i * 0.14;
      tone(tt, { type: 'sine', f0: dg[0], peak: 0.09, dur: 0.10 });
      tone(tt, { type: 'sine', f0: dg[1], peak: 0.09, dur: 0.10 });
    });
    tone(t + 0.62, { type: 'sine', f0: 1568, peak: 0.06, dur: 0.09 });   // 确认音
  },
  plank() {  // 放木板（木击笃声）
    const t = now();
    tone(t, { type: 'square', f0: 170, f1: 120, peak: 0.12, dur: 0.06, lpf: 900 });
    burst(t, { freq: 1200, peak: 0.10, dur: 0.04 });
    tone(t + 0.08, { type: 'square', f0: 140, f1: 100, peak: 0.08, dur: 0.05, lpf: 800 });
  },
  cracker() { // 鞭炮（白噪声爆裂连响 + 收尾大响）
    let t = now() + 0.02;
    const nB = 8 + ((Math.random() * 4) | 0);
    for (let i = 0; i < nB; i++) {
      t += 0.03 + Math.random() * 0.055;
      burst(t, { type: 'highpass', freq: 1600 + Math.random() * 800, peak: 0.22 + Math.random() * 0.12, dur: 0.03 + Math.random() * 0.03, rate: 1.3 });
    }
    t += 0.09;
    burst(t, { type: 'lowpass', freq: 4200, peak: 0.32, dur: 0.12 });
    tone(t, { type: 'sine', f0: 120, f1: 55, peak: 0.14, dur: 0.12 });
  },
  sting() {  // 发现 sting（不谐和音簇 + 噪声击）
    const t = now();
    for (const f of [110, 116.54, 220, 233.08])
      tone(t, { type: 'sawtooth', f0: f, peak: 0.07, dur: 0.7, a: 0.01, lpf: 2600 });
    tone(t, { type: 'sine', f0: 55, f1: 38, peak: 0.18, dur: 0.5 });
    burst(t, { type: 'highpass', freq: 2400, peak: 0.13, dur: 0.25 });
  },
  hit() {    // 劈砍（破空 + 入肉闷击 + 金属微鸣）
    const t = now();
    burst(t, { type: 'highpass', freq: 2600, peak: 0.24, dur: 0.045, rate: 1.4 });
    tone(t + 0.03, { type: 'sine', f0: 68, f1: 40, peak: 0.22, dur: 0.12 });
    tone(t + 0.03, { type: 'square', f0: 1750, f1: 900, peak: 0.04, dur: 0.05 });
  },
  skinned() { // 剥皮惨叫（恐怖噪音 + 下滑音）
    const t = now();
    const o1 = tone(t, { type: 'sawtooth', f0: 640, f1: 58, peak: 0.20, dur: 1.15, a: 0.02, lpf: 3200 });
    vib(o1.frequency, t, 8.5, 42);
    tone(t + 0.02, { type: 'sawtooth', f0: 653, f1: 62, peak: 0.10, dur: 1.1, a: 0.02, lpf: 2600 });
    const n = N(), f = F('bandpass', 2400, 2.5), g = G(0);   // 恐怖噪音带下滑
    f.frequency.exponentialRampToValueAtTime(240, t + 1.2);
    n.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.22, 1.3, 0.02);
    n.start(t); n.stop(t + 1.5);
    tone(t, { type: 'sine', f0: 45, f1: 30, peak: 0.16, dur: 1.0 });   // 次声垫底
    for (const dt of [0.12, 0.38, 0.62])                              // 撕裂湿响
      burst(t + dt, { freq: 700 + Math.random() * 300, peak: 0.13, dur: 0.06, rate: 0.7 });
  },
  win() {    // 胜利（上行琶音 + 结尾和弦）
    const t = now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(t + i * 0.13, { type: 'square', f0: f, peak: 0.09, dur: 0.16, lpf: 4200 }));
    for (const f of [523.25, 659.25, 783.99])
      tone(t + 0.55, { type: 'triangle', f0: f, peak: 0.08, dur: 0.6 });
  },
  click() {  // UI 点击
    const t = now();
    tone(t, { type: 'square', f0: 1250, f1: 900, peak: 0.07, dur: 0.03, lpf: 6000 });
  },
  flashlight() { // 手电开关（咔哒）
    const t = now();
    burst(t, { type: 'highpass', freq: 3200, peak: 0.10, dur: 0.018 });
    tone(t + 0.035, { type: 'square', f0: 1800, f1: 1400, peak: 0.05, dur: 0.025, lpf: 7000 });
  },
};

/* ================= 环境音 ================= */
function dogBark(dest, t) {                    // 远处狗叫（低通闷化）
  const n = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++)
    tone(t + i * 0.16 + Math.random() * 0.03,
      { type: 'square', f0: 230 + Math.random() * 60, f1: 150, peak: 0.030, dur: 0.07, a: 0.004, lpf: 600, dest });
}
function catMeow(dest, t) {                    // 远处猫叫（滑音喵）
  const o = O('sine', 470), g = G(0), f = F('lowpass', 950);
  o.frequency.setValueAtTime(470, t);
  o.frequency.linearRampToValueAtTime(760, t + 0.18);
  o.frequency.linearRampToValueAtTime(360, t + 0.5);
  vib(o.frequency, t, 7, 18);
  o.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.022, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.start(t); o.stop(t + 0.7);
}
function startAmbient() {
  if (!init() || ambient) return;              // 幂等
  const t = now();
  const ag = G(0); ag.connect(master);
  ag.gain.setValueAtTime(0.0001, t);
  ag.gain.setTargetAtTime(1.0, t, 1.8);        // 缓入
  const nodes = [], timers = [];
  // 低频嗡鸣（变压器/城市底噪）
  const h1 = O('sine', 50), h2 = O('sine', 100.6), hg = G(0.035);
  h1.connect(hg); h2.connect(hg); hg.connect(ag);
  const hl = O('sine', 0.07), hlg = G(0.012);
  hl.connect(hlg); hlg.connect(hg.gain);
  h1.start(); h2.start(); hl.start();
  // 滤波风声（循环噪声 + 双 LFO 扫频/扫幅）
  const w = N(); w.loop = true;
  const bp = F('bandpass', 330, 0.7), wg = G(0.055);
  w.connect(bp); bp.connect(wg); wg.connect(ag);
  const l1 = O('sine', 0.11), lg1 = G(150); l1.connect(lg1); lg1.connect(bp.frequency);
  const l2 = O('sine', 0.067), lg2 = G(0.028); l2.connect(lg2); lg2.connect(wg.gain);
  w.start(t); l1.start(); l2.start();
  nodes.push(h1, h2, hl, w, l1, l2);
  // 偶发远处狗叫/猫叫
  const animal = () => {
    if (!ambient) return;
    const r = Math.random();
    if (r < 0.42) dogBark(ag, now() + 0.05);
    else if (r < 0.72) catMeow(ag, now() + 0.05);
    timers.push(setTimeout(animal, 6000 + Math.random() * 9000));
  };
  timers.push(setTimeout(animal, 4000 + Math.random() * 3000));
  ambient = { nodes, timers, gain: ag };
}

/* ================= 追击张力层 ================= */
function kick(t, peak) {                       // 心跳鼓点
  const o = O('sine', 58), g = G(0);
  o.frequency.setValueAtTime(58, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.10);
  o.connect(g); g.connect(master);
  env(g, t, peak, 0.16, 0.006);
  o.start(t); o.stop(t + 0.2);
}
function setTension(x) {
  if (!init()) return;
  x = Math.max(0, Math.min(1, +x || 0));
  tensionLevel = x;
  if (!tension) {
    const tg = G(0); tg.connect(master);
    // 高频不谐和弦音（小二度锯弦 + 双颤音）
    const sf = F('lowpass', 3400);
    const s1 = O('sawtooth', 1174.66), sg1 = G(0.016);
    const s2 = O('sawtooth', 1244.51), sg2 = G(0.014);
    s1.connect(sg1); s2.connect(sg2); sg1.connect(sf); sg2.connect(sf); sf.connect(tg);
    const v1 = O('sine', 5.5), vg1 = G(9); v1.connect(vg1); vg1.connect(s1.frequency);
    const v2 = O('sine', 4.7), vg2 = G(11); v2.connect(vg2); vg2.connect(s2.frequency);
    s1.start(); s2.start(); v1.start(); v2.start();
    const beat = () => {                       // 急促心跳：怦-怦 双跳 ~110bpm
      if (!tension) return;
      if (tensionLevel > 0.01) {
        const t = now() + 0.06;
        kick(t, 0.20 * tensionLevel);
        kick(t + 0.17, 0.13 * tensionLevel);
      }
      tension.timer = setTimeout(beat, 545);
    };
    tension = { nodes: [s1, s2, v1, v2], timer: setTimeout(beat, 80), gain: tg };
  }
  tension.gain.gain.setTargetAtTime(x, now(), 0.7);   // 平滑过渡（指数趋近）
}

/* ================= 停止 ================= */
function stopAll() {
  if (ambient) {
    for (const n of ambient.nodes) { try { n.stop(); } catch (e) { /* 已停止 */ } }
    for (const tm of ambient.timers) clearTimeout(tm);
    try { ambient.gain.disconnect(); } catch (e) { /* 已断开 */ }
    ambient = null;
  }
  if (tension) {
    for (const n of tension.nodes) { try { n.stop(); } catch (e) { /* 已停止 */ } }
    clearTimeout(tension.timer);
    try { tension.gain.disconnect(); } catch (e) { /* 已断开 */ }
    tension = null;
  }
  tensionLevel = 0;
}

function sfx(name) {
  if (!init()) return;                         // 发声前确保 ctx 已创建并 resume
  const fn = SFX[name];
  if (fn) fn();
}

export const Audio = { init, sfx, startAmbient, setTension, stopAll };
