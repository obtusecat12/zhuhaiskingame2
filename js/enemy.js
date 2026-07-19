// js/enemy.js — 开发者C：剥皮人 AI
// 状态机：patrol → suspect → chase → search → return（+ 守柜子状态 guard）
// 严格遵循 DESIGN.md §6.3。只允许 import state/sprites/audio/world/items。
import { Audio } from './audio.js';
import { noiseAt } from './world.js';

const VIEW_DIST = 85;                              // 基础视距 px（§6.3）
const VIEW_COS = Math.cos(35 * Math.PI / 180);     // 视角 70°（半角 35°）
const FLASH_MULT = 1.6;                            // 玩家开手电 → 视距 ×1.6
const CATCH_DIST = 12;                             // 抓捕距离
const REPATH_INTERVAL = 0.3;                       // chase BFS 重算间隔（§6.3）
const SPEED = { patrol: 40, suspect: 55, chase: 85, search: 45, return: 50, guard: 60 };
const HW = 6, HH = 7;                              // AABB 12×14
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function sfx(n) { try { Audio.sfx(n); } catch (_) { /* 静默 */ } }
function tension(x) { try { Audio.setTension(x); } catch (_) { /* 静默 */ } }
function noise(G, x, y, r) { try { noiseAt(G, x, y, r); } catch (_) { /* 静默 */ } }

export function createEnemy(G) {
  const s = (G.world && G.world.enemySpawn) || { x: 400, y: 300 };
  // 巡逻点：从 world.lamps 取点（路灯/巷口位置，§6.3 任务要求）
  const lamps = (G.world && G.world.lamps) || [];
  let pts = lamps.map((l) => ({ x: l.x, y: l.y }));
  if (pts.length < 2) { // 路灯不足时的兜底巡逻三角
    pts = [{ x: s.x, y: s.y }, { x: s.x + 64, y: s.y }, { x: s.x, y: s.y + 64 }];
  }
  G.enemy = {
    x: s.x, y: s.y, hw: HW, hh: HH,
    dir: 'down', frame: 0, animT: 0, moving: false,
    state: 'patrol',
    pts, pi: 0, pauseT: 0,            // 巡逻点/停留
    path: null, pathI: 0, repathT: 0, // BFS 路径
    tx: s.x, ty: s.y,                 // suspect 目标点
    lastSeen: { x: s.x, y: s.y }, loseT: 0,
    suspectT: 0, lookT: 0,            // 到点张望
    searchT: 0, searchSpot: null, spotPause: 0,
    guardPos: null, guardT: 0,        // 守柜
    attackTarget: null, attackT: 0,   // 劈砍木板
    doorTarget: null, doorT: 0,       // 正在开门（0.6s，剥皮人不破门只开门）
    blocked: false, stuckT: 0,
    sawVisible: false, retIdx: null,
  };
  return G.enemy;
}

// ---------- 碰撞 / 移动 ----------
function boxSolid(w, x, y, hw, hh) {
  return w.solid(x - hw, y - hh) || w.solid(x + hw, y - hh) ||
         w.solid(x - hw, y + hh) || w.solid(x + hw, y + hh);
}
function slideMove(w, e, dx, dy) {
  if (dx && !boxSolid(w, e.x + dx, e.y, e.hw, e.hh)) e.x += dx;
  if (dy && !boxSolid(w, e.x, e.y + dy, e.hw, e.hh)) e.y += dy;
}
function face(e, ux, uy) {
  if (Math.abs(ux) >= Math.abs(uy)) e.dir = ux > 0 ? 'right' : 'left';
  else e.dir = uy > 0 ? 'down' : 'up';
}

