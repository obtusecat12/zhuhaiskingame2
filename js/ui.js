// js/ui.js — 开发者D：全部 UI / 菜单 / 死亡与胜利画面（严格遵循 DESIGN.md §7）
// 只允许 import 以下四个模块。
import { resetRun, loadSave, hasSave } from './state.js';
import { SPR } from './sprites.js';
import { Audio } from './audio.js';
import { ITEMS, inventory } from './items.js';

// ---- 调色板（§1）----
const C_TXT = '#d8d0b8';    // UI 文字
const C_ACCENT = '#e8a44a'; // UI 强调（钠灯橙）
const C_DIM = '#9a927c';    // 未选中/次要文字
const C_DARK = '#0a0c14';   // 夜空暗部
const C_PANEL = '#12141f';  // 面板底
const C_BLOOD = '#8a1a1a';  // 血

// ---- 模块内部状态（菜单光标）----
let menuSel = 0;
let pauseSel = 0;

// ================= 小工具 =================
function clickSfx() { try { Audio.sfx('click'); } catch (e) { /* 音频未初始化时忽略 */ } }

// 读取并消费 G.pressed 中的按键（§2：pressed 本帧刚按下，消费后清除）
function pressed(G, ...codes) {
  const p = G.pressed || {};
  for (const c of codes) {
    if (p[c]) { p[c] = false; return true; }
  }
  return false;
}

// 像素字（全部 ctx.fillText，随低分辨率画布整体放大）
function text(G, s, x, y, o = {}) {
  const ctx = G.ctx;
  if (!ctx) return;
  ctx.font = o.font || '8px monospace';
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'top';
  if (o.outline) { // 黑色描边阴影（四方向偏移）
    ctx.fillStyle = o.outline;
    ctx.fillText(s, x - 1, y); ctx.fillText(s, x + 1, y);
    ctx.fillText(s, x, y - 1); ctx.fillText(s, x, y + 1);
  }
  ctx.fillStyle = o.color || C_TXT;
  ctx.fillText(s, x, y);
}

// 2px 双线像素边框（外框 1px + 间隔 1px + 内框 1px）
function frame2(ctx, x, y, w, h, cOuter, cInner) {
  ctx.strokeStyle = cOuter; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = cInner || cOuter;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
}

function mixColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const r = (a[0] + (b[0] - a[0]) * t) | 0;
  const g = (a[1] + (b[1] - a[1]) * t) | 0;
  const bl = (a[2] + (b[2] - a[2]) * t) | 0;
  return `rgb(${r},${g},${bl})`;
}

// 菜单选项（继续游戏仅在有存档时出现，§7）
function menuOptions() {
  let save = false;
  try { save = !!hasSave(); } catch (e) { save = false; }
  const opts = ['新的开始'];
  if (save) opts.push('继续游戏');
  opts.push('操作说明');
  return opts;
}

// 小刀指示图标（刀刃 + 刀柄，像素块绘制）
function drawKnife(ctx, x, y) {
  ctx.fillStyle = '#d8dce2'; ctx.fillRect(x, y, 7, 2);      // 刀刃
  ctx.fillStyle = '#f4f6f8'; ctx.fillRect(x, y, 7, 1);      // 刀刃高光
  ctx.fillStyle = '#d8dce2'; ctx.fillRect(x - 1, y, 1, 1);  // 刀尖
  ctx.fillStyle = C_BLOOD;   ctx.fillRect(x + 1, y + 1, 1, 1); // 血点
  ctx.fillStyle = '#5a4232'; ctx.fillRect(x + 7, y, 4, 2);  // 木柄
  ctx.fillStyle = '#33312c'; ctx.fillRect(x + 6, y, 1, 2);  // 护手
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = (s / 60) | 0, ss = s % 60;
  return `${m}分${String(ss).padStart(2, '0')}秒`;
}

