// js/engine.js — 开发者C：渲染引擎（输入 / 摄像机 / 场景渲染 / 光照 / 扫描线）
// 严格遵循 DESIGN.md §6.1。只允许 import state/sprites/audio/world/items。
import { SPR } from './sprites.js';
import { Audio } from './audio.js';
import { MAP } from './world.js';

// ---------- 输入（§3） ----------
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function initInput(canvas, G) {
  const target = (typeof window !== 'undefined' && window && window.addEventListener)
    ? window
    : (typeof globalThis !== 'undefined' && globalThis.addEventListener ? globalThis : null);
  if (!target) return;

  const startAudio = () => {
    if (G.audioStarted) return;
    G.audioStarted = true;
    try { Audio.init(); Audio.startAmbient(); } catch (_) { /* 音频未就绪时静默 */ }
  };

  target.addEventListener('keydown', (e) => {
    const code = e.code || e.key;
    if (PREVENT.has(code) && e.preventDefault) e.preventDefault(); // 阻止方向键/空格滚动页面
    if (e.repeat) return;
    G.keys[code] = true;
    G.pressed[code] = true; // 本帧刚按下，消费后由使用方/主循环清除
    startAudio();
  });
  target.addEventListener('keyup', (e) => {
    G.keys[e.code || e.key] = false;
  });
  target.addEventListener('blur', () => { // 切窗防卡键
    G.keys = {};
    G.pressed = {};
  });
  target.addEventListener('pointerdown', startAudio);
}

// ---------- 摄像机（§6.1：跟随玩家，夹紧地图边界） ----------
export function updateCamera(G) {
  const p = G.player;
  if (!p) return;
  const maxX = G.MAPW * G.TILE - G.W;
  const maxY = G.MAPH * G.TILE - G.H;
  G.camera.x = Math.max(0, Math.min(maxX, Math.round(p.x - G.W / 2)));
  G.camera.y = Math.max(0, Math.min(maxY, Math.round(p.y - G.H / 2)));
}

// ---------- 瓦片查询（兼容 world.tiles 多种结构，回退到 MAP） ----------
// 数值编码图例：索引必须与 world.js 的 TILE 枚举一致——
// VOID:0 WALL:1 WIN_LIT:2 WIN_DARK:3 SHUTTER:4 ROAD:5 SIDEWALK:6 GRASS:7
// BUSH:8 FLOOR:9 DOOR:10 DOOR_LOCKED:11 TRASH:12 BOX:13 CABINET:14
// MANHOLE:15 PHONE:16 GATE:17（world.tiles 为 Uint8Array，tileAt 返回数值）
const LEGEND = [' ', '#', 'w', 'u', 'S', '.', ',', 'g', 'B', 'f', 'D', 'L', 'T', 'X', 'C', 'M', 'P', 'G'];

function tileChar(G, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= G.MAPW || ty >= G.MAPH) return ' ';
  const w = G.world;
  if (w) {
    if (typeof w.tileAt === 'function') {
      const c = w.tileAt(tx, ty);
      if (c != null) return typeof c === 'number' ? (LEGEND[c] || ' ') : c;
    }
    const t = w.tiles;
    if (t) {
      const row = t[ty];
      if (typeof row === 'string') return row[tx] || ' ';
      if (row != null) {
        const c = Array.isArray(row) || ArrayBuffer.isView(row) ? row[tx] : t[ty * G.MAPW + tx];
        if (c != null) return typeof c === 'number' ? (LEGEND[c] || ' ') : c;
      }
    }
  }
  const mrow = MAP && MAP[ty];
  return (mrow && mrow[tx]) || ' ';
}

