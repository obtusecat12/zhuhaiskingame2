// js/state.js — 《珠海剥皮人》共享状态 G / 消息 / 开新局 / 存档（集成者，契约 §2）
// 注意：本模块不 import world/player/enemy/items（它们都 import state，会形成循环）。
// resetRun 需要的 buildWorld/createPlayer/createEnemy/resetInventory/inventory
// 由 main.js 在启动时通过 setFactories() 注入。

export const G = {
  W: 426, H: 240, TILE: 16, MAPW: 60, MAPH: 40,
  canvas: null, ctx: null,
  state: 'menu',      // 'menu'|'help'|'playing'|'paused'|'jumpscare'|'dead'|'win'
  time: 0, dt: 0, frame: 0,
  keys: {}, pressed: {},          // keys=持续按住, pressed=本帧刚按下（消费后清除）
  camera: { x: 0, y: 0 },
  player: null, enemy: null,
  world: null,       // buildWorld 返回，见契约 §5
  msg: { text: '', timer: 0 },    // 屏幕下方消息
  detection: 0,      // 0..1 剥皮人警觉度（UI 显示眼睛）
  keysCollected: 0, keysNeeded: 3,
  flashlightOn: false,
  selectedSlot: 0,
  ambient: {}, audioStarted: false,
  stats: { time: 0, searches: 0, chases: 0 },  // 胜利画面统计（ui.js readStats 读取）
};

// 设置屏幕下方消息
export function say(G, text, seconds = 3) {
  if (!G || !G.msg) return;
  G.msg.text = String(text == null ? '' : text);
  G.msg.timer = (typeof seconds === 'number' && seconds > 0) ? seconds : 3;
}

// ---------------------------------------------------------------------------
// 工厂注入：打破 state <-> world/player/enemy/items 的模块循环
// ---------------------------------------------------------------------------
const factories = {
  buildWorld: null,
  createPlayer: null,
  createEnemy: null,
  resetInventory: null,
  inventory: null,
};
export function setFactories(f) {
  if (!f) return;
  for (const k in factories) if (typeof f[k] === 'function') factories[k] = f[k];
}

// ---------------------------------------------------------------------------
// 存档（localStorage 'zh-skinner-save'）
// 序列化：玩家位置/体力/手电、剥皮人位置与状态、keysCollected、背包、
// world.searched（Set→数组，含已搜容器）、barricades、选中格、统计。
// ---------------------------------------------------------------------------
const SAVE_KEY = 'zh-skinner-save';
const ENEMY_STATES = new Set(['patrol', 'suspect', 'chase', 'search', 'return', 'guard']);