// ---------- BFS 网格寻路（60×40，§6.3） ----------
// throughPlanks=true 时把木板格视为可通过（走到跟前停下攻击）
function repath(G, e, tx, ty, throughPlanks) {
  e.stuckT = 0; e.blocked = false;
  const T = G.TILE, W = G.MAPW, H = G.MAPH;
  const w = G.world;
  if (!w || typeof w.solid !== 'function') { e.path = null; return; }
  const planks = new Set();
  if (throughPlanks && Array.isArray(w.barricades)) {
    for (const b of w.barricades) if (b) planks.add(((b.y / T) | 0) * W + ((b.x / T) | 0));
  }
  const blocked = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    if (planks.has(cy * W + cx)) return false;
    // 关着的门视为可通过：途经时触发开门动作（停留 0.6s 开门，不破门）
    const d = (typeof w.doorAt === 'function') ? w.doorAt(cx, cy) : null;
    if (d && d.open === false) return false;
    const px = cx * T + 8, py = cy * T + 8;
    return w.solid(px, py) || w.solid(px - 6, py - 6) || w.solid(px + 6, py - 6) ||
           w.solid(px - 6, py + 6) || w.solid(px + 6, py + 6);
  };
  const sx = clamp((e.x / T) | 0, 0, W - 1), sy = clamp((e.y / T) | 0, 0, H - 1);
  let gx = clamp((tx / T) | 0, 0, W - 1), gy = clamp((ty / T) | 0, 0, H - 1);
  if (blocked(gx, gy)) { // 目标格不可走时找最近可走格（半径 ≤3）
    let found = false;
    for (let r = 1; r <= 3 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!blocked(gx + dx, gy + dy)) { gx += dx; gy += dy; found = true; }
        }
      }
    }
    if (!found) { e.path = null; return; }
  }
  const start = sy * W + sx, goal = gy * W + gx;
  const prev = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  prev[start] = start; q[qt++] = start;
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  while (qh < qt) {
    const cur = q[qh++];
    if (cur === goal) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let i = 0; i < 4; i++) {
      const nx = cx + DX[i], ny = cy + DY[i];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (prev[ni] !== -1) continue;
      if (ni !== goal && blocked(nx, ny)) continue;
      prev[ni] = cur; q[qt++] = ni;
    }
  }
  if (prev[goal] === -1) { e.path = null; return; } // 不可达
  const cells = [];
  let c = goal;
  while (c !== start) { cells.push(c); c = prev[c]; }
  cells.reverse();
  e.path = cells.map((ci) => ({ x: (ci % W) * T + 8, y: ((ci / W) | 0) * T + 8 }));
  e.pathI = 0;
}

// 沿路径行走；返回 true=到达终点。e.blocked/e.stuckT 记录受阻
function followPath(G, e, dt, speed) {
  if (!e.path || e.pathI >= e.path.length) { e.path = null; return true; }
  const wp = e.path[e.pathI];
  const dx = wp.x - e.x, dy = wp.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 3.5) {
    e.pathI++;
    if (e.pathI >= e.path.length) { e.path = null; return true; }
    return false;
  }
  const step = speed * dt, ux = dx / d, uy = dy / d;
  face(e, ux, uy);
  const ox = e.x, oy = e.y;
  slideMove(G.world, e, ux * step, uy * step);
  e.moving = true;
  if (Math.hypot(e.x - ox, e.y - oy) < step * 0.35) { e.blocked = true; e.stuckT += dt; }
  else { e.blocked = false; e.stuckT = 0; }
  tryStartDoorOpen(G, e);
  return false;
}

// 贪心直线移动（BFS 不可达时兜底，用于撞木板/贴墙）
function greedyMove(G, e, dt, speed, tx, ty) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 6) return true;
  const step = Math.min(speed * dt, d);
  face(e, dx / d, dy / d);
  const ox = e.x, oy = e.y;
  slideMove(G.world, e, dx / d * step, dy / d * step);
  e.moving = true;
  if (Math.hypot(e.x - ox, e.y - oy) < step * 0.35) { e.blocked = true; e.stuckT += dt; }
  else { e.blocked = false; e.stuckT = 0; }
  tryStartDoorOpen(G, e);
  return false;
}

// ---------- 剥皮人开门（不破坏门）：撞到关门停留 0.6s 把门打开 ----------
const DOOR_OPEN_TIME = 0.6;
function closedDoorNear(G, e) {
  const w = G.world;
  if (!w || typeof w.doorAt !== 'function') return null;
  const T = G.TILE;
  const etx = (e.x / T) | 0, ety = (e.y / T) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const d = w.doorAt(etx + dx, ety + dy);
    if (d && d.open === false && Math.hypot(d.x - e.x, d.y - e.y) < 17) return d;
  }
  return null;
}
function tryStartDoorOpen(G, e) {
  if (!e.blocked || e.doorT > 0) return;
  const d = closedDoorNear(G, e);
  if (d) { e.doorTarget = d; e.doorT = DOOR_OPEN_TIME; }
}
// 开门倒计时（updateEnemy 每帧调用）；返回 true=本帧在开门，跳过移动
function doorTick(G, e, dt) {
  if (e.doorT <= 0) return false;
  const d = e.doorTarget;
  if (d) face(e, d.x - e.x, d.y - e.y);
  e.moving = false;
  e.doorT -= dt;
  if (e.doorT <= 0) {
    if (d && d.open === false) {
      d.open = true; d.solid = false;
      sfx('door');
      noise(G, d.x, d.y, 70);      // 开门声响（噪音）
    }
    e.doorTarget = null;
    e.repathT = 0;                 // 门已开，立即重算路径穿门
  }
  return true;
}