// 瓦片字符 → 贴图名（§4/§5 对应表；含 T/X/C/M/P 等物件格的地面衬底）
const TILE_SPR = {
  '#': 't_wall', 'w': 't_wallWin', 'u': 't_wallWinOff', 'S': 't_shutter',
  '.': 't_asphalt', ',': 't_sidewalk', 'g': 't_grass', 'B': 't_grass',
  'T': 't_sidewalk', 'X': 't_sidewalk', 'C': 't_floor', 'D': 't_door',
  'L': 't_doorLocked', 'M': 't_asphalt', 'P': 't_sidewalk', 'G': 't_gate',
  'f': 't_floor', 'E': 't_asphalt', '@': 't_sidewalk', ' ': null,
};
// 物件类型 → 贴图名（§5.2 world.objects）
const OBJ_SPR = {
  trash: 'o_trash', box: 'o_box', cabinet: 'o_cabinet', manhole: 'o_manhole',
  phone: 'o_phone', lamp: 'o_lamp', lampOff: 'o_lampOff', gate: 'o_gate_big',
  doorL: 't_doorLocked', door: 't_door', bush: 'o_bush', bike: 'o_bike',
  pole: 'o_pole', board: 'o_board', shop: 'o_shop', roadline: 't_roadline',
  shop2: 'o_shop2', awning: 'o_awning', fencegate: 'o_fencegate', billboard: 'o_billboard',
};

function spr(name) { return name ? SPR[name] : null; }

// ---------- 瓦片层 ----------
function drawTiles(G, ctx) {
  const T = G.TILE, cam = G.camera;
  const tx0 = Math.max(0, (cam.x / T) | 0);
  const ty0 = Math.max(0, (cam.y / T) | 0);
  const tx1 = Math.min(G.MAPW - 1, ((cam.x + G.W) / T + 1) | 0);
  const ty1 = Math.min(G.MAPH - 1, ((cam.y + G.H) / T + 1) | 0);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const ch = tileChar(G, tx, ty);
      if (ch === ' ') continue; // 虚空，保留底色
      let name = TILE_SPR[ch];
      if (ch === '.' && ((tx * 7 + ty * 13) % 4 === 0)) name = 't_asphalt2'; // 沥青噪点变化
      if (ch === '#') { // 外墙小广告变体（反馈6）：world.wallVar 确定性分配
        const v = (G.world && typeof G.world.wallVariantAt === 'function')
          ? G.world.wallVariantAt(tx, ty) | 0 : 0;
        if (v >= 1 && v <= 3) name = 't_wallAd' + v;
      }
      if (ch === 'D') { // 门按开闭状态+颜色变体选贴图（反馈2/5）
        const d = G.world && typeof G.world.doorAt === 'function' ? G.world.doorAt(tx, ty) : null;
        const v = d && d.variant != null ? ((d.variant | 0) % 3 + 3) % 3 : 0;
        name = (d && !d.open) ? ('t_doorClosed_' + v) : ('t_door_' + v);
      }
      const s = spr(name);
      if (s) ctx.drawImage(s, tx * T, ty * T);
      else { ctx.fillStyle = '#1d2026'; ctx.fillRect(tx * T, ty * T, T, T); }
      if (ch === 'B') { // 灌木：草地衬底 + 灌木贴图
        const b = spr('o_bush');
        if (b) ctx.drawImage(b, tx * T, ty * T);
      }
    }
  }
}

// ---------- 物件层（含路灯回退、大门招牌回退） ----------
function drawObjects(G, ctx) {
  const w = G.world;
  if (!w) return;
  let hasLampObj = false, hasGateObj = false;
  const objs = w.objects || [];
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o || o.removed) continue;
    if (o.type === 'door') continue; // 门由瓦片层按开闭状态绘制（t_door/t_doorClosed）
    if (o.type === 'lamp') hasLampObj = true;
    if (o.type === 'gate') hasGateObj = true;
    let name = o.spr || OBJ_SPR[o.type];
    if (o.type === 'lamp' && o.on === false) name = 'o_lampOff';
    const s = spr(name);
    if (!s) continue;
    // 统一锚点：o.x/o.y 为所在格像素中心，贴图底部对齐格底（y+8）
    ctx.drawImage(s, Math.round(o.x - s.width / 2), Math.round(o.y + 8 - s.height));
  }
  // 回退：若 objects 未含路灯/大门，用 world.lamps / world.gate 绘制
  if (!hasLampObj && Array.isArray(w.lamps)) {
    const s = spr('o_lamp');
    if (s) for (const l of w.lamps) ctx.drawImage(s, Math.round(l.x - 8), Math.round(l.y + 8 - s.height));
  }
  if (!hasGateObj && w.gate) {
    const s = spr('o_gate_big');
    if (s) ctx.drawImage(s, Math.round(w.gate.x - s.width / 2), Math.round(w.gate.y + 8 - s.height));
  }
}