// ================= HUD 部件 =================
// 左上体力条：黄→红渐变，低体力闪烁，2px 双线像素边框
function drawStamina(G) {
  const ctx = G.ctx;
  const p = G.player || {};
  const st = Math.max(0, Math.min(100, (typeof p.stamina === 'number') ? p.stamina : 100));
  const x = 5, y = 5, w = 66, h = 10;
  ctx.fillStyle = C_DARK;
  ctx.fillRect(x, y, w, h);
  const t = st / 100;
  const low = st < 25;
  const blinkOff = low && (((G.frame | 0) % 16) >= 8); // 低体力闪烁
  if (!blinkOff && st > 0) {
    // 黄(#e8c84a)→红(#c82a20) 随体力降低渐变；横向再加亮→暗渐变层次
    const c1 = mixColor([200, 42, 32], [232, 200, 74], t);
    const c2 = mixColor([150, 20, 20], [200, 150, 40], t);
    let grad;
    try {
      grad = ctx.createLinearGradient(x + 3, 0, x + w - 3, 0);
      grad.addColorStop(0, c2);
      grad.addColorStop(1, c1);
    } catch (e) { grad = c1; }
    ctx.fillStyle = grad;
    ctx.fillRect(x + 3, y + 3, Math.round((w - 6) * t), h - 6);
  }
  frame2(ctx, x, y, w, h, '#000000', low ? '#c82a20' : '#6a6455');
}

// 左上小字目标提示
function drawObjective(G) {
  const got = G.keysCollected || 0;
  const need = (typeof G.keysNeeded === 'number') ? G.keysNeeded : 3;
  text(G, `找到3把钥匙，逃出小区 ${got}/${need}`, 5, 17,
    { font: '8px monospace', color: C_TXT, outline: '#000000' });
}

// 手电状态小图标（§7：HUD 含手电图标）
function drawFlashlight(G) {
  const ctx = G.ctx;
  const on = !!G.flashlightOn;
  const x = 5, y = 27;
  ctx.fillStyle = '#3a3d42'; ctx.fillRect(x, y + 2, 5, 3);   // 筒身
  ctx.fillStyle = '#6a6d72'; ctx.fillRect(x + 5, y + 1, 2, 5); // 灯头
  if (on) { // 光束
    ctx.fillStyle = C_ACCENT;
    ctx.fillRect(x + 7, y + 2, 2, 1);
    ctx.fillRect(x + 7, y + 3, 3, 1);
    ctx.fillRect(x + 7, y + 4, 2, 1);
  }
  text(G, on ? '手电 开' : '手电 关', x + 12, y,
    { font: '8px monospace', color: on ? C_ACCENT : '#6a6455', outline: '#000000' });
}

// 警觉眼睛染色缓存（12×12，SPR.ui_eye 贴图 source-in 染色）
const eyeCache = {};
function tintedEye(key, color) {
  const src = SPR.ui_eye;
  if (!src) return null;
  if (typeof document === 'undefined') return src; // 无 DOM 环境（冒烟测试）直接画原图
  let c = eyeCache[key];
  if (!c) {
    c = document.createElement('canvas');
    c.width = 12; c.height = 12;
    eyeCache[key] = c;
  }
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, 12, 12);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, 12, 12);
  x.globalCompositeOperation = 'source-over';
  return c;
}

// 右上警觉眼睛：SPR.ui_eye 贴图，随 detection 从灰变红并自下而上填充，>=1 脉冲闪烁
function drawEye(G) {
  const ctx = G.ctx;
  const W = G.W || 426;
  const d = Math.max(0, Math.min(1, G.detection || 0));
  const x = W - 21, y = 3;
  ctx.fillStyle = '#0d0f18';
  ctx.fillRect(x, y, 16, 16);
  const ix = x + 2, iy = y + 2;
  const pulse = d >= 1 ? (0.5 + 0.5 * Math.sin((G.time || 0) * 14)) : 0;
  // 量化到 16 级：染色结果按颜色缓存，detection 变化时眼睛真的由灰变红
  const dq = Math.round(d * 16) / 16;
  const baseCol = mixColor([122, 122, 114], [190, 60, 50], dq); // 灰→红
  const base = tintedEye('base|' + baseCol, baseCol);
  if (base) {
    ctx.globalAlpha = d >= 1 ? (0.55 + 0.45 * pulse) : 1; // detection>=1 脉冲闪烁
    ctx.drawImage(base, ix, iy);
    const h = Math.round(12 * d); // 红色填充液位（自下而上）
    if (h > 0) {
      const red = tintedEye('fill', '#e03028');
      ctx.drawImage(red, 0, 12 - h, 12, h, ix, iy + 12 - h, 12, h);
    }
    ctx.globalAlpha = 1;
  } else {
    // 贴图缺失时的兜底：代码画一只像素眼睛
    ctx.fillStyle = baseCol;
    ctx.fillRect(ix + 2, iy + 4, 8, 4);
    ctx.fillStyle = C_DARK;
    ctx.fillRect(ix + 5, iy + 4, 2, 4);
  }
  frame2(ctx, x, y, 16, 16, '#000000', d >= 1 ? '#e03028' : '#6a6455');
}