function nearestPlank(G, e, maxD) {
  const arr = G.world && G.world.barricades;
  if (!arr) return null;
  let best = null, bd = maxD;
  for (const b of arr) {
    if (!b) continue;
    const d = Math.hypot(b.x - e.x, b.y - e.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---------- 感知 ----------
// 返回 0=不可见，否则为本秒累积速率（光池/手电内更快）
function seeRate(G, e, p) {
  if (p.hidden) return 0; // 灌木/柜中不可见（§6.3）
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy);
  const vd = VIEW_DIST * (G.flashlightOn ? FLASH_MULT : 1); // 手电加成
  if (d > vd) return 0;
  if (d > 10) { // 10px 内视为贴脸必见
    const f = DIRS[e.dir] || DIRS.down;
    if ((dx * f[0] + dy * f[1]) / d < VIEW_COS) return 0; // 视锥外
  }
  const w = G.world;
  if (w && typeof w.losBlocked === 'function' && w.losBlocked(e.x, e.y, p.x, p.y)) return 0;
  let lit = G.flashlightOn ? 2 : 1; // 玩家开手电自带照明 → 累积更快
  if (w) {
    const lamps = w.lamps || [];
    for (let i = 0; i < lamps.length; i++) {
      const lx = p.x - lamps[i].x, ly = p.y - (lamps[i].y + 4);
      if (lx * lx + ly * ly < 55 * 55) { lit = Math.max(lit, 2); break; } // 路灯光池内
    }
    if (lit < 2) {
      const wins = w.windows || [];
      for (let i = 0; i < wins.length; i++) {
        const wx = p.x - wins[i].x, wy = p.y - wins[i].y;
        if (wx * wx + wy * wy < 30 * 30) { lit = 2; break; } // 窗光内
      }
    }
  }
  return lit * (0.9 + 1.2 * (1 - d / vd)); // 越近累积越快
}

function hearNoise(G, e) {
  const ns = G.world && G.world.noises;
  if (!ns || !ns.length) return null;
  let best = null, bd = Infinity;
  for (const n of ns) {
    if (!n) continue;
    const r = n.r == null ? 0 : n.r;
    const d = Math.hypot((n.x || 0) - e.x, (n.y || 0) - e.y);
    if (d <= r && d < bd) { bd = d; best = n; }
  }
  return best;
}

// ---------- 状态切换（chase 时 setTension(1)，脱离后 0） ----------
function toState(G, e, s) {
  if (e.state === s) return;
  e.state = s;
  e.path = null; e.repathT = 0; e.stuckT = 0; e.blocked = false;
  e.attackTarget = null;
  if (s === 'chase' && G.stats) G.stats.chases++;   // 胜利画面统计：被追次数
  tension(s === 'chase' ? 1 : 0);
}

// ---------- 劈砍木板（0.8s/刀，3 刀破，刀声是噪音） ----------
function attackTick(G, e, dt) {
  const b = e.attackTarget;
  const arr = G.world && G.world.barricades;
  if (!b || !arr || arr.indexOf(b) < 0) { e.attackTarget = null; e.repathT = 0; return; }
  face(e, b.x - e.x, b.y - e.y);
  e.moving = false;
  e.attackT += dt;
  e.frame = Math.floor(e.attackT / 0.4) % 2; // 挥刀动画
  if (e.attackT >= 0.8) {
    e.attackT = 0;
    b.hp = (b.hp == null ? 3 : b.hp) - 1;
    sfx('hit');
    noise(G, e.x, e.y, 110); // 刀声是噪音
    if (b.hp <= 0) {
      arr.splice(arr.indexOf(b), 1);
      e.attackTarget = null;
      e.repathT = 0;
    }
  }
}

// ---------- 各状态 ----------
function doPatrol(G, e, dt) {
  if (e.pauseT > 0) { e.pauseT -= dt; return; }
  const pts = e.pts;
  const pt = pts[e.pi % pts.length];
  if (!e.path) repath(G, e, pt.x, pt.y, false);
  const arrived = (e.path && e.path.length) ? followPath(G, e, dt, SPEED.patrol) : true;
  if (arrived || (e.blocked && e.stuckT > 0.8)) { // 到达或长期受阻 → 下一点
    e.pi = (e.pi + 1) % pts.length;
    e.pauseT = 0.9;
    e.path = null;
  }
}

function doSuspect(G, e, dt) {
  if (!e.path) repath(G, e, e.tx, e.ty, false);
  const arrived = (e.path && e.path.length) ? followPath(G, e, dt, SPEED.suspect) : true;
  if (arrived || (e.blocked && e.stuckT > 0.8)) {
    // 到点张望：缓慢扫视 4 个方向
    e.suspectT -= dt;
    e.lookT += dt;
    if (e.lookT > 0.65) {
      e.lookT = 0;
      const order = ['down', 'left', 'up', 'right'];
      e.dir = order[(order.indexOf(e.dir) + 1) % 4];
    }
    if (e.suspectT <= 0) toState(G, e, 'return');
  }
}

function doChase(G, e, dt, visible) {
  const p = G.player;
  G.detection = 1; // 追击期间保持满警觉
  if (visible) { e.loseT = 0; e.lastSeen.x = p.x; e.lastSeen.y = p.y; }
  else e.loseT += dt;
  const tx = visible ? p.x : e.lastSeen.x;
  const ty = visible ? p.y : e.lastSeen.y;
  if (e.attackTarget) { attackTick(G, e, dt); return; } // 砍木板中
  e.repathT -= dt;
  if (e.repathT <= 0) { repath(G, e, tx, ty, true); e.repathT = REPATH_INTERVAL; }
  if (e.path && e.path.length) followPath(G, e, dt, SPEED.chase);
  else greedyMove(G, e, dt, SPEED.chase, tx, ty); // BFS 不可达 → 贪心（可撞木板）
  if (e.blocked) {
    const b = nearestPlank(G, e, 22);
    if (b) { e.attackTarget = b; e.attackT = 0; return; } // 撞木板 → 停下攻击
    if (e.stuckT > 0.5) e.repathT = 0; // 卡墙 → 立即重算
  }
  if (!visible) { // 丢失目标 → 最后目击点附近游荡 20s
    const dl = Math.hypot(e.lastSeen.x - e.x, e.lastSeen.y - e.y);
    if (dl < 10 || e.loseT > 4) {
      e.searchT = 20; e.searchSpot = null;
      toState(G, e, 'search');
    }
  }
}

function doSearch(G, e, dt) {
  e.searchT -= dt;
  if (e.searchT <= 0) { toState(G, e, 'return'); return; }
  if (!e.searchSpot) { // 最后目击点附近随机游荡点
    const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 48;
    e.searchSpot = {
      x: clamp(e.lastSeen.x + Math.cos(a) * r, 16, G.MAPW * G.TILE - 16),
      y: clamp(e.lastSeen.y + Math.sin(a) * r, 16, G.MAPH * G.TILE - 16),
    };
    repath(G, e, e.searchSpot.x, e.searchSpot.y, false);
    e.spotPause = 0;
  }
  const arrived = (e.path && e.path.length) ? followPath(G, e, dt, SPEED.search) : true;
  if (arrived || (e.blocked && e.stuckT > 0.6)) {
    e.spotPause += dt;
    if (e.spotPause > 0.7) e.searchSpot = null; // 停顿片刻换下一个游荡点
  }
}

function doReturn(G, e, dt) {
  const pts = e.pts;
  if (!pts || !pts.length) { toState(G, e, 'patrol'); return; }
  if (e.retIdx == null) { // 回最近巡逻点
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - e.x) ** 2 + (pts[i].y - e.y) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    e.retIdx = bi;
    e.path = null;
  }
  const pt = pts[e.retIdx];
  if (!e.path) repath(G, e, pt.x, pt.y, false);
  let arrived;
  if (e.path && e.path.length) arrived = followPath(G, e, dt, SPEED.return);
  else arrived = Math.hypot(pt.x - e.x, pt.y - e.y) < 10;
  if (arrived || (e.blocked && e.stuckT > 0.8)) {
    e.pi = e.retIdx;
    e.retIdx = null;
    e.pauseT = 0;
    toState(G, e, 'patrol');
  }
}

// 目击玩家进柜 → 走到柜前待命 8s；玩家出来立即 chase（§6.3）
function doGuard(G, e, dt) {
  const p = G.player, gp = e.guardPos;
  G.detection = Math.max(G.detection, 0.9);
  if (!gp) { toState(G, e, 'return'); return; }
  if (p && !p.hidden) { // 玩家出来 → 立即追击
    G.detection = 1;
    e.loseT = 0;
    e.lastSeen.x = p.x; e.lastSeen.y = p.y;
    toState(G, e, 'chase');
    sfx('sting');
    return;
  }
  const d = Math.hypot(gp.x - e.x, gp.y - e.y);
  if (d > 16) { // 走到柜前
    if (e.attackTarget) { attackTick(G, e, dt); return; }
    e.repathT -= dt;
    if (e.repathT <= 0) { repath(G, e, gp.x, gp.y, true); e.repathT = 0.4; }
    if (e.path && e.path.length) followPath(G, e, dt, SPEED.guard);
    else greedyMove(G, e, dt, SPEED.guard, gp.x, gp.y);
    if (e.blocked) {
      const b = nearestPlank(G, e, 22);
      if (b) { e.attackTarget = b; e.attackT = 0; }
    }
  } else { // 守柜倒计时
    face(e, gp.x - e.x, gp.y - e.y);
    e.guardT -= dt;
    if (e.guardT <= 0) { // 放弃守柜：降警觉避免立刻无意义二次追击
      e.guardPos = null;
      G.detection = Math.min(G.detection, 0.5);
      toState(G, e, 'return');
    }
  }
}

// ---------- 主更新 ----------
export function updateEnemy(G, dt) {
  const e = G.enemy;
  if (!e || G.state !== 'playing') return;
  const p = G.player;

  // --- 视觉 / G.detection 累积与衰减 ---
  const rate = p ? seeRate(G, e, p) : 0;
  const visible = rate > 0;
  if (visible) {
    G.detection = clamp(G.detection + rate * dt, 0, 1);
    e.lastSeen.x = p.x; e.lastSeen.y = p.y;
  } else if (e.state !== 'chase' && e.state !== 'guard') {
    G.detection = clamp(G.detection - 0.25 * dt, 0, 1);
  }

  // --- 目击进柜 → 守柜 8s ---
  if (p && p.hidden && e.sawVisible && e.state !== 'guard') {
    e.guardPos = { x: p.x, y: p.y };
    e.guardT = 8;
    toState(G, e, 'guard');
  }
  e.sawVisible = visible;

  // --- 警觉满 → chase（发现音效 sting；守柜期间由 doGuard 自行管理，不抢状态） ---
  if (G.detection >= 1 && e.state !== 'chase' && e.state !== 'guard') {
    e.loseT = 0;
    toState(G, e, 'chase');
    sfx('sting');
  } else if (visible && G.detection >= 0.3 &&
             (e.state === 'patrol' || e.state === 'return' || e.state === 'search')) {
    // 瞥见 → suspect 走向瞥见处
    e.tx = p.x; e.ty = p.y;
    e.suspectT = 2.6; e.lookT = 0;
    toState(G, e, 'suspect');
  }

  // --- 听觉（chase/守柜时不被噪音打断） ---
  if (e.state !== 'chase' && e.state !== 'guard') {
    const n = hearNoise(G, e);
    if (n) {
      if (e.state !== 'suspect' || Math.hypot(n.x - e.tx, n.y - e.ty) > 10) e.path = null;
      e.tx = n.x; e.ty = n.y;
      e.suspectT = 2.6; e.lookT = 0;
      if (e.state !== 'suspect') toState(G, e, 'suspect');
      G.detection = clamp(G.detection + 0.12, 0, 1);
    }
  }

  e.moving = false;
  if (!doorTick(G, e, dt)) {   // 开门停留期间不移动（0.6s）
    switch (e.state) {
      case 'patrol': doPatrol(G, e, dt); break;
      case 'suspect': doSuspect(G, e, dt); break;
      case 'chase': doChase(G, e, dt, visible); break;
      case 'search': doSearch(G, e, dt); break;
      case 'return': doReturn(G, e, dt); break;
      case 'guard': doGuard(G, e, dt); break;
      default: toState(G, e, 'patrol');
    }
  }

  // --- 抓捕：距离 <12px → 跳杀（jumpscare，1.8s 后自动 dead）+ 剥皮惨叫 ---
  if (p && !p.hidden && G.state === 'playing') {
    if (Math.hypot(p.x - e.x, p.y - e.y) < CATCH_DIST) {
      G.state = 'jumpscare';
      G.jumpscareT = 1.8;
      sfx('skinned');
      tension(0);
    }
  }

  // --- 4 方向换帧动画 ---
  if (e.moving) {
    e.animT += dt * (e.state === 'chase' ? 10 : 7);
    e.frame = Math.floor(e.animT) % 2;
  } else if (!e.attackTarget) {
    e.frame = 0;
  }

  // 地图边界保险
  e.x = clamp(e.x, HW, G.MAPW * G.TILE - HW);
  e.y = clamp(e.y, HH, G.MAPH * G.TILE - HH);
}