// ---------- 木板障碍层 ----------
function drawBarricades(G, ctx) {
  const w = G.world;
  const arr = (w && w.barricades) || [];
  const s = spr('o_plank');
  for (const b of arr) {
    if (!b) continue;
    const x = Math.round(b.x - 8), y = Math.round(b.y - 8);
    if (s) ctx.drawImage(s, x, y);
    else { ctx.fillStyle = '#5a4232'; ctx.fillRect(x, y, 16, 16); }
    const hp = b.hp == null ? 3 : b.hp;
    if (hp < 3) { // 损伤裂纹
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 13, y + 12);
      if (hp < 2) { ctx.moveTo(x + 12, y + 2); ctx.lineTo(x + 4, y + 13); }
      ctx.stroke();
    }
  }
}

// ---------- 投掷中的鞭炮 ----------
// world/items 侧字段名契约未定，做宽容探测：G.throwns / world.throwns / world.crackers
function drawThrowns(G, ctx) {
  const w = G.world || {};
  const list = G.throwns || w.throwns || w.crackers || [];
  const s = spr('i_cracker');
  for (const c of list) {
    if (!c) continue;
    const x = Math.round(c.x), y = Math.round(c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - 3, y + 4, 6, 2);
    if (s) ctx.drawImage(s, x - 6, y - 6);
    else { ctx.fillStyle = '#8a1a1a'; ctx.fillRect(x - 2, y - 2, 4, 4); }
  }
}

// ---------- 人物 ----------
function drawActorShadow(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(G, ctx) {
  const p = G.player;
  if (!p || p.hidden) return; // 躲藏时不绘制（柜/灌木遮挡）
  const s = spr('p_' + p.dir + (p.frame | 0)) || spr('p_down0');
  drawActorShadow(ctx, Math.round(p.x), Math.round(p.y));
  if (s) ctx.drawImage(s, Math.round(p.x - 8), Math.round(p.y - 17)); // 16×24，脚底对齐碰撞盒底
}

function drawEnemy(G, ctx) {
  const e = G.enemy;
  if (!e) return;
  const s = spr('e_' + e.dir + (e.frame | 0)) || spr('e_down0');
  drawActorShadow(ctx, Math.round(e.x), Math.round(e.y));
  if (s) ctx.drawImage(s, Math.round(e.x - 8), Math.round(e.y - 17));
}

// ---------- 光照（§6.1 核心氛围） ----------
let lightCanvas = null, lctx = null;
const lampPhase = new WeakMap(); // 每盏灯固定随机相位
const lightCache = new WeakMap(); // world → 光源列表缓存

function ensureLightCanvas(G) {
  if (!lightCanvas && typeof document !== 'undefined') {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = G.W;
    lightCanvas.height = G.H;
    lctx = lightCanvas.getContext('2d');
  }
  return lctx;
}

function phaseFor(lamp) {
  let ph = lampPhase.get(lamp);
  if (ph == null) { ph = Math.random() * Math.PI * 2; lampPhase.set(lamp, ph); }
  return ph;
}

// 光源列表：优先 world.lamps / world.windows；缺失时从 objects / 瓦片回退推导
function lightSources(G) {
  const w = G.world;
  if (!w) return { lamps: [], windows: [] };
  let c = lightCache.get(w);
  if (!c) {
    let lamps = Array.isArray(w.lamps) && w.lamps.length ? w.lamps : null;
    if (!lamps) {
      lamps = (w.objects || [])
        .filter((o) => o && o.type === 'lamp' && o.on !== false)
        .map((o) => ({ x: o.x, y: o.y }));
    }
    let windows = Array.isArray(w.windows) && w.windows.length ? w.windows : null;
    if (!windows) {
      windows = [];
      for (let ty = 0; ty < G.MAPH; ty++) {
        for (let tx = 0; tx < G.MAPW; tx++) {
          if (tileChar(G, tx, ty) === 'w') windows.push({ x: tx * G.TILE + 8, y: ty * G.TILE + 8 });
        }
      }
    }
    c = { lamps, windows };
    lightCache.set(w, c);
  }
  return c;
}

// 分层同心渐变挖光（3 层硬边同心圆模拟抖动过渡，复古感，不用平滑大渐变）
function cutCircle(l, x, y, r, a1, a2, a3) {
  l.beginPath(); l.arc(x, y, r, 0, Math.PI * 2); l.fillStyle = `rgba(0,0,0,${a1})`; l.fill();
  l.beginPath(); l.arc(x, y, r * 0.68, 0, Math.PI * 2); l.fillStyle = `rgba(0,0,0,${a2})`; l.fill();
  l.beginPath(); l.arc(x, y, r * 0.42, 0, Math.PI * 2); l.fillStyle = `rgba(0,0,0,${a3})`; l.fill();
}

// 手电扇形（分层）
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function cutCone(l, x, y, dir, r, halfRad) {
  const v = DIRV[dir] || DIRV.down;
  const ang = Math.atan2(v[1], v[0]);
  const bands = [[1.0, 0.28], [0.7, 0.5], [0.45, 0.85]];
  for (const [k, a] of bands) {
    l.beginPath();
    l.moveTo(x, y);
    l.arc(x, y, r * k, ang - halfRad, ang + halfRad);
    l.closePath();
    l.fillStyle = `rgba(0,0,0,${a})`;
    l.fill();
  }
}

function drawLighting(G, ctx) {
  const l = ensureLightCanvas(G);
  if (!l) return;
  const cam = G.camera, t = G.time || 0;
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, G.W, G.H);
  l.fillStyle = 'rgba(6,8,16,0.92)'; // 深夜黑暗层
  l.fillRect(0, 0, G.W, G.H);
  l.globalCompositeOperation = 'destination-out'; // 挖光

  const { lamps, windows } = lightSources(G);
  // 路灯光池（半径~55，轻微闪烁，每盏灯相位随机）
  for (const lp of lamps) {
    const sx = lp.x - cam.x, sy = lp.y + 4 - cam.y;
    if (sx < -70 || sy < -70 || sx > G.W + 70 || sy > G.H + 70) continue;
    const ph = phaseFor(lp);
    const flick = 0.94 + 0.05 * Math.sin(t * 7.3 + ph) + 0.03 * Math.sin(t * 17.1 + ph * 2.7);
    cutCircle(l, sx, sy, 55 * flick, 0.3, 0.55, 0.9);
  }
  // 亮窗光斑（半径~30，略微下移落在窗下地面）
  for (const wn of windows) {
    const sx = wn.x - cam.x, sy = wn.y + 8 - cam.y;
    if (sx < -45 || sy < -45 || sx > G.W + 45 || sy > G.H + 45) continue;
    cutCircle(l, sx, sy, 30, 0.3, 0.5, 0.8);
  }
  const p = G.player;
  if (p && !p.hidden) {
    const sx = p.x - cam.x, sy = p.y - cam.y;
    if (G.flashlightOn) cutCone(l, sx, sy - 2, p.dir, 90, (55 / 2) * Math.PI / 180); // 手电扇形 r=90, 角55°
    cutCircle(l, sx, sy, 14, 0.35, 0.55, 0.8); // 玩家自身微光 r=14，保证黑暗中最小可操作
  }

  ctx.drawImage(lightCanvas, 0, 0);
}