// 底部 4 格背包：图标 + 数量角标 + 选中高亮
function drawInventory(G) {
  const ctx = G.ctx;
  const W = G.W || 426, H = G.H || 240;
  let inv = [];
  try { inv = inventory() || []; } catch (e) { inv = []; }
  const n = 4, size = 18, gap = 3;
  const total = n * size + (n - 1) * gap;
  const x0 = ((W - total) / 2) | 0;
  const y = H - size - 4;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (size + gap);
    const sel = ((G.selectedSlot | 0) === i);
    ctx.fillStyle = sel ? 'rgba(42,45,51,0.92)' : 'rgba(18,20,31,0.85)';
    ctx.fillRect(x, y, size, size);
    frame2(ctx, x, y, size, size, '#000000', sel ? C_ACCENT : '#5a5448'); // 选中高亮
    const it = inv[i];
    if (it && ITEMS && ITEMS[it.id]) {
      const icon = SPR[ITEMS[it.id].icon];
      if (icon) ctx.drawImage(icon, x + 3, y + 3); // 12×12 图标
      else { ctx.fillStyle = C_ACCENT; ctx.fillRect(x + 5, y + 5, 8, 8); }
      if (it.n > 1) { // 数量角标
        text(G, String(it.n), x + size - 2, y + size - 8,
          { font: '8px monospace', color: '#f4f0e0', align: 'right', outline: '#000000' });
      }
      if (sel) { // 选中道具名提示
        text(G, ITEMS[it.id].name || '', W / 2, y - 10,
          { font: '8px monospace', color: C_ACCENT, align: 'center', outline: '#000000' });
      }
    }
  }
}

// 底部消息行：G.msg.text 居中，黑色描边阴影
function drawMsg(G) {
  const m = G.msg;
  if (!m || !m.text) return;
  if (m.timer !== undefined && !(m.timer > 0)) return;
  text(G, m.text, (G.W || 426) / 2, (G.H || 240) - 34,
    { font: '10px monospace', color: C_TXT, align: 'center', outline: '#000000' });
}

// ================= 导出：每帧 HUD =================
export function drawUI(G) {
  if (!G || !G.ctx) return;
  drawStamina(G);
  drawObjective(G);
  drawFlashlight(G);
  drawEye(G);
  drawInventory(G);
  drawMsg(G);
}

// ================= 标题菜单 =================
// 远程图（图床，反馈4/反馈5）：new Image() 异步加载，8s 超时/onerror 安静兜底。
function loadRemoteImage(url, onDone) {
  try {
    if (typeof Image === 'undefined') { onDone(null); return; }
    const img = new Image();
    let settled = false;
    img.onload = () => {
      if (settled) return;
      settled = true;
      onDone((img.width > 0 && img.height > 0) ? img : null);
    };
    img.onerror = () => { if (!settled) { settled = true; onDone(null); } };
    // 超时安静兜底（8s 未加载完成则放弃）
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        if (!settled) {
          settled = true; onDone(null);
          try { img.onload = null; img.onerror = null; img.src = ''; } catch (_) { /* 静默 */ }
        }
      }, 8000);
    }
    img.src = url;
  } catch (_) { onDone(null); }
}

// cover 式裁剪：不变形填满 426×240（按比例放大，超出部分居中裁掉）
function drawCover(ctx, img, W, H) {
  const iw = img.width || 0, ih = img.height || 0;
  if (!iw || !ih) return false;
  const s = Math.max(W / iw, H / ih);
  const dw = Math.ceil(iw * s), dh = Math.ceil(ih * s);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, ((W - dw) / 2) | 0, ((H - dh) / 2) | 0, dw, dh);
  return true;
}

// 菜单背景图（图床，反馈4）：加载完成前/失败 → 黑色噪点兜底背景
const MENU_BG_URL = 'https://i.imgur.com/yITsZZr.png';
let menuBgImg = null;      // 加载完成的 Image
let menuBgFailed = false;  // 失败/超时 → 一直用兜底背景
loadRemoteImage(MENU_BG_URL, (img) => { menuBgImg = img; menuBgFailed = !img; });

