// js/world.js — 《珠海剥皮人》地图世界 + 交互（开发者B）
// 依赖：state.js（G/say/saveGame）、audio.js（Audio）、items.js（giveItem/inventory/ITEMS）
import { G, say, saveGame } from './state.js';
import { Audio } from './audio.js';
import { giveItem, inventory, ITEMS } from './items.js';

const TS = 16;            // 瓦片像素尺寸（= G.TILE）
export const MAPW = 60, MAPH = 40;

// ---------------------------------------------------------------------------
// 瓦片常量与字符映射（engine.js 渲染查询用）
// ---------------------------------------------------------------------------
export const TILE = {
  VOID:0, WALL:1, WIN_LIT:2, WIN_DARK:3, SHUTTER:4,
  ROAD:5, SIDEWALK:6, GRASS:7, BUSH:8, FLOOR:9,
  DOOR:10, DOOR_LOCKED:11,
  TRASH:12, BOX:13, CABINET:14, MANHOLE:15, PHONE:16, GATE:17,
};
// 地图字符 -> 瓦片 id。'@'/'E' 为出生点，落地为草地/路面。
export const TILE_CHARS = {
  ' ':TILE.VOID, '#':TILE.WALL, 'w':TILE.WIN_LIT, 'u':TILE.WIN_DARK, 'S':TILE.SHUTTER,
  '.':TILE.ROAD, ',':TILE.SIDEWALK, 'g':TILE.GRASS, 'B':TILE.BUSH, 'f':TILE.FLOOR,
  'D':TILE.DOOR, 'L':TILE.DOOR_LOCKED,
  'T':TILE.TRASH, 'X':TILE.BOX, 'C':TILE.CABINET, 'M':TILE.MANHOLE, 'P':TILE.PHONE,
  'G':TILE.GATE, 'E':TILE.ROAD, '@':TILE.GRASS,
};

// ---------------------------------------------------------------------------
// §5.1 地图：60列 × 40行。两条横向主路(y12-13 / y25-26) + 纵向巷弄(x20-21,x42-43)。
// 5 栋可进入居民楼(A/B/C/D/E，各 2 房间；B 为 L 上锁楼)，东侧主路尽头大门 G。
// ---------------------------------------------------------------------------
export const MAP = [
  '############################################################',
  '#g#Cffffff#ffffXf#gg..gg#Cfffffffffffff#gg..gg############g#',
  '#g#fffffff#ffffff#gg..gg#ffffffffffffff#gg..gg############g#',
  '#gufffffff#ffffff#gg..gg#ffffffffffffffugB..gg############g#',
  '#g#fffffff#ffffff#gg..gg#ffffffffffffff#gg..gg############g#',
  '#g#fffffffDffffff#gB..gg#######D########gg..gg############g#',
  '#g#fffffff#ffffff#gg..gg#fXffffffffffffugg..gg############g#',
  '#gwfffffff#ffffff#gg..gg#ffffffffffffff#gg..gg############g#',
  '#g#fffffff#ffffff#gg..Bg#ffffffffffffXf#gg..gg############g#',
  '#g#fffffff#fffffC#gg..gg#fffffffffffffC#gg..Bg############g#',
  '#g##w#D#u####w#u##gg..gg##w###L##u##w###gg..gg#u#SSSS###w#g#',
  '#,,T,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,..,T,,,,,,,,,,,,,#',
  '#.........M.............................................E..#',
  '#.................................................M........#',
  '#P,,,,,,,,,,,,,,,,,,..,,,T,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,#',
  '#g##w#D##u###w####gg..gg##w###D##u###w##gg..ggggggggggggggg#',
  '#g#Cffffff#ffffXf#gg..gg#ffffff#fffffXf#gg..gggggggggggTggg#',
  '#g#fffffff#ffffff#gg..gg#fXffff#fffffff#gg..ggggggggggggggg#',
  '#g#fffffff#ffffff#gg..gg#ffffff#fffffff#gg..gggBggggggggggg#',
  '#g#fffffffDffffff#gg..gg#ffffffDfffffff#gg..ggggggggggggggg#',
  '#g#fffffff#ffffff#ggM.gg#ffffff#fffffff#gg..ggggggXgggggggg#',
  '#g#fffffff#ffffff#gg..gg#ffffff#fffffff#gg..gggggggggggggBg#',
  '#g#fffffff#fffffC#gg..gg#Cfffff#fffffff#gg..ggggggggggggggg#',
  '#g#SS#u####w######gg..gg###u#######w####gg..ggggggggggggggg#',
  '#,,,,,,,,,,,,,,,,,T,..,,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,T,,#',
  '#..........................................................G',
  '#.............................M............................#',
  '#,,,,,,,,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,T,..,,,,,,,,,,,,,,,#',
  '#ggggggggggggggggggg..gg##w####D#u###w##gg..gg,,,,,,,,,,,,g#',
  '#gggBggggggggggggggg..gg#ffffffffffffXf#gg..gg,,,,,,,P,,,,g#',
  '#ggggXgggBgggggggggg..Bg#ffffffffffffff#gg..gg,,,,,,,,,,,,g#',
  '#ggggggggggggggggggg..gg#ffffffffffffff#gg..gg,,,,M,,,,,,,g#',
  '#ggggggggggggggggggg..gg#######D########gg..gg,,,,,,,,,,,,g#',
  '#gggggggggggXggggggg..gg#ffffffffffffff#gB..gg,,,,,,,,,,X,g#',
  '#gggggggggggggBggggg..gg#ffffffffffffff#gg..gg,,,,,,,,,,,,g#',
  '#gggggggTggggggggggg..gg#Cfffffffffffff#gg..gg,,T,,,,,,,,,g#',
  '#ggggggggggggggggggg..gg####u#####w#####gg..gg,,,,,,,,,,,,g#',
  '#g@ggggggggggggggggg..gggggggggggggggggggg..ggggggBgggBggBg#',
  '#gggggggggggggggggggggggggggggggggggggggggggggggggggggggggg#',
  '                                                            ',
];