// ---------- 噪点 / 扫描线 / 暗角 ----------
function drawOverlayFX(G, ctx) {
  // 胶片噪点（每帧随机，闪烁颗粒感）
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect((Math.random() * G.W) | 0, (Math.random() * G.H) | 0, 1, 1);
  }
  // 扫描线：每 3 行 1 条
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < G.H; y += 3) ctx.fillRect(0, y, G.W, 1);
  // 四角暗角
  const vg = ctx.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.42, G.W / 2, G.H / 2, G.W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, G.W, G.H);
}

// ---------- 主渲染（菜单/死亡/胜利画面由 ui.js 负责） ----------
export function render(G) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  const ctx = G.ctx;
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0a0c14';
  ctx.fillRect(0, 0, G.W, G.H);

  ctx.save();
  ctx.translate(-Math.round(G.camera.x), -Math.round(G.camera.y));
  drawTiles(G, ctx);       // 瓦片层
  drawObjects(G, ctx);     // 物件层
  drawBarricades(G, ctx);  // 木板障碍
  drawThrowns(G, ctx);     // 投掷中的鞭炮
  drawPlayer(G, ctx);      // 玩家
  drawEnemy(G, ctx);       // 剥皮人
  ctx.restore();

  drawLighting(G, ctx);    // 光照层
  drawOverlayFX(G, ctx);   // 噪点/扫描线/暗角
}