// 跳杀图（剥皮人血手扑向镜头）与死亡画面图（血边框+「你被剥皮了！」血字）
const JUMPSCARE_URL = 'https://i.imgur.com/pSVRhHo.png';
const DEATH_URL = 'https://i.imgur.com/p1mzXMp.png';
let jumpscareImg = null, jumpscareFailed = false;   // 失败 → 全屏白闪+黑闪兜底
let deathImg = null, deathFailed = false;           // 失败 → 黑底血字纯文字兜底
loadRemoteImage(JUMPSCARE_URL, (img) => { jumpscareImg = img; jumpscareFailed = !img; });
loadRemoteImage(DEATH_URL, (img) => { deathImg = img; deathFailed = !img; });

// 菜单锥形灯光（反馈4/反馈5）：光源在画布外右上方 (W+50,-40)，
// 光锥从右上略往左下斜射入画面——更长更宽的光束 + 更大的地面光池；
// 保持多层柔和渐变 + 尘埃噪点 + 呼吸式明暗 + 偶发接触不良暗闪的细腻风格。
// 落点偏右下，避开画面中央的菜单文字。
function drawMenuLight(G) {
  const ctx = G.ctx;
  const W = G.W || 426, H = G.H || 240;
  const t = G.time || 0, fr = G.frame | 0;
  // 屏外光源（右上）→ 画面右下落点；光锥沿斜轴展开
  const sx = W + 50, sy = -40;
  const bx = 305, by = H + 6;
  const groundY = H - 10;                       // 地面光池高度
  const vx = bx - sx, vy = by - sy;
  const vlen = Math.hypot(vx, vy) || 1;
  const nx = -vy / vlen, ny = vx / vlen;        // 斜轴法线（光锥宽度方向）
  // 呼吸式明暗：慢呼吸 + 两层高频细颤
  let a = 0.74 + 0.14 * Math.sin(t * 1.6) + 0.05 * Math.sin(t * 6.1) + 0.03 * Math.sin(t * 12.7);
  // 接触不良式随机暗闪（低频、浅深不一）
  const cyc = fr % 181;
  if (cyc < 3) a *= 0.5;
  else if (cyc === 7) a *= 0.72;
  if ((fr % 97) === 40) a *= 0.82;
  a = Math.max(0.2, Math.min(1, a));
  // 灯头辉光（光源在屏外，只在右上角露出一片暖光晕）
  try {
    const hg = ctx.createRadialGradient(W + 6, -6, 1, W + 6, -6, 34);
    hg.addColorStop(0, `rgba(248,212,138,${(0.55 * a).toFixed(3)})`);
    hg.addColorStop(0.4, `rgba(232,164,74,${(0.22 * a).toFixed(3)})`);
    hg.addColorStop(1, 'rgba(232,164,74,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(W + 6, -6, 34, 0, Math.PI * 2); ctx.fill();
  } catch (_) { /* 渐变不可用时忽略 */ }
  // 多层柔和锥形光（外→内逐层提亮，沿斜轴渐隐；更大 spread → 更宽光束）
  const layers = [
    { spr: 132, al: 0.045 },
    { spr: 98, al: 0.065 },
    { spr: 66, al: 0.09 },
    { spr: 38, al: 0.12 },
  ];
  for (const L of layers) {
    let g;
    try {
      g = ctx.createLinearGradient(sx, sy, bx, by);
      g.addColorStop(0, `rgba(232,164,74,${(L.al * 1.7 * a).toFixed(3)})`);
      g.addColorStop(0.65, `rgba(232,164,74,${(L.al * 0.8 * a).toFixed(3)})`);
      g.addColorStop(1, 'rgba(232,164,74,0)');
    } catch (_) { g = `rgba(232,164,74,${(L.al * a).toFixed(3)})`; }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx + nx * 7, sy + ny * 7);
    ctx.lineTo(sx - nx * 7, sy - ny * 7);
    ctx.lineTo(bx - nx * L.spr, by - ny * L.spr);
    ctx.lineTo(bx + nx * L.spr, by + ny * L.spr);
    ctx.closePath();
    ctx.fill();
  }
  // 光锥内细微噪点（尘埃颗粒感，沿斜轴分布）
  for (let i = 0; i < 34; i++) {
    const tt = Math.random();
    const cx = sx + vx * tt, cy = sy + vy * tt;
    const half = 7 + (132 - 7) * tt;
    const off = (Math.random() * 2 - 1) * half;
    const x = cx + nx * off, y = cy + ny * off;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    ctx.fillStyle = `rgba(232,196,122,${((0.04 + Math.random() * 0.09) * a).toFixed(3)})`;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  // 更大的地面光池（多层柔和椭圆，随呼吸明暗）
  const pools = [[108, 14, 0.05], [76, 10, 0.07], [46, 7, 0.10]];
  for (const [rx, ry, al] of pools) {
    ctx.fillStyle = `rgba(232,164,74,${(al * a).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(bx, groundY, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawMenu(G) {
  const ctx = G.ctx;
  if (!ctx) return;
  const W = G.W || 426, H = G.H || 240;
  // 背景：图床图片（426×240 拉伸，保持像素化）；加载完成前/失败 → 黑色噪点兜底
  if (menuBgImg) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(menuBgImg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';   // 轻微暗化，保证菜单文字可读
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(216,208,184,${0.02 + Math.random() * 0.06})`;
      ctx.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1);
    }
  }
  drawMenuLight(G);
  // （canvas 绘制的「珠海剥皮人」大标题已按反馈4移除——背景图自带标题）
  // 副标题
  text(G, '1994 · 珠海', W / 2, 84, { font: '10px monospace', color: C_DIM, align: 'center', outline: '#000000' });
  // 选项列表（小刀图标指示当前选择）
  const opts = menuOptions();
  if (menuSel >= opts.length) menuSel = opts.length - 1;
  for (let i = 0; i < opts.length; i++) {
    const oy = 128 + i * 16;
    const sel = (i === menuSel);
    text(G, opts[i], W / 2, oy,
      { font: '10px monospace', color: sel ? C_ACCENT : '#9a927c', align: 'center', outline: '#000000' });
    if (sel) drawKnife(ctx, W / 2 - 36, oy + 4);
  }
  // 底部提示
  text(G, '↑↓选择  回车确认', W / 2, H - 14,
    { font: '8px monospace', color: '#6a6455', align: 'center', outline: '#000000' });
}