// 路灯（对象放置，图例中 'S' 是卷闸门）：南北两条主路两侧人行道
// 注意：路灯/物件不得放在任何门（D/L）的门前格上（反馈3）。
const LAMP_TILES = [[8,11],[24,14],[36,11],[50,14],[10,24],[28,27],[38,24],[55,27]];
// 装饰物（街景：小卖部招牌/宣传栏/电线杆/自行车棚/烟酒店/遮雨棚/栅栏门/广告牌）
// 注意：实体装饰不得放在任何门（D/L）的门前格上；栅栏门只半掩冗余通道，不堵必需通路。
const DECOR_OBJECTS = [
  { type:'shop',  tx:50, ty:10, solid:false, decor:true },  // 小卖部招牌(32x16, 画在卷闸门上)
  { type:'board', tx:44, ty:14, solid:true  },              // 宣传栏
  { type:'pole',  tx:18, ty:11, solid:true  },              // 电线杆
  { type:'pole',  tx:41, ty:24, solid:true  },
  { type:'bike',  tx:48, ty:18, solid:false },              // 自行车棚
  { type:'bike',  tx:50, ty:18, solid:false },
  { type:'bike',  tx:52, ty:18, solid:false },
  // 反馈6 新增街景装饰：
  { type:'shop2', tx:3,  ty:23, solid:false, decor:true },  // 烟酒店招牌(C栋南墙卷闸门上方)
  { type:'awning', tx:2, ty:8,  solid:false, decor:true },  // 遮雨棚：亮窗(2,7)正下方墙面
  { type:'awning', tx:26, ty:10, solid:false, decor:true }, // 遮雨棚：亮窗(26,10)窗下沿
  { type:'awning', tx:11, ty:23, solid:false, decor:true }, // 遮雨棚：亮窗(11,23)窗下沿
  { type:'fencegate', tx:20, ty:12, solid:true },           // 巷弄(x20-21)半掩栅栏门，x21 可通行
  { type:'fencegate', tx:43, ty:13, solid:true },           // 巷弄(x42-43)半掩栅栏门，x42 可通行
  { type:'billboard', tx:10, ty:10, solid:false, decor:true }, // 喷绘广告牌(A栋南墙)
  { type:'billboard', tx:8,  ty:23, solid:false, decor:true }, // 喷绘广告牌(C栋南墙)
  { type:'billboard', tx:28, ty:28, solid:false, decor:true }, // 喷绘广告牌(E栋北墙)
];
// 房间列表（居民楼室内，瓦片矩形）
const ROOMS = [
  { x:3,  y:1,  w:7,  h:9 }, { x:11, y:1,  w:6,  h:9 },   // A 栋(西北)
  { x:25, y:1,  w:14, h:4 }, { x:25, y:6,  w:14, h:4 },   // B 栋(东北, 上锁)
  { x:3,  y:16, w:7,  h:7 }, { x:11, y:16, w:6,  h:7 },   // C 栋(中西)
  { x:25, y:16, w:6,  h:7 }, { x:32, y:16, w:7,  h:7 },   // D 栋(中东)
  { x:25, y:29, w:14, h:3 }, { x:25, y:33, w:14, h:3 },   // E 栋(南)
];
// 上锁楼(B栋)室内范围：3 把大门钥匙不会投进这些容器，保证可通关
const LOCKED_RECTS = [{ x:25, y:1, w:14, h:9 }];

