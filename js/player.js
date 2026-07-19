// js/player.js — 开发者C：玩家控制（移动/体力/手电/交互/道具/噪音/碰撞/4向动画）
// 严格遵循 DESIGN.md §6.2。只允许 import state/sprites/audio/world/items。
import { Audio } from './audio.js';
import { say } from './state.js';
import { tryInteract, noiseAt, MAP, TILE } from './world.js';
import { useItem } from './items.js';

const WALK = 62;   // px/s（§6.2）
const RUN = 108;   // px/s
const HW = 6, HH = 7; // AABB 12×14（中心锚点）

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function sfx(n) { try { Audio.sfx(n); } catch (_) { /* 音频未初始化时静默 */ } }
function noise(G, x, y, r) { try { noiseAt(G, x, y, r); } catch (_) { /* world 未就绪 */ } }
function msg(G, t, s) { try { if (say) say(G, t, s); } catch (_) { /* 忽略 */ } }

export function createPlayer(G) {
  const s = (G.world && G.world.playerSpawn) || { x: 80, y: 80 };
  G.player = {
    x: s.x, y: s.y,
    hw: HW, hh: HH,
    dir: 'down', frame: 0, animT: 0,
    stamina: 100, exhausted: 0,   // 体力 0..100；疲惫锁定剩余秒数
    hidden: false, moving: false, running: false,
    stepT: 0,
  };
  return G.player;
}

// ---------- AABB 滑动碰撞（查询 G.world.solid，像素坐标） ----------
function boxSolid(w, x, y) {
  return w.solid(x - HW, y - HH) || w.solid(x + HW, y - HH) ||
         w.solid(x - HW, y + HH) || w.solid(x + HW, y + HH);
}
function slideMove(w, p, dx, dy) {
  if (dx && !boxSolid(w, p.x + dx, p.y)) p.x += dx; // X 轴
  if (dy && !boxSolid(w, p.x, p.y + dy)) p.y += dy; // Y 轴（分轴实现沿墙滑动）
}

// ---------- 门洞自动吸附（反馈1） ----------
// 玩家碰撞盒与敞开的门瓦片相邻、且移动方向大致朝向门洞时，对垂直于移动
// 方向的坐标做柔和居中引导（每帧向门中心线 lerp 20%），斜着接近也能
// 顺滑滑入门洞。只影响门洞附近，不改动其他碰撞。
function doorSnap(G, w, p, ix, iy) {
  if (!w || typeof w.tileAt !== 'function') return;
  const T = G.TILE || 16;
  const ptx = (p.x / T) | 0, pty = (p.y / T) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const tx = ptx + dx, ty = pty + dy;
    if (w.tileAt(tx, ty) !== TILE.DOOR) continue;      // 只看门瓦片
    const door = typeof w.doorAt === 'function' ? w.doorAt(tx, ty) : null;
    if (door && door.open === false) continue;         // 关着的门不吸附
    const cx = tx * T + 8, cy = ty * T + 8;
    // 门洞通行轴：左右皆实体 → 竖向通行（引导 x）；上下皆实体 → 横向通行（引导 y）
    const vertical = w.solidTile(tx - 1, ty) && w.solidTile(tx + 1, ty);
    const horizontal = w.solidTile(tx, ty - 1) && w.solidTile(tx, ty + 1);
    if (vertical && iy !== 0) {
      if (Math.abs(p.y - cy) > T * 1.3) continue;      // 距门洞太远
      if ((cy - p.y) * iy < -4) continue;              // 背离门洞移动
      const off = cx - p.x;
      if (Math.abs(off) > 9) continue;                 // 偏太多时不抢操作
      const step = off * 0.2;                          // 每帧 lerp 20% 向门中心线
      if (step && !boxSolid(w, p.x + step, p.y)) p.x += step;
    } else if (horizontal && ix !== 0) {
      if (Math.abs(p.x - cx) > T * 1.3) continue;
      if ((cx - p.x) * ix < -4) continue;
      const off = cy - p.y;
      if (Math.abs(off) > 9) continue;
      const step = off * 0.2;
      if (step && !boxSolid(w, p.x, p.y + step)) p.y += step;
    }
  }
}

// 灌木减速（§5.1：'B' 可通行但减速）
function inBush(G, x, y) {
  const tx = (x / G.TILE) | 0, ty = (y / G.TILE) | 0;
  try {
    const row = MAP && MAP[ty];
    return !!(row && row[tx] === 'B');
  } catch (_) { return false; }
}