// ================= 操作说明 =================
export function drawHelp(G) {
  const ctx = G.ctx;
  if (!ctx) return;
  const W = G.W || 426, H = G.H || 240;
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(216,208,184,${0.02 + Math.random() * 0.04})`;
    ctx.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1);
  }
  text(G, '操作说明', W / 2, 18, { font: '10px monospace', color: C_ACCENT, align: 'center', outline: '#000000' });
  const keys = [
    ['移动', 'WASD / 方向键'],
    ['奔跑', 'Shift（消耗体力）'],
    ['手电', 'F（灯光会引来剥皮人）'],
    ['互动', 'E（搜刮 / 躲藏 / 开门 / 存档）'],
    ['使用道具', 'Q（木板放置 / 鞭炮投掷 / 食物食用）'],
    ['选择背包', '1 - 4'],
    ['暂停', 'Esc'],
  ];
  for (let i = 0; i < keys.length; i++) {
    const y = 40 + i * 12;
    text(G, keys[i][0], 96, y, { font: '8px monospace', color: C_TXT, align: 'right', outline: '#000000' });
    text(G, keys[i][1], 104, y, { font: '8px monospace', color: C_DIM, outline: '#000000' });
  }
  text(G, '玩法提示', W / 2, 132, { font: '10px monospace', color: C_ACCENT, align: 'center', outline: '#000000' });
  const tips = [
    '· 开着手电更容易被发现，黑暗中请谨慎使用',
    '· 木柜与灌木丛可以躲藏，避开剥皮人的视线',
    '· 电话亭可以存档，死亡后从存档继续',
    '· 井盖会随机传送，并发出巨大的声响',
    '· 找齐 3 把大门钥匙，去东侧大门逃出小区',
  ];
  for (let i = 0; i < tips.length; i++) {
    text(G, tips[i], 60, 146 + i * 11, { font: '8px monospace', color: C_TXT, outline: '#000000' });
  }
  text(G, 'Esc / 回车 返回', W / 2, H - 12,
    { font: '8px monospace', color: '#6a6455', align: 'center', outline: '#000000' });
}

// ================= 暂停 =================
export function drawPause(G) {
  const ctx = G.ctx;
  if (!ctx) return;
  const W = G.W || 426, H = G.H || 240;
  ctx.fillStyle = 'rgba(4,5,10,0.62)'; // 半透明黑遮罩
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, 74);
  ctx.scale(2.6, 2.6);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000'; ctx.fillText('暂停', 0.7, 0.8);
  ctx.fillStyle = C_TXT; ctx.fillText('暂停', 0, 0);
  ctx.restore();
  const opts = ['继续', '回到标题'];
  if (pauseSel >= opts.length) pauseSel = 0;
  for (let i = 0; i < opts.length; i++) {
    const oy = 118 + i * 15;
    const sel = (i === pauseSel);
    text(G, opts[i], W / 2, oy,
      { font: '10px monospace', color: sel ? C_ACCENT : '#9a927c', align: 'center', outline: '#000000' });
    if (sel) drawKnife(ctx, W / 2 - 32, oy + 4);
  }
  text(G, '↑↓选择  回车确认  Esc继续', W / 2, H - 14,
    { font: '8px monospace', color: '#6a6455', align: 'center', outline: '#000000' });
}

// ================= 跳杀画面（抓捕后第一段，约 1.8s） =================
// 全屏 cover 绘制血手扑镜图，黑白闪烁：正常/黑白高对比/反色帧每 3-5 帧快速交替。
const JS_FLICK = [0, 0, 1, 0, 2, 1, 0, 2];   // 0 正常 / 1 黑白高对比 / 2 反色
export function drawJumpscare(G) {
  const ctx = G.ctx;
  if (!ctx) return;
  const W = G.W || 426, H = G.H || 240;
  const fr = G.frame | 0;
  const mode = JS_FLICK[((fr / 4) | 0) % JS_FLICK.length];   // 每 4 帧切换
  // 轻微震屏
  const sx = (Math.random() * 5 - 2) | 0;
  const sy = (Math.random() * 5 - 2) | 0;
  ctx.save();
  ctx.translate(sx, sy);
  let drew = false;
  if (jumpscareImg) {
    let filter = 'none';
    if (mode === 1) filter = 'grayscale(1) contrast(1.9) brightness(1.15)';   // 黑白高对比
    else if (mode === 2) filter = 'invert(1) contrast(1.25)';                 // 反色
    try { ctx.filter = filter; } catch (_) { /* 不支持 filter 时保持正常帧 */ }
    drew = drawCover(ctx, jumpscareImg, W, H);
    try { ctx.filter = 'none'; } catch (_) { /* 静默 */ }
  }
  if (!drew) {
    // 兜底（图未加载/失败）：全屏白闪 + 黑闪快速交替
    ctx.fillStyle = (((fr / 4) | 0) % 2) ? '#050505' : '#f0ede4';
    ctx.fillRect(-4, -4, W + 8, H + 8);
  }
  ctx.restore();
}

// ================= 死亡画面（第二段） =================
export function drawDeath(G) {
  const ctx = G.ctx;
  if (!ctx) return;
  const W = G.W || 426, H = G.H || 240;
  let drew = false;
  if (deathImg) drew = drawCover(ctx, deathImg, W, H);   // 血边框+血字图，cover 填满
  if (!drew) {
    // 兜底（图未加载/失败）：黑底 + 血字「你被剥皮了！」纯文字
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2 - 16);
    ctx.scale(3, 3);
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3d0707'; ctx.fillText('你被剥皮了！', 0.8, 0.8);
    ctx.fillStyle = '#a82020'; ctx.fillText('你被剥皮了！', 0, 0);
    ctx.restore();
  }
  // 「按回车重新开始」下移到画面偏下（避开图中血字），保留闪烁效果
  if (((G.frame | 0) % 40) < 28) {
    text(G, '按回车重新开始', W / 2, 205,
      { font: '10px monospace', color: C_TXT, align: 'center', outline: '#000000' });
  }
}

// ================= 胜利画面 =================
function readStats(G) {
  const s = (G && G.stats) || {};
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  let t = num(s.time);
  if (t == null) t = num(s.elapsed);
  if (t == null) t = num(s.escapeTime);
  if (t == null) t = num(G && G.runTime);
  if (t == null) t = (typeof (G && G.time) === 'number') ? G.time : 0;
  return {
    time: t,
    searches: num(s.searches != null ? s.searches : s.searchCount),
    chases: num(s.chases != null ? s.chases : s.chaseCount),
  };
}

export function drawWin(G) {
  const ctx = G.ctx;
  if (!ctx) return;
  const W = G.W || 426, H = G.H || 240;
  // 深蓝夜色背景
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#060a18');
  g.addColorStop(1, '#0d1830');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 星星（固定种子）
  let seed = 4242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(216,208,184,${0.15 + rnd() * 0.5})`;
    ctx.fillRect((rnd() * W) | 0, (rnd() * H * 0.7) | 0, 1, 1);
  }
  // 月亮
  ctx.fillStyle = '#d8c47a';
  ctx.beginPath(); ctx.arc(W - 72, 42, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b1326';
  ctx.beginPath(); ctx.arc(W - 68, 40, 8, 0, Math.PI * 2); ctx.fill();
  // 标题
  ctx.save();
  ctx.translate(W / 2, 70);
  ctx.scale(2.6, 2.6);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000'; ctx.fillText('你逃出了珠海', 0.7, 0.8);
  ctx.fillStyle = C_ACCENT; ctx.fillText('你逃出了珠海', 0, 0);
  ctx.restore();
  text(G, '身后的街巷，再无声息', W / 2, 94,
    { font: '8px monospace', color: C_DIM, align: 'center', outline: '#000000' });
  // 统计：逃脱用时 / 搜刮次数 / 被追次数（G.stats 不存在时只显示用时）
  const st = readStats(G);
  const lines = [`逃脱用时  ${fmtTime(st.time)}`];
  if (st.searches != null) lines.push(`搜刮次数  ${st.searches}`);
  if (st.chases != null) lines.push(`被追次数  ${st.chases}`);
  for (let i = 0; i < lines.length; i++) {
    text(G, lines[i], W / 2, 118 + i * 13,
      { font: '10px monospace', color: C_TXT, align: 'center', outline: '#000000' });
  }
  if (((G.frame | 0) % 40) < 28) {
    text(G, '按回车回到标题', W / 2, H - 26,
      { font: '10px monospace', color: C_ACCENT, align: 'center', outline: '#000000' });
  }
}