export function saveGame(G) {
  try {
    const w = G.world, p = G.player, e = G.enemy;
    if (!w || !p) return false;
    const inv = factories.inventory ? factories.inventory() : [];
    const data = {
      v: 1,
      player: {
        x: p.x, y: p.y,
        stamina: (typeof p.stamina === 'number') ? p.stamina : 100,
        dir: p.dir || 'down',
      },
      flashlightOn: !!G.flashlightOn,
      enemy: e ? { x: e.x, y: e.y, state: e.state } : null,
      keysCollected: G.keysCollected | 0,
      inventory: (inv || []).filter(s => s && s.id && s.n > 0)
        .map(s => ({ id: s.id, n: s.n | 0 })),
      searched: Array.from(w.searched || []),          // Set -> 数组
      barricades: (w.barricades || []).filter(b => b)
        .map(b => ({ tx: b.tx | 0, ty: b.ty | 0, hp: (b.hp == null ? 3 : b.hp) | 0 })),
      doors: (w.objects || []).filter(o => o && o.type === 'door')
        .map(o => ({ tx: o.tx | 0, ty: o.ty | 0, open: !!o.open, unlocked: !!o.unlocked,
                     variant: (o.variant | 0) })), // 门的开闭/解锁状态 + 颜色变体（反馈5）
      selectedSlot: G.selectedSlot | 0,
      stats: {
        time: (G.stats && +G.stats.time) || 0,
        searches: (G.stats && G.stats.searches | 0) || 0,
        chases: (G.stats && G.stats.chases | 0) || 0,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false; // localStorage 不可用/超容量时静默失败
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    return d;
  } catch (err) {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) != null;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// resetRun：开新局（saved=null）或从存档恢复。
// 重建 world（buildWorld）、createPlayer、createEnemy、清背包与 detection，
// G.state='playing'；有 saved 时恢复序列化字段。
// ---------------------------------------------------------------------------
export function resetRun(G, saved = null) {
  // 局级数据复位
  G.keysCollected = 0;
  G.detection = 0;
  G.flashlightOn = false;
  G.selectedSlot = 0;
  G.msg.text = ''; G.msg.timer = 0;
  G.stats = { time: 0, searches: 0, chases: 0 };
  if (factories.resetInventory) factories.resetInventory();

  // 重建世界与角色
  G.world = factories.buildWorld ? factories.buildWorld(G) : null;
  G.player = factories.createPlayer ? factories.createPlayer(G) : null;
  G.enemy = factories.createEnemy ? factories.createEnemy(G) : null;

  // 从存档恢复
  if (saved) applySave(G, saved);

  // 摄像机立即对准玩家（避免第一帧大跳转）
  if (G.player) {
    const maxX = G.MAPW * G.TILE - G.W, maxY = G.MAPH * G.TILE - G.H;
    G.camera.x = Math.max(0, Math.min(maxX, Math.round(G.player.x - G.W / 2)));
    G.camera.y = Math.max(0, Math.min(maxY, Math.round(G.player.y - G.H / 2)));
  }

  G.state = 'playing';
  return G;
}

function applySave(G, s) {
  const w = G.world, p = G.player, e = G.enemy;
  if (!w || !p) return;

  // 玩家位置 / 体力 / 朝向 / 手电
  if (s.player) {
    if (typeof s.player.x === 'number' && isFinite(s.player.x)) p.x = s.player.x;
    if (typeof s.player.y === 'number' && isFinite(s.player.y)) p.y = s.player.y;
    if (typeof s.player.stamina === 'number') p.stamina = Math.max(0, Math.min(100, s.player.stamina));
    if (typeof s.player.dir === 'string') p.dir = s.player.dir;
  }
  G.flashlightOn = !!s.flashlightOn;

  // 剥皮人位置与状态（路径/守柜等瞬态重建）
  if (e && s.enemy) {
    if (typeof s.enemy.x === 'number' && isFinite(s.enemy.x)) e.x = s.enemy.x;
    if (typeof s.enemy.y === 'number' && isFinite(s.enemy.y)) e.y = s.enemy.y;
    if (ENEMY_STATES.has(s.enemy.state)) e.state = s.enemy.state;
    e.path = null; e.pathI = 0; e.repathT = 0;
    e.attackTarget = null; e.guardPos = null; e.searchSpot = null; e.retIdx = null;
    e.blocked = false; e.stuckT = 0; e.sawVisible = false;
  }

  // 大门钥匙数
  G.keysCollected = Math.max(0, Math.min(G.keysNeeded, s.keysCollected | 0));

  // 背包（resetInventory 已清空，直接填充当前背包数组）
  if (Array.isArray(s.inventory) && factories.inventory) {
    const inv = factories.inventory() || [];
    for (const it of s.inventory) {
      if (it && typeof it.id === 'string' && (it.n | 0) > 0 && inv.length < 4) {
        inv.push({ id: it.id, n: Math.min(99, it.n | 0) });
      }
    }
  }
  if (typeof s.selectedSlot === 'number') {
    G.selectedSlot = Math.max(0, Math.min(3, s.selectedSlot | 0));
  }

  // 已搜容器：恢复 searched 集合；已搜纸箱从世界中移除（与搜刮时行为一致）
  if (Array.isArray(s.searched)) {
    for (const id of s.searched) w.searched.add(id);
    for (const o of w.objects.slice()) {
      if (o.type === 'box' && w.searched.has(o.id)) w.removeObject(o);
    }
  }

  // 门的开闭/解锁状态（反馈2）：读档恢复；已解锁的 L 门在此转为普通门对象
  if (Array.isArray(s.doors)) {
    for (const d of s.doors) {
      if (!d) continue;
      const tx = d.tx | 0, ty = d.ty | 0;
      let o = (typeof w.objectAt === 'function') ? w.objectAt(tx, ty) : null;
      if (o && o.type === 'doorL' && d.unlocked) {   // 存档前已用房间钥匙解锁
        o.type = 'door';
        o.unlocked = true;
        if (typeof w.setTile === 'function') w.setTile(tx, ty, 10); // 10 = TILE.DOOR
      }
      if (o && o.type === 'door') {
        o.open = !!d.open;
        o.solid = !o.open;
        if (d.variant != null) o.variant = ((d.variant | 0) % 3 + 3) % 3; // 颜色变体恢复（反馈5）
      }
    }
  }

  // 木板障碍
  if (Array.isArray(s.barricades)) {
    for (const b of s.barricades) {
      if (!b) continue;
      const tx = b.tx | 0, ty = b.ty | 0;
      if (tx < 0 || ty < 0 || tx >= G.MAPW || ty >= G.MAPH) continue;
      if (w.solidTile(tx, ty)) continue;          // 不恢复进墙体/实体物
      if (w.barricadeAt(tx, ty)) continue;        // 不重叠
      w.barricades.push({
        tx, ty, x: tx * G.TILE + 8, y: ty * G.TILE + 8,
        hp: (b.hp == null ? 3 : Math.max(1, Math.min(3, b.hp | 0))),
      });
    }
  }

  // 统计
  if (s.stats) {
    G.stats.time = +s.stats.time || 0;
    G.stats.searches = s.stats.searches | 0;
    G.stats.chases = s.stats.chases | 0;
  }
}