function shiftDown(k) { return !!(k.ShiftLeft || k.ShiftRight || k.Shift); }

export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p || G.state !== 'playing') return;
  const k = G.keys, pr = G.pressed;
  const w = G.world;

  if (p.exhausted > 0) p.exhausted -= dt;

  // 背包格选择 Digit1-4（§3）
  for (let i = 0; i < 4; i++) {
    const code = 'Digit' + (i + 1);
    if (pr[code]) { delete pr[code]; G.selectedSlot = i; sfx('click'); }
  }
  // 手电开关（§6.2：切换有音效；开灯时 enemy 视觉 ×1.6，由 enemy.js 读取 G.flashlightOn）
  if (pr.KeyF) {
    delete pr.KeyF;
    G.flashlightOn = !G.flashlightOn;
    sfx('flashlight');
  }
  // E 交互（仅在本帧刚按下时；搜刮/开柜噪音 r=50，§6.2）
  if (pr.KeyE) {
    delete pr.KeyE;
    try { tryInteract(G); } catch (err) { if (typeof console !== 'undefined') console.error(err); }
    noise(G, p.x, p.y, 50);
  }
  // Q 使用当前选中道具（§3/§5.3）
  if (pr.KeyQ) {
    delete pr.KeyQ;
    try { useItem(G); } catch (err) { if (typeof console !== 'undefined') console.error(err); }
  }

  // 躲藏时不可移动（§5.2/§6.2）
  if (p.hidden) {
    p.moving = false; p.running = false; p.frame = 0;
    return;
  }

  // 输入方向
  let ix = 0, iy = 0;
  if (k.KeyA || k.ArrowLeft) ix -= 1;
  if (k.KeyD || k.ArrowRight) ix += 1;
  if (k.KeyW || k.ArrowUp) iy -= 1;
  if (k.KeyS || k.ArrowDown) iy += 1;

  const mag = Math.hypot(ix, iy);
  p.moving = mag > 0;

  // 奔跑判定：体力为 0 或疲惫锁定期内强制走路（§6.2）
  p.running = p.moving && shiftDown(k) && p.exhausted <= 0 && p.stamina > 0;

  if (p.moving) {
    const nx = ix / mag, ny = iy / mag;
    let sp = p.running ? RUN : WALK;
    if (inBush(G, p.x, p.y)) sp *= 0.6; // 灌木减速
    // 4 方向朝向：取主轴，对角线优先水平
    if (Math.abs(ix) >= Math.abs(iy)) p.dir = ix > 0 ? 'right' : 'left';
    else p.dir = iy > 0 ? 'down' : 'up';

    if (w && typeof w.solid === 'function') {
      slideMove(w, p, nx * sp * dt, ny * sp * dt);
      doorSnap(G, w, p, ix, iy);   // 门洞自动吸附（反馈1）
    } else { p.x += nx * sp * dt; p.y += ny * sp * dt; }

    // 走路换帧动画（跑步稍快）
    p.animT += dt * (p.running ? 11 : 7);
    p.frame = Math.floor(p.animT) % 2;

    // 噪音 + 脚步声：奔跑每 0.4s r=90；走路 r=35（§6.2）
    p.stepT -= dt;
    if (p.stepT <= 0) {
      if (p.running) { noise(G, p.x, p.y, 90); sfx('run'); p.stepT = 0.4; }
      else { noise(G, p.x, p.y, 35); sfx('step'); p.stepT = 0.5; }
    }

    // 体力：奔跑 -22/s；走路 +10/s
    if (p.running) {
      p.stamina -= 22 * dt;
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.exhausted = 1.5; // 1.5s 内不能跑
        p.running = false;
        msg(G, '太累了，跑不动了……', 1.5);
      }
    } else {
      p.stamina = Math.min(100, p.stamina + 10 * dt);
    }
  } else {
    p.frame = 0; p.animT = 0; p.stepT = 0;
    p.stamina = Math.min(100, p.stamina + 16 * dt); // 站立 +16/s
  }

  // 地图边界保险
  p.x = clamp(p.x, HW, G.MAPW * G.TILE - HW);
  p.y = clamp(p.y, HH, G.MAPH * G.TILE - HH);
}