// 坐标哈希（确定性）：墙面广告变体 / 门颜色变体共用（反馈5/6）
function coordHash(tx, ty) {
  let h = (Math.imul(tx, 374761393) + Math.imul(ty, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const OBJ_CHARS = { T:'trash', X:'box', C:'cabinet', M:'manhole', P:'phone', G:'gate' };
const SOLID_TILES = new Set([TILE.VOID, TILE.WALL, TILE.WIN_LIT, TILE.WIN_DARK, TILE.SHUTTER, TILE.DOOR_LOCKED]);
const SIGHT_OBJ_TYPES = new Set(['cabinet', 'phone', 'gate']);   // 挡视线的高物件
const INTERACT_TYPES = new Set(['trash', 'box', 'cabinet', 'manhole', 'phone', 'gate', 'doorL', 'door']);
const DIRV = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };

// 由邻近地图字符推断物件脚下的地面瓦片
function groundUnder(getCh, tx, ty) {
  let best = TILE.ROAD, score = -1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const ch = getCh(tx + dx, ty + dy);
    let id = 0, s = 0;
    if (ch === 'f') { id = TILE.FLOOR; s = 5; }
    else if (ch === ',') { id = TILE.SIDEWALK; s = 4; }
    else if (ch === '.' || ch === 'M' || ch === 'E') { id = TILE.ROAD; s = 3; }
    else if (ch === 'g' || ch === 'B' || ch === '@') { id = TILE.GRASS; s = 2; }
    if (s > score) { score = s; best = id; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// §5.2 buildWorld：解析 MAP，返回 world 对象
// ---------------------------------------------------------------------------
export function buildWorld(G) {
  const tiles = new Uint8Array(MAPW * MAPH);
  const grid = new Array(MAPW * MAPH).fill(null);   // 瓦片 -> 物件（含非实体，供交互/放置查询）
  const objects = [], lamps = [], windows = [], manholes = [], bushes = [];
  let playerSpawn = null, enemySpawn = null, gateObj = null;

  const getCh = (tx, ty) => (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) ? ' ' : MAP[ty][tx];

  for (let ty = 0; ty < MAPH; ty++) {
    for (let tx = 0; tx < MAPW; tx++) {
      const ch = MAP[ty][tx], idx = ty * MAPW + tx;
      const px = tx * TS + 8, py = ty * TS + 8;
      if (ch === '@') { tiles[idx] = TILE.GRASS; playerSpawn = { x: px, y: py, tx, ty }; continue; }
      if (ch === 'E') { tiles[idx] = TILE.ROAD;  enemySpawn  = { x: px, y: py, tx, ty }; continue; }
      if (OBJ_CHARS[ch]) {
        tiles[idx] = groundUnder(getCh, tx, ty);
        const o = {
          id: OBJ_CHARS[ch] + '_' + tx + '_' + ty, type: OBJ_CHARS[ch],
          tx, ty, x: px, y: py, solid: ch !== 'M',
        };
        objects.push(o); grid[idx] = o;
        if (o.type === 'manhole') manholes.push(o);
        if (o.type === 'gate') gateObj = o;
        continue;
      }
      tiles[idx] = TILE_CHARS[ch] !== undefined ? TILE_CHARS[ch] : TILE.VOID;
      if (ch === 'w') {
        windows.push({ x: px, y: py, tx, ty });
        objects.push({ id: 'window_' + tx + '_' + ty, type: 'window', tx, ty, x: px, y: py, solid: false, decor: true });
      } else if (ch === 'B') {
        bushes.push({ x: px, y: py, tx, ty });
      } else if (ch === 'D') {
        // 门对象（反馈2）：可 E 开关。邻格含室外地面（人行道/马路/草地）视为
        // 楼栋入户门 → 初始关闭（夜里楼道门关着，也便于展示关门机制）；
        // 否则为室内房门 → 初始敞开。关门时 solid 挡人、挡视线。
        let entrance = false;
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = getCh(tx + d[0], ty + d[1]);
          if (nc === ',' || nc === '.' || nc === 'g' || nc === 'B') { entrance = true; break; }
        }
        const o = {
          id: 'door_' + tx + '_' + ty, type: 'door', tx, ty, x: px, y: py,
          open: !entrance, solid: entrance,   // open=false → solid=true
          variant: coordHash(tx, ty) % 3,     // 门颜色变体 0/1/2（确定性，反馈5）
        };
        objects.push(o); grid[idx] = o;
      } else if (ch === 'L') {
        const o = {
          id: 'doorL_' + tx + '_' + ty, type: 'doorL', tx, ty, x: px, y: py, solid: true,
          variant: coordHash(tx, ty) % 3,     // 解锁转普通门后沿用该变体
        };
        objects.push(o); grid[idx] = o;
      }
    }
  }

  // 外墙小广告变体（反馈6）：确定性坐标哈希分配——仅"临街外墙"
  // （4 邻接室外地面：路/人行道/草/灌木）参与分配，约 70% 普通白瓷砖、
  // 30% 三种广告变体（各约 10%）；内隔墙一律普通白瓷砖。engine 渲染时读取。
  const wallVar = new Uint8Array(MAPW * MAPH);
  {
    const OUTDOOR = new Set([TILE.ROAD, TILE.SIDEWALK, TILE.GRASS, TILE.BUSH]);
    for (let ty = 0; ty < MAPH; ty++) {
      for (let tx = 0; tx < MAPW; tx++) {
        const idx = ty * MAPW + tx;
        if (tiles[idx] !== TILE.WALL) continue;
        let street = false;
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + d[0], ny = ty + d[1];
          if (nx < 0 || ny < 0 || nx >= MAPW || ny >= MAPH) continue;
          if (OUTDOOR.has(tiles[ny * MAPW + nx])) { street = true; break; }
        }
        if (!street) continue;                      // 内墙 → 0 普通
        const h = coordHash(tx, ty);
        wallVar[idx] = (h % 100 < 70) ? 0 : (1 + ((h >>> 8) % 3));
      }
    }
  }

  // 路灯对象（≥6）
  for (const [tx, ty] of LAMP_TILES) {
    const o = {
      id: 'lamp_' + tx + '_' + ty, type: 'lamp', tx, ty,
      x: tx * TS + 8, y: ty * TS + 8, solid: true,
      phase: Math.random() * Math.PI * 2, flicker: 0,
    };
    objects.push(o); grid[ty * MAPW + tx] = o;
    lamps.push({ x: o.x, y: o.y - 6, tx, ty });   // 光心在灯头位置
  }
  // 装饰物
  for (const d of DECOR_OBJECTS) {
    const o = { id: d.type + '_' + d.tx + '_' + d.ty, x: d.tx * TS + 8, y: d.ty * TS + 8, ...d };
    objects.push(o);
    if (!d.decor) grid[d.ty * MAPW + d.tx] = o;
  }

  const world = {
    w: MAPW, h: MAPH, tiles,
    objects, lamps, windows, manholes, bushes,
    rooms: ROOMS.map(r => ({ ...r })),
    playerSpawn, enemySpawn,
    gate: gateObj ? { x: gateObj.x, y: gateObj.y, tx: gateObj.tx, ty: gateObj.ty } : null,
    searched: new Set(),
    barricades: [],            // [{tx,ty,x,y,hp:3}] 木板障碍
    noises: [],                // [{x,y,r,t}] 噪音（enemy.js 查询，updateWorld 衰减）
    crackers: [],              // [{x,y,tx,ty,state,t}] 鞭炮（items.js 投掷，updateWorld 驱动）
    flash: 0,                  // 画面闪烁（井盖传送/鞭炮爆响），engine 渲染用
    animTime: 0,
    roomkeysSpawned: 0,        // 房间钥匙已产出数（上限 2）
    wallVar,                   // 外墙广告变体：0 普通 / 1-3 小广告（确定性哈希，反馈6）

    tileAt(tx, ty) {
      return (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) ? TILE.VOID : tiles[ty * MAPW + tx];
    },
    // 外墙变体查询（engine.js 渲染用）：0=t_wall，1-3=t_wallAd1..3
    wallVariantAt(tx, ty) {
      return (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) ? 0 : wallVar[ty * MAPW + tx];
    },
    setTile(tx, ty, id) {
      if (tx >= 0 && ty >= 0 && tx < MAPW && ty < MAPH) tiles[ty * MAPW + tx] = id;
    },
    objectAt(tx, ty) {
      return (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) ? null : grid[ty * MAPW + tx];
    },
    // 门对象查询（关门时 o.open=false、o.solid=true）
    doorAt(tx, ty) {
      const o = world.objectAt(tx, ty);
      return (o && o.type === 'door') ? o : null;
    },
    removeObject(o) {
      const i = world.objects.indexOf(o);
      if (i >= 0) world.objects.splice(i, 1);
      if (grid[o.ty * MAPW + o.tx] === o) grid[o.ty * MAPW + o.tx] = null;
    },
    barricadeAt(tx, ty) {
      for (const b of world.barricades) if (b.tx === tx && b.ty === ty) return b;
      return null;
    },
    // 瓦片碰撞（含实体物件与木板障碍）
    solidTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return true;
      const idx = ty * MAPW + tx;
      if (SOLID_TILES.has(tiles[idx])) return true;
      const o = grid[idx];
      if (o && o.solid !== false) return true;
      return !!world.barricadeAt(tx, ty);
    },
    // 像素坐标碰撞查询（契约要求）
    solid(x, y) {
      return world.solidTile(Math.floor(x / TS), Math.floor(y / TS));
    },
    // 视线遮挡：墙体/卷闸/虚空/上锁门(L)/关着的门/高物件挡视线；灌木在玩家藏入时遮挡
    losBlocked(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
      const p = G && G.player;
      for (let i = 1; i < steps; i++) {
        const tx = Math.floor((x0 + dx * i / steps) / TS);
        const ty = Math.floor((y0 + dy * i / steps) / TS);
        if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return true;
        const idx = ty * MAPW + tx;
        const t = tiles[idx];
        if (SOLID_TILES.has(t)) return true;
        const o = grid[idx];
        if (o && o.type === 'door' && !o.open) return true;   // 关门挡视线
        if (o && SIGHT_OBJ_TYPES.has(o.type)) return true;
        if (t === TILE.BUSH && p && p.hidden && p.hiding &&
            p.hiding.type === 'bush' && p.hiding.tx === tx && p.hiding.ty === ty) return true;
      }
      return false;
    },
  };

  // 战利品：3 把大门钥匙固定投放于随机垃圾桶/纸箱（避开上锁楼 B，保证可通关）
  const containers = world.objects.filter(o =>
    (o.type === 'trash' || o.type === 'box') &&
    !LOCKED_RECTS.some(r => o.tx >= r.x && o.tx < r.x + r.w && o.ty >= r.y && o.ty < r.y + r.h));
  for (let i = containers.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [containers[i], containers[j]] = [containers[j], containers[i]];
  }
  for (let i = 0; i < Math.min(G.keysNeeded || 3, containers.length); i++) containers[i].preLoot = 'key';

  return world;
}

// ---------------------------------------------------------------------------
// §5.2 战利品表：木板30% 包子25% 汽水20% 鞭炮15% 房间钥匙10%(最多2把)
// ---------------------------------------------------------------------------
const LOOT_TABLE = [['plank', 0.30], ['food', 0.25], ['drink', 0.20], ['cracker', 0.15], ['roomkey', 0.10]];
function rollLoot(G, o) {
  if (o.preLoot) return o.preLoot;
  const r = Math.random();
  let acc = 0, id = 'plank';
  for (const [lid, p] of LOOT_TABLE) { acc += p; if (r < acc) { id = lid; break; } }
  if (id === 'roomkey') {
    if (G.world.roomkeysSpawned >= 2) id = 'plank';
    else G.world.roomkeysSpawned++;
  }
  return id;
}

// ---------------------------------------------------------------------------
// §5.2 tryInteract：E 键全部交互
// ---------------------------------------------------------------------------
function interactWith(G, o) {
  const w = G.world, p = G.player;
  switch (o.type) {
    case 'trash':
    case 'box': {
      if (w.searched.has(o.id)) {
        say(G, o.type === 'trash' ? '这个垃圾桶已经搜过了。' : '纸箱里什么都没有了。');
        return;
      }
      Audio.sfx('search');
      noiseAt(G, p.x, p.y, 50);                       // 搜刮噪音 r=50
      const id = rollLoot(G, o);
      if (id === 'key') {
        w.searched.add(o.id);
        G.keysCollected++;
        if (G.stats) G.stats.searches++;              // 胜利画面统计
        Audio.sfx('pickup');
        say(G, `找到了大门钥匙！（${G.keysCollected}/${G.keysNeeded}）`);
        if (o.type === 'box') w.removeObject(o);      // 纸箱搜完消失
      } else if (giveItem(G, id, 1)) {
        w.searched.add(o.id);
        if (G.stats) G.stats.searches++;
        say(G, `找到了${ITEMS[id].name}。`);
        if (o.type === 'box') w.removeObject(o);
      }
      // 背包满：giveItem 已提示，容器保持未搜
      return;
    }
    case 'cabinet': {
      p.hidden = true;
      p.hiding = { type: 'cabinet', tx: o.tx, ty: o.ty };
      Audio.sfx('hide');
      noiseAt(G, p.x, p.y, 50);                       // 开柜噪音 r=50
      say(G, '你躲进了木柜。再按 E 出来。');
      return;
    }
    case 'manhole': {
      const others = w.manholes.filter(m => m !== o);
      if (!others.length) { say(G, '井盖纹丝不动。'); return; }
      const dst = others[(Math.random() * others.length) | 0];
      Audio.sfx('teleport');
      w.flash = 1;                                    // 画面闪烁
      p.x = dst.x; p.y = dst.y;
      noiseAt(G, dst.x, dst.y, 120);                  // 爬出产生噪音
      say(G, '你从另一个井盖爬了出来……');
      return;
    }
    case 'phone': {
      Audio.sfx('save');
      saveGame(G);
      say(G, '已存档。');
      return;
    }
    case 'gate': {
      if (G.keysCollected >= G.keysNeeded) {
        Audio.sfx('win');
        G.state = 'win';
      } else {
        say(G, `大铁门纹丝不动……还差 ${G.keysNeeded - G.keysCollected} 把大门钥匙。`);
      }
      return;
    }
    case 'doorL': {
      const inv = inventory();
      const i = inv.findIndex(s => s.id === 'roomkey' && s.n > 0);
      if (i < 0) { say(G, '门锁住了，需要一把房间钥匙。'); return; }
      inv[i].n--;
      if (inv[i].n <= 0) inv.splice(i, 1);
      // 解锁后变成可开关的门对象（初始关着，再按 E 开门）
      w.setTile(o.tx, o.ty, TILE.DOOR);
      o.type = 'door';
      o.open = false;
      o.solid = true;
      o.unlocked = true;
      Audio.sfx('door');
      say(G, '用房间钥匙开了锁。再按 E 开门。');
      return;
    }
    case 'door': {
      // 关门时门口不能站人（玩家或剥皮人），否则会把人卡进门里
      if (o.open) {
        const e = G.enemy;
        const onDoor = (ent) => ent && Math.floor(ent.x / TS) === o.tx && Math.floor(ent.y / TS) === o.ty;
        if (onDoor(p) || onDoor(e)) { say(G, '门口有人，关不上门。'); return; }
      }
      o.open = !o.open;
      o.solid = !o.open;
      Audio.sfx('door');
      if (!o.open) noiseAt(G, o.x, o.y, 60);        // 关门产生小噪音
      say(G, o.open ? '你推开了门。' : '你关上了门。');
      return;
    }
  }
}

export function tryInteract(G) {
  const w = G.world, p = G.player;
  if (!w || !p) return;

  // 已躲藏：再按 E 出来
  if (p.hidden) {
    const was = p.hiding;
    p.hidden = false; p.hiding = null;
    Audio.sfx('hide');
    noiseAt(G, p.x, p.y, 35);
    say(G, was && was.type === 'cabinet' ? '你从木柜里钻了出来。' : '你从灌木丛里钻了出来。');
    return;
  }

  const d = DIRV[p.dir] || DIRV.down;
  const ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);

  // 拆除面前的木板障碍并回收
  const b = w.barricadeAt(ptx + d[0], pty + d[1]);
  if (b) {
    w.barricades.splice(w.barricades.indexOf(b), 1);
    giveItem(G, 'plank', 1);
    Audio.sfx('plank');
    say(G, '拆下了木板。');
    return;
  }

  // 最近的 E 键可交互物（24px 内）
  let best = null, bd = 24;
  for (const o of w.objects) {
    if (!INTERACT_TYPES.has(o.type)) continue;
    const dist = Math.hypot(o.x - p.x, o.y - p.y);
    if (dist < bd) { bd = dist; best = o; }
  }

  // 站在灌木丛上且手边没有更急的交互 → 躲进灌木
  const onBush = w.tileAt(ptx, pty) === TILE.BUSH;
  if (best && bd <= 14) { interactWith(G, best); return; }
  if (onBush) {
    p.hidden = true;
    p.hiding = { type: 'bush', tx: ptx, ty: pty };
    Audio.sfx('hide');
    say(G, '你蹲进了灌木丛。再按 E 出来。');
    return;
  }
  if (best) interactWith(G, best);
}