// ================= 菜单/死亡/胜利输入 =================
export function handleMenuInput(G) {
  if (!G) return;
  switch (G.state) {
    case 'menu': {
      const opts = menuOptions();
      if (menuSel >= opts.length) menuSel = opts.length - 1;
      if (pressed(G, 'ArrowUp', 'KeyW')) menuSel = (menuSel + opts.length - 1) % opts.length;
      if (pressed(G, 'ArrowDown', 'KeyS')) menuSel = (menuSel + 1) % opts.length;
      if (pressed(G, 'Enter', 'NumpadEnter')) {
        const choice = opts[menuSel];
        if (choice === '新的开始') {
          resetRun(G);
          G.state = 'playing';
        } else if (choice === '继续游戏') {
          resetRun(G, loadSave());
          G.state = 'playing';
        } else { // 操作说明
          G.state = 'help';
        }
        clickSfx();
      }
      break;
    }
    case 'help':
      if (pressed(G, 'Escape', 'Enter', 'NumpadEnter')) {
        G.state = 'menu';
        clickSfx();
      }
      break;
    case 'paused': {
      const opts = ['继续', '回到标题'];
      if (pressed(G, 'ArrowUp', 'KeyW')) pauseSel = (pauseSel + opts.length - 1) % opts.length;
      if (pressed(G, 'ArrowDown', 'KeyS')) pauseSel = (pauseSel + 1) % opts.length;
      if (pressed(G, 'Escape')) { // Esc 直接继续
        G.state = 'playing';
        clickSfx();
        break;
      }
      if (pressed(G, 'Enter', 'NumpadEnter')) {
        G.state = (pauseSel === 0) ? 'playing' : 'menu';
        pauseSel = 0;
        clickSfx();
      }
      break;
    }
    case 'jumpscare':
      // 跳杀期间不吃输入，仅回车可跳过直接进入死亡画面
      if (pressed(G, 'Enter', 'NumpadEnter')) {
        G.jumpscareT = 0;
        G.state = 'dead';
        clickSfx();
      }
      break;
    case 'dead':
      if (pressed(G, 'Enter', 'NumpadEnter')) {
        resetRun(G);
        G.state = 'playing';
        clickSfx();
      }
      break;
    case 'win':
      if (pressed(G, 'Enter', 'NumpadEnter')) {
        G.state = 'menu';
        clickSfx();
      }
      break;
    default:
      break; // playing 等其它状态不在此处理
  }
}