// ---------------------------------------------------------------------------
// §5.2 noiseAt：制造噪音，写入 world.noises（enemy.js 查询）
// ---------------------------------------------------------------------------
export function noiseAt(G, x, y, r) {
  const w = G.world;
  if (!w) return;
  w.noises.push({ x, y, r, t: 1 });
  if (w.noises.length > 32) w.noises.shift();
}

// ---------------------------------------------------------------------------
// updateWorld：每帧世界更新——噪音衰减 / 画面闪烁 / 鞭炮飞行与爆响 / 路灯闪烁
// （main.js 主循环在 playing 状态调用）
// ---------------------------------------------------------------------------
export function updateWorld(G, dt) {
  const w = G.world;
  if (!w) return;
  w.animTime += dt;
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.5);

  // 噪音衰减（约 0.7s 寿命）
  for (let i = w.noises.length - 1; i >= 0; i--) {
    const n = w.noises[i];
    n.t -= dt * 1.5;
    if (n.t <= 0) w.noises.splice(i, 1);
  }

  // 鞭炮：飞向落点 → 落地 0.5s → 爆响（噪音半径 160）
  for (let i = w.crackers.length - 1; i >= 0; i--) {
    const c = w.crackers[i];
    if (c.state === 'fly') {
      const dx = c.tx - c.x, dy = c.ty - c.y;
      const dist = Math.hypot(dx, dy), step = 150 * dt;
      if (dist <= step) { c.x = c.tx; c.y = c.ty; c.state = 'fuse'; c.t = 0.5; }
      else { c.x += dx / dist * step; c.y += dy / dist * step; }
    } else {
      c.t -= dt;
      if (c.t <= 0) {
        Audio.sfx('cracker');
        noiseAt(G, c.x, c.y, 160);
        w.flash = Math.max(w.flash, 0.4);
        w.crackers.splice(i, 1);
      }
    }
  }

  // 场景动画：钠灯偶发闪烁（engine 可用 lamp.flicker 调光）
  for (const o of w.objects) {
    if (o.type === 'lamp') o.flicker = Math.sin(w.animTime * 7 + o.phase) > 0.965 ? 0.4 : 0;
  }
}
