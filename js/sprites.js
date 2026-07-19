// ============================================================================
// js/sprites.js — 《珠海剥皮人》程序化像素贴图（开发者A）
// 契约 §4：export const SPR = {}（名字 -> HTMLCanvasElement）
//          export function buildSprites()  填充 SPR，幂等
// 全部贴图用 Canvas 逐像素/小矩形程序化绘制：噪点抖动、1-2px 顶面高光与
// 底部投影、物件底部椭圆阴影。调色板与风格遵循 §1。
// ============================================================================

export const SPR = {};
let _built = false;

/* ---------- 确定性伪随机（mulberry32）：多次构建视觉一致 ---------- */
let _seed = 19901107;
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick(a) { return a[(rnd() * a.length) | 0]; }

/* ---------- 基础绘制辅助 ---------- */
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctxOf(c) { const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return g; }
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
function rr(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h, c); }
function circle(g, cx, cy, r, c) { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill(); }
function line(g, x0, y0, x1, y1, c) {           // 1px Bresenham
  g.fillStyle = c;
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/* 噪点抖动：区域内以 ch 概率覆盖随机色（支持 rgba 微粒） */
function dither(g, x, y, w, h, cols, ch) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
    if (rnd() < ch) px(g, i, j, pick(cols));
}
/* 只在已绘制像素上抖动（不污染透明背景） */
function ditherAtop(g, x, y, w, h, cols, ch) {
  g.globalCompositeOperation = 'source-atop';
  dither(g, x, y, w, h, cols, ch);
  g.globalCompositeOperation = 'source-over';
}
/* 复古颗粒罩层 */
function grain(g, w, h, ch = 0.09) {
  ditherAtop(g, 0, 0, w, h, ['rgba(0,0,0,0.10)', 'rgba(255,255,255,0.06)'], ch);
}
/* 物件底部椭圆投影 */
function shadow(g, cx, cy, rx, ry, a = 0.35) {
  g.fillStyle = 'rgba(0,0,0,' + a + ')';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); g.fill();
}
function flipH(src) {
  const c = cv(src.width, src.height), g = ctxOf(c);
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}

/* ---------- §1 调色板 ---------- */
const P = {
  night0: '#0a0c14', night1: '#12141f',
  asphalt: '#1d2026', sidewalk: '#2a2d33', curb: '#3a3d42',
  wall: '#4a4640', wallSh: '#33312c', shutter: '#3f4a4a',
  lamp: '#e8a44a', win: '#d8c47a',
  bush0: '#1f3a24', bush1: '#2a4d2f', trash: '#2e4a3a', wood: '#5a4232',
  phone: '#7a2a26', manhole: '#3a3f45', gate: '#4a4f55',
  shirt: '#c8c8b8', pants: '#3a4a6a', apron: '#6a1f1f', skin: '#c8956a',
  blood: '#8a1a1a', ui: '#d8d0b8', accent: '#e8a44a',
};

/* ================= 瓦片（16×16） ================= */
const MOSAIC = ['#4a4640', '#4e4a42', '#46423b', '#514c43', '#423e38'];
/* 老式小区外墙：白色竖排长条形瓷砖（3px 竖砖 + 1px 黑勾缝，错缝排列），
   带轻微脏渍雨痕噪点。相邻瓦片图案连续（行固定在 y=0/8，列每 4px）。 */
const WTILE = ['#d8d5cb', '#cfccc1', '#e0ddd3', '#d2cfc5', '#c9c6bc'];
function whiteTiles(g, x, y, w, h) {
  rr(g, x, y, w, h, '#1c1a16');                          // 黑色勾缝底
  for (let ry = y; ry < y + h; ry += 8) {                // 每 8px 一排（7px 砖 + 1px 横缝）
    const off = (((ry - y) / 8) | 0) % 2 ? 2 : 0;        // 奇偶排错缝
    for (let cx = x - 4 + off; cx < x + w; cx += 4) {    // 3px 竖砖 + 1px 竖缝
      const bx = Math.max(cx, x), bw = Math.min(cx + 3, x + w) - bx;
      const by = ry, bh = Math.min(7, y + h - ry);
      if (bw <= 0 || bh <= 0) continue;
      g.fillStyle = pick(WTILE);
      g.fillRect(bx, by, bw, bh);
      rr(g, bx, by, bw, 1, 'rgba(255,255,255,0.10)');    // 砖面顶光
      rr(g, bx + bw - 1, by, 1, bh, 'rgba(0,0,0,0.10)'); // 砖右暗棱
    }
  }
  // 脏渍雨痕（竖向水渍）
  for (let i = 0; i < w; i += 5) {
    if (rnd() < 0.6) {
      const sx0 = x + i + ((rnd() * 3) | 0);
      const len = 3 + ((rnd() * Math.max(2, h - 4)) | 0);
      const sy0 = y + ((rnd() * Math.max(1, h - len)) | 0);
      for (let j = 0; j < len; j++) px(g, sx0, sy0 + j, 'rgba(70,64,52,0.16)');
    }
  }
  dither(g, x, y, w, h, ['rgba(58,52,42,0.18)', 'rgba(255,255,255,0.05)'], 0.08);
}
/* 墙面顶光/底影（白瓷砖风格） */
function wallEdge(g) {
  rr(g, 0, 0, 16, 1, 'rgba(240,238,228,0.55)');   // 顶光
  rr(g, 0, 14, 16, 2, 'rgba(22,20,16,0.55)');     // 底影
}
/* 牛皮癣小广告纸条：米白/泛黄纸 + 红/黑像素字块（暗示办证/通下水道/搬家）+
   图钉/浆糊渍。cx,cy 为中心，deg 为歪斜角度。 */
function adPaper(g, cx, cy, w, h, deg, opt) {
  opt = opt || {};
  g.save();
  g.translate(cx, cy);
  g.rotate(deg * Math.PI / 180);
  const x = -w >> 1, y = -h >> 1;
  rr(g, x, y, w, h, opt.paper || '#d8cfae');              // 纸面（默认泛黄）
  rr(g, x, y, w, 1, 'rgba(255,255,255,0.30)');            // 纸顶光
  rr(g, x, y + h - 1, w, 1, 'rgba(0,0,0,0.25)');          // 纸底影
  const ink = opt.ink || '#8a1a1a';                       // 字块（默认红）
  rr(g, x + 1, y + 1, w - 2, 1, ink);                     // 标题行（办证/搬家等大字）
  for (let j = y + 3; j < y + h - 1; j += 2)              // 正文像素字块行
    for (let i = x + 1; i < x + w - 1; i += 2)
      if (rnd() < 0.75) px(g, i, j, ink);
  if (rnd() < 0.8) rr(g, x + 1, y + h - 2, 2, 1, ink);    // 联系电话残行
  if (opt.pin) {                                          // 图钉（顶部中央红点）
    px(g, 0, y, '#c8c8c0'); px(g, 0, y + 1, '#7a2626');
  } else {                                                // 浆糊渍（四角白渍）
    px(g, x, y, 'rgba(232,226,200,0.55)'); px(g, x + w - 1, y, 'rgba(232,226,200,0.45)');
    px(g, x, y + h - 1, 'rgba(232,226,200,0.4)');
  }
  ditherAtop(g, x, y, w, h, ['rgba(90,80,60,0.25)', 'rgba(255,255,255,0.10)'], 0.12);
  g.restore();
  // 纸落影（不随纸旋转，贴在墙上）
  rr(g, cx - (w >> 1), cy + (h >> 1), w, 1, 'rgba(0,0,0,0.30)');
}
/* 老楼马赛克瓷砖外墙：2×2 小砖 + 砖缝 + 雨渍 */
function mosaic(g, x, y, w, h) {
  for (let j = y; j < y + h; j += 2)
    for (let i = x; i < x + w; i += 2) {
      g.fillStyle = pick(MOSAIC);
      g.fillRect(i, j, Math.min(2, x + w - i), Math.min(2, y + h - j));
    }
  g.fillStyle = 'rgba(28,26,22,0.55)';
  for (let i = x + 3; i < x + w; i += 4) g.fillRect(i, y, 1, h);
  for (let j = y + 3; j < y + h; j += 4) g.fillRect(x, j, w, 1);
  dither(g, x, y, w, h, ['#33312c', '#3a372f'], 0.05);
}
function asphaltBase(g) {
  rr(g, 0, 0, 16, 16, P.asphalt);
  dither(g, 0, 0, 16, 16, ['#23262c', '#181b20', '#20242a', '#15181d', '#262a30'], 0.32);
  rr(g, 0, 0, 16, 1, 'rgba(255,255,255,0.03)');   // 顶面微光
  rr(g, 0, 15, 16, 1, 'rgba(0,0,0,0.18)');        // 底部微影
}
/* 墙面窗（lit=亮窗 / 暗窗），带窗框与十字窗棂 */
function drawWindow(g, lit) {
  rr(g, 3, 3, 10, 9, '#241f1a');                          // 窗洞
  if (lit) {
    rr(g, 4, 4, 8, 7, P.win);
    rr(g, 4, 4, 4, 3, '#e8d892');                         // 暖黄亮芯
    rr(g, 9, 8, 3, 3, '#b09c58');                         // 右下衰光
    px(g, 3, 2, 'rgba(216,196,122,0.35)'); px(g, 12, 2, 'rgba(216,196,122,0.35)');
    px(g, 2, 3, 'rgba(216,196,122,0.3)'); px(g, 13, 3, 'rgba(216,196,122,0.3)');  // 渗光
    rr(g, 4, 11, 8, 1, '#8a7a46');
  } else {
    rr(g, 4, 4, 8, 7, '#181c26');
    line(g, 5, 9, 9, 5, '#232a38');                       // 玻璃微反光
    px(g, 10, 5, '#2c3444'); px(g, 6, 8, '#1e2432');
  }
  rr(g, 7, 4, 1, 7, lit ? '#6a5c34' : '#10141c');         // 竖棂
  rr(g, 4, 7, 8, 1, lit ? '#6a5c34' : '#10141c');         // 横棂
  rr(g, 3, 12, 10, 1, '#1c1813');                         // 窗台阴影
  rr(g, 3, 3, 10, 1, '#3a352c');                          // 窗楣高光
}
/* 门配色方案（反馈5：3 种颜色变体，结构一致只换配色/小细节） */
const DOOR_STYLES = [
  { // 0 棕木色（原有配色）
    wall: '#2e2b25', wallNoise: ['#29261f', '#332f27'],
    frame: '#3a2c1e', frameHi: '#4a3a28',
    panelA: '#5a4232', panelB: '#52402e',
    core: '#463422', coreHi: '#5f4634', rail: '#33251a',
    grain: ['#4a3626', '#644a38'], sill: '#1c1812', shadow: '#241d16',
  },
  { // 1 绿漆铁门（铆钉铁板）
    wall: '#272a26', wallNoise: ['#232620', '#2c302a'],
    frame: '#2c3a30', frameHi: '#3e5044',
    panelA: '#3e5a44', panelB: '#38523c',
    core: '#2e4634', coreHi: '#4a6c52', rail: '#24382a',
    grain: ['#33503c', '#4a6a52'], sill: '#161a16', shadow: '#1c241e',
    rivets: '#1c2a20',
  },
  { // 2 蓝漆门
    wall: '#262a30', wallNoise: ['#22262c', '#2b3038'],
    frame: '#2a3648', frameHi: '#3c4c64',
    panelA: '#3a4a6a', panelB: '#34445f',
    core: '#2c3a54', coreHi: '#485e82', rail: '#232c40',
    grain: ['#31415c', '#4a5f80'], sill: '#141820', shadow: '#1a2030',
  },
];
/* 门扇主体（v=配色变体；locked 时加挂锁+铁链） */
function drawDoor(g, locked, v) {
  const S = DOOR_STYLES[v | 0] || DOOR_STYLES[0];
  rr(g, 0, 0, 16, 16, S.wall);                            // 门洞周边墙体
  dither(g, 0, 0, 16, 16, S.wallNoise, 0.15);
  rr(g, 2, 0, 12, 15, S.frame);                           // 门框
  rr(g, 2, 0, 12, 1, S.frameHi);                          // 门框顶光
  for (let x = 3; x < 13; x += 2)                         // 门板竖拼
    rr(g, x, 1, 2, 13, (x % 4 === 3) ? S.panelA : S.panelB);
  for (const q of [[4, 3], [9, 3], [4, 9], [9, 9]]) {
    rr(g, q[0], q[1], 3, 4, S.core);                      // 门芯板
    rr(g, q[0], q[1], 3, 1, S.coreHi);                    // 芯板顶光
  }
  rr(g, 3, 7, 10, 1, S.rail);                             // 中横档
  dither(g, 3, 1, 10, 13, S.grain, 0.12);                 // 木纹噪
  if (S.rivets) {                                         // 铁门铆钉
    px(g, 3, 1, S.rivets); px(g, 12, 1, S.rivets);
    px(g, 3, 13, S.rivets); px(g, 12, 13, S.rivets);
    px(g, 7, 4, S.rivets); px(g, 8, 10, S.rivets);
  }
  px(g, 11, 7, '#c8b060'); px(g, 11, 8, '#8a7a3a');       // 黄铜把手
  rr(g, 0, 15, 16, 1, S.sill);                            // 门槛
  if (locked) {
    line(g, 4, 3, 11, 10, '#6a6a70');                     // 铁链
    line(g, 4, 10, 11, 3, '#5a5a60');
    rr(g, 6, 7, 4, 4, '#a88a38');                         // 挂锁
    rr(g, 6, 7, 4, 1, '#c8a848');
    px(g, 7, 6, '#8a8a8a'); px(g, 8, 5, '#8a8a8a'); px(g, 9, 6, '#8a8a8a');  // 锁梁
    px(g, 8, 9, '#2a2a2a');                               // 钥匙孔
  }
}
/* 关着的门（反馈2）：同风格门板 + 斜纹撑板，顶光底影噪点 */
function drawClosedDoor(g, v) {
  const S = DOOR_STYLES[v | 0] || DOOR_STYLES[0];
  rr(g, 0, 0, 16, 16, S.wall);                            // 门洞周边墙体
  dither(g, 0, 0, 16, 16, S.wallNoise, 0.15);
  rr(g, 2, 0, 12, 15, S.frame);                           // 门框
  rr(g, 2, 0, 12, 1, S.frameHi);                          // 门框顶光
  for (let x = 3; x < 13; x += 2)                         // 门板竖拼
    rr(g, x, 1, 2, 13, (x % 4 === 3) ? S.panelA : S.panelB);
  line(g, 3, 12, 12, 3, S.core);                          // 斜纹撑板（/）
  line(g, 3, 13, 12, 4, S.rail);
  line(g, 3, 3, 12, 12, S.grain[0]);                      // 斜纹撑板（\）
  rr(g, 3, 7, 10, 1, S.rail);                             // 中横档
  rr(g, 3, 1, 10, 1, S.grain[1]);                         // 门板顶光
  dither(g, 3, 1, 10, 13, S.grain, 0.12);                 // 木纹噪
  if (S.rivets) {                                         // 铁门铆钉
    px(g, 3, 1, S.rivets); px(g, 12, 1, S.rivets);
    px(g, 3, 13, S.rivets); px(g, 12, 13, S.rivets);
  }
  px(g, 11, 7, '#c8b060'); px(g, 11, 8, '#8a7a3a');       // 黄铜把手
  rr(g, 0, 14, 16, 1, S.shadow);                          // 底影
  rr(g, 0, 15, 16, 1, S.sill);                            // 门槛
}

const TILES = {
  t_asphalt(g) {
    asphaltBase(g);
    line(g, 3, 4, 7, 9, '#14161b');                       // 裂缝
    px(g, 12, 12, '#2a2d33'); px(g, 13, 12, '#181b20');
  },
  t_asphalt2(g) {
    asphaltBase(g);
    rr(g, 2, 9, 6, 4, '#191c21');                         // 修补补丁
    dither(g, 2, 9, 6, 4, ['#16191e', '#1e2126'], 0.45);
    line(g, 10, 2, 14, 7, '#14161b');
    px(g, 5, 3, '#12141a'); px(g, 6, 3, '#12141a');
  },
  t_sidewalk(g) {
    rr(g, 0, 0, 16, 16, P.sidewalk);
    dither(g, 0, 0, 16, 16, ['#2e3138', '#26292e', '#31343a'], 0.28);
    rr(g, 0, 0, 16, 1, '#36393f');                        // 板面顶光
    rr(g, 0, 0, 1, 16, '#31343a');
    rr(g, 0, 15, 16, 1, '#1e2125');                       // 板缘底影
    rr(g, 15, 0, 1, 16, '#23262b');
    line(g, 4, 5, 8, 9, '#22252a');                       // 细裂纹
  },
  t_curb(g) {
    rr(g, 0, 0, 16, 16, P.curb);
    rr(g, 0, 0, 16, 2, '#46494f');                        // 顶面高光
    rr(g, 0, 2, 16, 1, '#404347');
    rr(g, 0, 13, 16, 3, '#2b2e33');                       // 底部投影
    rr(g, 7, 2, 1, 11, '#2b2e33');                        // 接缝
    dither(g, 0, 0, 16, 16, ['#3e4146', '#33363b'], 0.18);
  },
  t_grass(g) {
    rr(g, 0, 0, 16, 16, '#16241b');
    dither(g, 0, 0, 16, 16, [P.bush0, '#1a2e20', '#122017', '#1d3323'], 0.4);
    for (let i = 0; i < 12; i++) {                        // 草叶
      const x = (rnd() * 15) | 0, y = (rnd() * 14) | 0;
      rr(g, x, y, 1, 2, rnd() < 0.7 ? P.bush1 : '#35603a');
    }
    dither(g, 0, 0, 16, 16, ['#0f1a12'], 0.1);
    rr(g, 0, 0, 16, 1, 'rgba(255,255,255,0.03)');
    rr(g, 0, 15, 16, 1, 'rgba(0,0,0,0.18)');
  },
  t_wall(g) {
    whiteTiles(g, 0, 0, 16, 16);                          // 白色竖排长条瓷砖
    wallEdge(g);                                          // 顶光底影
  },
  /* 牛皮癣小广告墙 3 变体：白瓷砖底 + 2-4 张歪斜广告纸条，布局各异 */
  t_wallAd1(g) {
    whiteTiles(g, 0, 0, 16, 16);
    adPaper(g, 5, 5, 6, 7, -9, { paper: '#d8cfae', ink: '#8a1a1a', pin: true });   // 红字「办证」
    adPaper(g, 11, 11, 5, 6, 7, { paper: '#cfc39e', ink: '#26221c' });             // 黑字「通下水道」
    wallEdge(g);
  },
  t_wallAd2(g) {
    whiteTiles(g, 0, 0, 16, 16);
    adPaper(g, 4, 12, 6, 6, 6, { paper: '#e0d6b8', ink: '#26221c' });              // 黑字「搬家」
    adPaper(g, 9, 4, 5, 5, -7, { paper: '#d8cfae', ink: '#8a1a1a', pin: true });   // 红字
    adPaper(g, 13, 11, 4, 5, 11, { paper: '#c8bd98', ink: '#8a1a1a' });            // 红字小张
    wallEdge(g);
  },
  t_wallAd3(g) {
    whiteTiles(g, 0, 0, 16, 16);
    adPaper(g, 3, 4, 5, 5, 10, { paper: '#cfc39e', ink: '#26221c', pin: true });   // 黑字
    adPaper(g, 8, 9, 6, 7, -6, { paper: '#d8cfae', ink: '#8a1a1a' });              // 红字「办证」
    adPaper(g, 13, 4, 4, 6, 13, { paper: '#e0d6b8', ink: '#26221c' });             // 黑字竖条
    adPaper(g, 13, 13, 3, 3, -15, { paper: '#c8bd98', ink: '#8a1a1a' });           // 撕剩半张
    wallEdge(g);
  },
  t_wallTop(g) {
    rr(g, 0, 0, 16, 4, '#565248');                        // 墙顶压顶
    dither(g, 0, 0, 16, 4, ['#5c584e', '#4c4840'], 0.3);
    rr(g, 0, 0, 16, 1, '#68645a');                        // 顶面高光
    rr(g, 0, 4, 16, 1, '#2b2924');                        // 压顶下沿投影
    mosaic(g, 0, 5, 16, 11);
    rr(g, 0, 14, 16, 2, '#2e2c26');
  },
  t_wallWin(g) {
    whiteTiles(g, 0, 0, 16, 16);                          // 窗框周围白瓷砖
    wallEdge(g);
    drawWindow(g, true);                                  // 窗户主体不变
  },
  t_wallWinOff(g) {
    whiteTiles(g, 0, 0, 16, 16);                          // 窗框周围白瓷砖
    wallEdge(g);
    drawWindow(g, false);                                 // 窗户主体不变
  },
  t_shutter(g) {
    rr(g, 0, 0, 16, 16, P.shutter);
    for (let y = 0; y < 16; y += 3) {                     // 卷闸门横向条纹
      rr(g, 0, y, 16, 1, '#4a5656');                      // 板条高光
      rr(g, 0, y + 2, 16, 1, '#333d3d');                  // 板条凹槽
    }
    rr(g, 0, 0, 1, 16, '#2c3434'); rr(g, 15, 0, 1, 16, '#2c3434');  // 边框
    rr(g, 0, 0, 16, 1, '#525e5e');                        // 顶光
    rr(g, 0, 14, 16, 2, '#242b2b');                       // 底影
    rr(g, 7, 12, 2, 1, '#202626');                        // 拉手
    dither(g, 1, 1, 14, 12, ['#42504e', '#39464a'], 0.12);          // 锈迹
  },
  /* 门 3 种颜色变体（反馈5）：0 棕木色 / 1 绿漆铁门 / 2 蓝漆门。
     t_door / t_doorClosed 保留为 variant 0 别名（buildSprites 末尾挂接）。 */
  t_door_0(g) { drawDoor(g, false, 0); },
  t_door_1(g) { drawDoor(g, false, 1); },
  t_door_2(g) { drawDoor(g, false, 2); },
  t_doorClosed_0(g) { drawClosedDoor(g, 0); },
  t_doorClosed_1(g) { drawClosedDoor(g, 1); },
  t_doorClosed_2(g) { drawClosedDoor(g, 2); },
  t_doorLocked(g) { drawDoor(g, true, 0); },
  /* 室内木地板（反馈5）：横向木板条，深浅棕木纹 + 板间缝隙 + 少量磨损噪点 */
  t_floor(g) {
    rr(g, 0, 0, 16, 16, '#1e140e');                          // 板缝底色
    const PL = ['#5a4232', '#54402e', '#5f4634', '#503a2a'];
    for (let row = 0; row < 4; row++) {                      // 横向木板条（3px 板 + 1px 缝）
      const y = row * 4;
      rr(g, 0, y, 16, 3, pick(PL));                          // 板面（深浅棕随机）
      rr(g, 0, y, 16, 1, 'rgba(255,255,255,0.07)');          // 板顶受光
      rr(g, 0, y + 2, 16, 1, 'rgba(0,0,0,0.18)');            // 板底影
      rr(g, row % 2 ? 12 : 4, y, 1, 3, 'rgba(22,15,10,0.85)'); // 板端竖缝（错缝）
      line(g, 1, y + 1, 7, y + 1, 'rgba(66,48,32,0.55)');    // 木纹
      line(g, 9, y + 2, 14, y + 2, 'rgba(40,28,18,0.5)');
    }
    px(g, 6, 9, '#3a281a'); px(g, 7, 9, '#3a281a'); px(g, 6, 10, '#2e1f14'); // 木节
    px(g, 12, 1, '#3a281a');
    dither(g, 0, 0, 16, 16, ['#4a3626', '#644a38', '#3a2c20'], 0.10);        // 磨损噪点
    rr(g, 0, 0, 16, 1, 'rgba(255,255,255,0.05)');            // 顶光
    rr(g, 0, 15, 16, 1, 'rgba(0,0,0,0.20)');                 // 底影
  },
  t_gate(g) {
    rr(g, 0, 0, 16, 16, '#14161d');
    dither(g, 0, 0, 16, 16, ['#101218', '#181a22'], 0.25);
    for (const x of [1, 4, 7, 10, 13]) {                  // 铁栅栏立杆
      rr(g, x, 0, 1, 16, P.gate);
      px(g, x, 0, '#5a5f65');                             // 尖顶
    }
    rr(g, 0, 2, 16, 2, '#43484e');                        // 上横档
    rr(g, 0, 12, 16, 2, '#43484e');                       // 下横档
    rr(g, 0, 2, 16, 1, '#565b61');                        // 横档顶光
    rr(g, 11, 6, 2, 3, '#33383e');                        // 锁盒
    ditherAtop(g, 0, 0, 16, 16, ['#3a3f45'], 0.08);
  },
  t_roadline(g) {
    asphaltBase(g);
    for (const seg of [[2, 6], [10, 14]])                 // 磨损虚线标线
      for (let x = seg[0]; x <= seg[1]; x++) {
        px(g, x, 7, '#9a9270'); px(g, x, 8, '#8a8262');
        if (rnd() < 0.3) px(g, x, 7, P.asphalt);          // 磨损缺口
        if (rnd() < 0.3) px(g, x, 8, P.asphalt);
      }
  },
};

/* ================= 物件（带椭圆投影） ================= */
/* 路灯：on=钠灯点亮 / 熄灭 */
function drawLamp(g, on) {
  if (on) {                                     // 钠灯橙光晕（同心抖动层）
    circle(g, 11, 8, 6.5, 'rgba(232,164,74,0.10)');
    circle(g, 11, 8, 4.5, 'rgba(232,164,74,0.16)');
    circle(g, 11, 8, 3, 'rgba(232,164,74,0.28)');
  }
  shadow(g, 8, 30.5, 5, 1.4, 0.4);
  rr(g, 6, 29, 4, 2, '#26292e');                // 底座法兰
  rr(g, 7, 8, 2, 21, '#33363b');                // 灯杆
  rr(g, 7, 8, 1, 21, '#45484d');                // 杆受光棱
  px(g, 8, 20, '#4a3a2c'); px(g, 8, 21, '#4a3a2c');   // 锈斑
  rr(g, 7, 5, 6, 2, '#33363b');                 // 挑臂
  rr(g, 7, 5, 6, 1, '#45484d');
  rr(g, 10, 2, 5, 4, '#26292e');                // 灯头外壳
  rr(g, 11, 1, 3, 1, '#1d2026');                // 顶盖
  if (on) {
    rr(g, 10, 6, 5, 1, P.lamp);                 // 出光口
    rr(g, 11, 6, 3, 1, '#f8d48a');              // 亮芯
    px(g, 12, 7, 'rgba(248,212,138,0.8)');
  } else {
    rr(g, 10, 6, 5, 1, '#3a3d42');              // 熄灭
    px(g, 11, 6, '#2a2d33');
  }
  ditherAtop(g, 7, 8, 2, 21, ['#2b2e33', '#3d4046'], 0.12);
  ditherAtop(g, 7, 5, 6, 2, ['#2b2e33'], 0.15);
  ditherAtop(g, 10, 2, 5, 4, ['#1f2226', '#2e3136'], 0.18);
}

/* 名字 -> [宽, 高, 绘制函数] */
const OBJECTS = {
  o_lamp: [16, 32, g => drawLamp(g, true)],
  o_lampOff: [16, 32, g => drawLamp(g, false)],
  o_bush: [16, 16, g => {                         // 灌木
    shadow(g, 8, 13.5, 6.5, 1.8, 0.35);
    circle(g, 8, 9, 5.5, P.bush0);
    circle(g, 4.5, 10.5, 3.2, P.bush0);
    circle(g, 11.5, 10.5, 3.2, P.bush0);
    circle(g, 6.5, 6.5, 3.2, P.bush1);            // 受光叶团
    circle(g, 10, 7.5, 2.6, '#24452b');
    ditherAtop(g, 1, 3, 14, 11, [P.bush1, '#18301c', '#35603a', P.bush0], 0.4);  // 叶噪
    ditherAtop(g, 3, 4, 6, 4, ['#3a6a42'], 0.25); // 顶部受光
  }],
  o_trash: [16, 16, g => {                        // 绿漆铁皮垃圾桶
    shadow(g, 8, 14, 5.5, 1.6, 0.4);
    rr(g, 4, 5, 8, 9, P.trash);
    g.clearRect(4, 5, 1, 1); g.clearRect(11, 5, 1, 1);   // 圆角
    rr(g, 6, 6, 1, 7, '#24402f'); rr(g, 9, 6, 1, 7, '#24402f');  // 竖棱
    rr(g, 5, 6, 1, 7, '#3a5a48');                 // 棱间高光
    rr(g, 3, 3, 10, 2, '#3a5a48');                // 桶盖
    rr(g, 3, 3, 10, 1, '#4a6a58');                // 盖顶光
    rr(g, 7, 2, 2, 1, '#2e4a3a');                 // 盖把
    rr(g, 4, 12, 8, 2, '#1e3328');                // 桶底影
    ditherAtop(g, 3, 2, 10, 12, ['#264334', '#35523f'], 0.18);
    px(g, 10, 10, '#5a4a32'); px(g, 5, 12, '#5a4a32');  // 锈斑
    px(g, 10, 11, '#453a28');
  }],
  o_box: [16, 16, g => {                          // 纸箱
    shadow(g, 8, 14, 5.5, 1.6, 0.35);
    rr(g, 3, 7, 10, 7, '#6a5638');                // 正面
    rr(g, 3, 4, 10, 3, '#7d6845');                // 顶面
    rr(g, 3, 4, 10, 1, '#8d7750');                // 顶沿高光
    rr(g, 3, 6, 10, 1, '#54452c');                // 折缝
    rr(g, 7, 4, 2, 3, '#8a7a52');                 // 顶面胶带
    rr(g, 7, 7, 2, 3, '#7a6a46');                 // 正面胶带
    rr(g, 3, 7, 1, 7, '#54452c');                 // 左侧暗棱
    rr(g, 3, 13, 10, 1, '#4a3d28');               // 底影
    rr(g, 10, 9, 2, 2, '#b3aa96');                // 旧标签
    px(g, 10, 9, '#7a7466'); px(g, 11, 10, '#7a7466');
    ditherAtop(g, 3, 4, 10, 10, ['#74603e', '#5e4c30', '#6a5638'], 0.22);
  }],
  o_cabinet: [16, 24, g => {                      // 老木柜（可躲藏）
    shadow(g, 8, 22, 6, 1.6, 0.4);
    rr(g, 2, 2, 12, 20, P.wood);
    rr(g, 2, 2, 12, 2, '#6a4e3a');                // 柜顶面
    rr(g, 2, 2, 12, 1, '#7a5a44');                // 顶沿高光
    rr(g, 2, 2, 1, 20, '#3f2c1e'); rr(g, 13, 2, 1, 20, '#3f2c1e');  // 侧框
    rr(g, 3, 4, 5, 16, '#523c2c');                // 左门
    rr(g, 8, 4, 5, 16, '#523c2c');                // 右门
    rr(g, 7, 4, 1, 16, '#33251a');                // 中缝
    for (const dx of [4, 9]) {
      rr(g, dx, 6, 3, 5, '#463322'); rr(g, dx, 6, 3, 1, '#5f4634');
      rr(g, dx, 13, 3, 5, '#463322'); rr(g, dx, 13, 3, 1, '#5f4634');
    }
    px(g, 7, 11, '#c8b060'); px(g, 8, 11, '#c8b060');   // 铜拉手
    ditherAtop(g, 2, 2, 12, 20, ['#4a3626', '#644a38', '#553f2d'], 0.14);  // 木纹
    px(g, 5, 16, '#3f2c1e'); px(g, 11, 8, '#3f2c1e');   // 木节
    rr(g, 2, 20, 12, 2, '#2f2117');               // 底影
  }],
  o_manhole: [16, 16, g => {                      // 井盖
    circle(g, 8, 8.8, 6, 'rgba(0,0,0,0.3)');      // 落影
    circle(g, 8, 8, 6, P.manhole);
    circle(g, 8, 8, 4.5, '#33383e');
    circle(g, 8, 8, 3, P.manhole);
    circle(g, 8, 8, 1.2, '#31363c');
    px(g, 4, 4, '#4c525a'); px(g, 5, 3, '#4c525a'); px(g, 6, 3, '#4c525a');  // 左上高光弧
    px(g, 3, 5, '#454b53'); px(g, 7, 2, '#4c525a');
    px(g, 12, 12, '#24282d'); px(g, 11, 13, '#24282d'); // 右下暗影
    rr(g, 5, 7, 1, 2, '#1d2026'); rr(g, 10, 7, 1, 2, '#1d2026');  // 提孔
    ditherAtop(g, 2, 2, 12, 12, ['#41464d', '#2e3338'], 0.18);
  }],
  o_phone: [16, 32, g => {                        // 红色电话亭
    shadow(g, 8, 30.5, 6, 1.5, 0.4);
    rr(g, 1, 2, 14, 4, '#6a2420');                // 亭顶
    rr(g, 1, 2, 14, 1, '#8a3a34');                // 顶沿高光
    rr(g, 3, 3, 10, 2, '#c8c0a8');                // 铭牌
    px(g, 5, 4, P.blood); px(g, 7, 4, P.blood); px(g, 9, 4, P.blood); px(g, 11, 4, P.blood);  // 红字痕
    rr(g, 2, 6, 2, 24, P.phone); rr(g, 12, 6, 2, 24, P.phone);    // 立柱
    rr(g, 3, 6, 1, 24, '#8a3732'); rr(g, 12, 6, 1, 24, '#8a3732');// 柱内侧高光
    rr(g, 4, 6, 8, 1, '#5a1f1c');                 // 上横梁
    rr(g, 4, 7, 8, 10, 'rgba(96,124,142,0.30)');  // 玻璃
    line(g, 5, 14, 10, 8, 'rgba(200,220,235,0.55)');   // 玻璃反光
    line(g, 5, 10, 8, 7, 'rgba(200,220,235,0.35)');
    rr(g, 6, 9, 4, 5, '#20242a');                 // 话机
    rr(g, 6, 9, 1, 4, '#3a3f45');                 // 听筒
    px(g, 8, 10, '#8a8a85'); px(g, 9, 10, '#8a8a85'); px(g, 8, 12, '#8a8a85');  // 按键
    rr(g, 4, 17, 8, 1, '#5a1f1c');                // 下横梁
    rr(g, 4, 18, 8, 8, '#5a2320');                // 下挡板
    rr(g, 5, 19, 6, 6, '#4a1e1b');
    rr(g, 5, 19, 6, 1, '#632a26');
    ditherAtop(g, 1, 2, 14, 4, ['#5a1f1c', '#752b26'], 0.15);      // 亭顶噪
    ditherAtop(g, 2, 6, 2, 24, ['#6a2622', '#83302b'], 0.12);      // 立柱噪
    ditherAtop(g, 12, 6, 2, 24, ['#6a2622', '#83302b'], 0.12);
    ditherAtop(g, 4, 18, 8, 8, ['#4a1e1b', '#632a26'], 0.12);
    rr(g, 2, 29, 12, 1, '#3f1512');               // 底影
  }],
  o_plank: [16, 16, g => {                        // 木板障碍（交叉钉板）
    shadow(g, 8, 13.5, 6.5, 1.5, 0.3);
    line(g, 2, 13, 13, 2, '#573b22');             // 斜板（叠厚度）
    line(g, 2, 12, 13, 1, '#6a4a2e');
    line(g, 3, 13, 14, 2, '#6a4a2e');
    line(g, 3, 12, 14, 1, '#7d5a38');
    rr(g, 1, 6, 14, 4, '#6a4a2e');                // 横板
    rr(g, 1, 6, 14, 1, '#7d5a38');                // 板顶光
    rr(g, 1, 9, 14, 1, '#45301c');                // 板底影
    line(g, 2, 7, 14, 7, '#573b22');              // 木纹
    line(g, 3, 8, 12, 8, '#5f422a');
    px(g, 3, 7, '#20242a'); px(g, 12, 7, '#20242a');    // 铁钉
    px(g, 8, 8, '#20242a');
    ditherAtop(g, 1, 1, 14, 13, ['#644628', '#75522f'], 0.12);
  }],
  o_gate_big: [48, 32, g => {                     // 小区大门招牌
    for (const bx of [0, 42]) {                   // 门柱
      shadow(g, bx + 3, 31, 4.5, 1.2, 0.4);
      mosaic(g, bx, 4, 6, 27);
      rr(g, bx, 2, 6, 2, '#565248');              // 柱帽
      rr(g, bx, 2, 6, 1, '#68645a');
    }
    rr(g, 6, 1, 36, 3, '#3a372f');                // 门楣
    rr(g, 8, 4, 32, 9, '#2e3a44');                // 招牌板
    rr(g, 8, 4, 32, 1, '#42505e');
    g.strokeStyle = '#8a7a4a'; g.lineWidth = 1;
    g.strokeRect(8.5, 4.5, 31, 8);
    g.fillStyle = P.win; g.font = '8px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('康宁小区', 24, 9);                // 小区招牌字
    rr(g, 6, 13, 36, 19, '#101218');              // 门洞
    dither(g, 6, 13, 36, 19, ['#0c0e14', '#14161e'], 0.15);
    for (let x = 7; x < 42; x += 4) {             // 铁栅栏
      rr(g, x, 13, 1, 19, P.gate);
      px(g, x, 13, '#5a5f65');
    }
    rr(g, 6, 14, 36, 2, '#43484e'); rr(g, 6, 26, 36, 2, '#43484e');
    rr(g, 6, 14, 36, 1, '#565b61');
    rr(g, 23, 13, 1, 19, '#14161d');              // 双开门缝
    rr(g, 22, 20, 3, 3, '#33383e');               // 锁盒
  }],
  o_bike: [16, 16, g => {                         // 自行车（侧视）
    shadow(g, 8, 14, 6.5, 1.3, 0.35);
    for (const wx of [4, 12]) {
      circle(g, wx, 11, 3, '#3f444a');            // 轮圈
      circle(g, wx, 11, 2.1, '#101216');
      px(g, wx, 11, '#6a6f75');                   // 轴
    }
    const FB = '#5f646a';
    line(g, 4, 11, 6, 5, FB);                     // 后叉
    line(g, 6, 5, 10, 5, FB);                     // 上管
    line(g, 10, 5, 7, 10, FB);                    // 下管
    line(g, 7, 10, 4, 11, FB);                    // 链架
    line(g, 7, 10, 12, 11, FB);                   // 前三角
    line(g, 12, 11, 11, 4, FB);                   // 前叉
    px(g, 11, 3, FB); px(g, 12, 3, '#3f444a');    // 车把
    rr(g, 5, 4, 2, 1, '#22252a');                 // 车座
    px(g, 6, 6, '#6a4a32'); px(g, 9, 6, '#6a4a32');     // 锈斑
  }],
  o_pole: [16, 32, g => {                         // 电线杆
    shadow(g, 8, 31, 4.5, 1.2, 0.4);
    line(g, 0, 2, 3, 5, '#15171c');               // 架空线
    line(g, 15, 2, 12, 5, '#15171c');
    line(g, 6, 6, 5, 13, '#15171c');              // 垂线
    rr(g, 7, 5, 2, 26, '#46464a');                // 水泥杆
    rr(g, 7, 5, 1, 26, '#57575c');                // 受光棱
    rr(g, 7, 19, 2, 1, '#3a3a3e');                // 环缝
    rr(g, 2, 6, 12, 2, '#3b3b3f');                // 横担
    rr(g, 2, 6, 12, 1, '#4c4c52');
    for (const ix of [3, 6, 9, 12]) px(g, ix, 5, '#9a9a8a');  // 瓷瓶
    rr(g, 9, 10, 4, 5, '#3f4a4a');                // 变压器
    rr(g, 9, 10, 4, 1, '#4f5a5a');
    rr(g, 6, 30, 4, 2, '#333336');                // 基座
    ditherAtop(g, 2, 2, 13, 30, ['#3f3f44', '#505056'], 0.1);
  }],
  o_board: [16, 24, g => {                        // 宣传栏
    shadow(g, 8, 22.5, 6, 1.4, 0.35);
    rr(g, 3, 10, 1, 13, '#3a3a3e'); rr(g, 12, 10, 1, 13, '#3a3a3e');  // 立杆
    rr(g, 1, 1, 14, 2, '#45454a');                // 雨棚
    rr(g, 1, 1, 14, 1, '#56565c');
    rr(g, 2, 3, 12, 9, P.wood);                   // 栏框
    rr(g, 3, 4, 10, 7, '#b3aa96');                // 宣传纸
    rr(g, 3, 4, 10, 2, '#8a3a2a');                // 红头
    px(g, 4, 5, '#c8b8a0'); px(g, 6, 5, '#c8b8a0'); px(g, 8, 5, '#c8b8a0');  // 标题字痕
    for (const q of [[7, 8], [8, 6], [9, 9], [10, 5]])
      rr(g, 4, q[0], q[1], 1, '#6a6a5a');         // 正文行
    rr(g, 10, 9, 2, 2, P.blood);                  // 红印章
    ditherAtop(g, 2, 3, 12, 9, ['#a39a86', '#8f8674'], 0.12);   // 纸面脏旧
  }],
  o_shop: [32, 16, g => {                         // 小卖部招牌
    rr(g, 0, 0, 32, 10, '#5a2320');               // 底板
    rr(g, 1, 1, 30, 8, '#7a3028');
    g.strokeStyle = '#9a8a5a'; g.lineWidth = 1; g.strokeRect(1.5, 1.5, 29, 7);
    g.fillStyle = '#e8d8a8'; g.font = '8px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('小卖部', 16, 5.5);                // 店名
    dither(g, 1, 1, 30, 8, ['#6a2a24', '#84352c'], 0.18);   // 褪色
    px(g, 3, 7, '#4a1e1b'); px(g, 28, 3, '#4a1e1b');    // 锈渍
    for (let x = 0; x < 32; x += 2) {             // 遮阳棚条纹
      rr(g, x, 10, 2, 6, (x / 2) % 2 ? '#3f4a4a' : '#7a2a26');
      rr(g, x, 15, 2, 1, (x / 2) % 2 ? '#2c3434' : '#5a1f1c');
    }
    rr(g, 0, 10, 32, 1, 'rgba(0,0,0,0.35)');      // 棚顶影
  }],
  o_shop2: [32, 16, g => {                        // 烟酒店招牌（小卖部变体，墨绿配色）
    rr(g, 0, 0, 32, 10, '#1e3a3c');               // 底板（墨绿）
    rr(g, 1, 1, 30, 8, '#2a4a4a');
    g.strokeStyle = '#8a9a7a'; g.lineWidth = 1; g.strokeRect(1.5, 1.5, 29, 7);
    g.fillStyle = '#e8d8a8'; g.font = '8px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('烟 酒', 16, 5.5);                 // 店名
    dither(g, 1, 1, 30, 8, ['#234242', '#325454'], 0.18);   // 褪色
    px(g, 4, 7, '#162a2c'); px(g, 27, 3, '#162a2c');    // 锈渍
    px(g, 24, 4, '#8a1a1a'); px(g, 25, 5, '#8a1a1a');   // 红价签残角
    for (let x = 0; x < 32; x += 2) {             // 遮阳棚条纹（青/米白）
      rr(g, x, 10, 2, 6, (x / 2) % 2 ? '#2e5a5a' : '#b8b49a');
      rr(g, x, 15, 2, 1, (x / 2) % 2 ? '#1f4242' : '#8a8672');
    }
    rr(g, 0, 10, 32, 1, 'rgba(0,0,0,0.35)');      // 棚顶影
  }],
  o_awning: [16, 8, g => {                        // 蓝白条纹遮雨棚（挂墙装饰）
    rr(g, 0, 0, 16, 1, '#2a2d33');                // 顶沿固定杆
    px(g, 1, 0, '#46494f'); px(g, 14, 0, '#46494f');
    for (let x = 0; x < 16; x += 2) {             // 棚面条纹（蓝/白）
      const c = (x / 2) % 2 ? '#3a5a8a' : '#d8d5c8';
      rr(g, x, 1, 2, 5, c);
      rr(g, x, 1, 2, 1, (x / 2) % 2 ? '#4a6a9a' : '#e8e5d8');   // 棚顶受光
    }
    for (let x = 0; x < 16; x += 4) {             // 波浪下沿（每格垂 1px 扇形边）
      rr(g, x, 6, 2, 1, (x / 4) % 2 ? '#2c4468' : '#b8b5a8');
      px(g, x + 2, 6, (x / 4) % 2 ? '#3a5a8a' : '#d8d5c8');
      px(g, x + 3, 6, (x / 4) % 2 ? '#3a5a8a' : '#d8d5c8');
    }
    ditherAtop(g, 0, 1, 16, 6, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], 0.14);
    rr(g, 0, 7, 16, 1, 'rgba(0,0,0,0.35)');       // 棚下投影
  }],
  o_fencegate: [16, 16, g => {                    // 铁栅栏门（半掩装饰，不可通行）
    shadow(g, 8, 15, 6.5, 1.4, 0.35);
    rr(g, 0, 0, 2, 16, '#3a3f45');                // 左门柱
    rr(g, 14, 0, 2, 16, '#3a3f45');               // 右门柱
    rr(g, 0, 0, 2, 1, '#565b61'); rr(g, 14, 0, 2, 1, '#565b61');
    // 半掩门扇：右半扇关（竖杆齐整），左半扇斜开（竖杆错位内倾）
    for (const x of [9, 11, 13]) {                // 右扇竖杆
      rr(g, x, 2, 1, 12, P.gate);
      px(g, x, 1, '#5a5f65');                     // 尖顶
    }
    for (const [x, dy] of [[3, 2], [5, 1], [7, 0]]) {  // 左扇斜开竖杆
      rr(g, x, 2 + dy, 1, 12 - dy, '#42474d');
      px(g, x, 1 + dy, '#565b61');
    }
    rr(g, 3, 3, 12, 1, '#43484e');                // 上横档
    rr(g, 3, 11, 12, 1, '#3d4248');               // 下横档
    rr(g, 3, 3, 12, 1, '#565b61');                // 横档顶光
    line(g, 4, 12, 8, 5, '#33383e');              // 斜撑（开扇）
    rr(g, 11, 6, 2, 3, '#33383e');                // 锁盒
    px(g, 12, 7, '#8a6a3a');                      // 锈锁
    ditherAtop(g, 2, 1, 13, 14, ['#3a3f45', '#2c3136', '#4a4f55'], 0.14);  // 锈迹
  }],
  o_billboard: [24, 16, g => {                    // 老式喷绘广告牌（贴墙装饰）
    rr(g, 0, 0, 24, 16, '#20242a');               // 背板边框
    rr(g, 1, 1, 22, 14, '#1f3a5a');               // 喷绘底（深蓝）
    rr(g, 1, 1, 22, 3, '#b83020');                // 顶部红带
    rr(g, 1, 1, 22, 1, '#d04828');
    g.fillStyle = '#e8c84a'; g.font = '8px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('VCD', 12, 8);                     // 喷绘大字
    g.fillStyle = '#e8e0c8';
    g.fillText('影碟', 12, 13);
    px(g, 2, 6, '#e8c84a'); px(g, 3, 7, '#b83020');   // 装饰星点
    px(g, 21, 10, '#b83020'); px(g, 20, 6, '#e8c84a');
    ditherAtop(g, 1, 1, 22, 14, ['rgba(0,0,0,0.16)', 'rgba(255,255,255,0.07)'], 0.16);  // 褪色脏旧
    rr(g, 1, 13, 3, 2, 'rgba(32,36,42,0.8)');     // 左下角破损
    rr(g, 0, 15, 24, 1, 'rgba(0,0,0,0.35)');      // 底影
  }],
};

/* ================= 人物（16×24 竖版画布，4方向×2帧） ================= */
const SKIN = '#c8956a', SKIND = '#a87a52', HAIR = '#16161a';

/* 玩家双腿（正面/背面共用）：f 帧交替迈步 */
function legsPlayer(g, f) {
  const lf = f === 0, PA = P.pants, PAD = '#2c3852', SO = '#23232a';
  rr(g, lf ? 9 : 5, 16, 2, 3, PA); rr(g, lf ? 9 : 5, 19, 2, 2, SO);   // 后腿（抬起）
  rr(g, lf ? 5 : 9, 16, 2, 4, PA); rr(g, lf ? 5 : 9, 20, 2, 2, SO);   // 前腿（踏地）
  rr(g, lf ? 10 : 6, 16, 1, 3, PAD); rr(g, lf ? 6 : 10, 16, 1, 4, PAD); // 腿侧影
  px(g, lf ? 10 : 5, 19, '#101014'); px(g, lf ? 5 : 9, 21, '#101014');  // 鞋底
}
/* 玩家 蒋阳宏：白衬衫 + 蓝裤 */
function drawPlayer(dir, f) {
  const c = cv(16, 24), g = ctxOf(c);
  const SH = P.shirt, SHD = '#a9a999', SHL = '#d4d4c4';
  shadow(g, 8, 22, 5, 1.4, 0.3);
  if (dir === 'down' || dir === 'up') {
    legsPlayer(g, f);
    rr(g, 5, 14, 6, 2, P.pants);                        // 臀
    rr(g, 5, 14, 6, 1, '#42527a');
    const sw = f === 0 ? 1 : -1;                        // 手臂随步态摆动
    rr(g, 3, 8, 1, 3, SHD); rr(g, 12, 8, 1, 3, SHD);    // 袖口
    rr(g, 3, 11 + (sw < 0 ? 1 : 0), 1, 2, SKIN);        // 小臂
    rr(g, 12, 11 + (sw > 0 ? 1 : 0), 1, 2, SKIN);
    px(g, 3, 13 + (sw < 0 ? 1 : 0), SKIND);             // 手
    px(g, 12, 13 + (sw > 0 ? 1 : 0), SKIND);
    rr(g, 4, 8, 8, 6, SH);                              // 白衬衫
    rr(g, 4, 8, 8, 1, SHL);                             // 肩部顶光
    rr(g, 4, 9, 1, 5, SHL);                             // 左受光
    rr(g, 11, 9, 1, 5, SHD);                            // 右侧影
    rr(g, 4, 12, 8, 2, SHD);                            // 下摆影
    rr(g, 4, 13, 8, 1, '#33333a');                      // 皮带
    px(g, 8, 13, '#6a6a60');                            // 皮带扣
    if (dir === 'down') {
      px(g, 7, 8, SHD); px(g, 8, 8, SHD);               // 领口
      px(g, 6, 10, '#b0b0a0'); px(g, 9, 11, '#b0b0a0'); // 衣褶
      rr(g, 5, 1, 6, 3, HAIR);                          // 发顶
      rr(g, 5, 1, 6, 1, '#232330');                     // 发丝高光
      rr(g, 5, 4, 1, 2, HAIR); rr(g, 10, 4, 1, 2, HAIR);// 鬓角
      rr(g, 6, 3, 4, 4, SKIN);                          // 脸
      rr(g, 6, 3, 4, 1, SKIND);                         // 发际线影
      px(g, 6, 5, '#101014'); px(g, 9, 5, '#101014');   // 眼
      px(g, 7, 6, SKIND); px(g, 8, 6, SKIND);           // 下颌影
      px(g, 5, 5, SKIND); px(g, 10, 5, SKIND);          // 耳
      rr(g, 7, 7, 2, 1, SKIND);                         // 颈
    } else {
      rr(g, 5, 1, 6, 6, HAIR);                          // 后脑
      rr(g, 5, 1, 6, 1, '#232330');
      px(g, 7, 3, '#26262e'); px(g, 9, 2, '#26262e');   // 发旋
      rr(g, 5, 5, 6, 1, '#101016');                     // 发根影
      rr(g, 6, 6, 4, 1, SKIND);                         // 后颈
      px(g, 5, 6, SKIN); px(g, 10, 6, SKIN);
      rr(g, 5, 7, 6, 1, SHD);                           // 后领
      px(g, 8, 9, '#b8b8a8');                           // 背缝
      px(g, 7, 10, '#b0b0a0'); px(g, 8, 11, '#b0b0a0'); // 背部衣褶
    }
  } else { /* left（right 由 flipH 镜像生成），脸朝左 */
    const lf = f === 0;
    rr(g, 5, 14, 5, 2, P.pants);
    rr(g, 5, 14, 5, 1, '#42527a');
    if (lf) {                                           // 侧视跨步
      rr(g, 4, 16, 2, 4, P.pants); rr(g, 3, 20, 4, 2, '#23232a');
      rr(g, 8, 16, 2, 3, '#2c3852'); rr(g, 7, 19, 3, 2, '#1b1b20');
    } else {
      rr(g, 4, 16, 2, 3, '#2c3852'); rr(g, 3, 19, 3, 2, '#1b1b20');
      rr(g, 7, 16, 2, 4, P.pants); rr(g, 6, 20, 4, 2, '#23232a');
    }
    rr(g, 5, 8, 5, 6, SH);                              // 躯干（侧）
    rr(g, 5, 8, 5, 1, SHL);
    rr(g, 9, 9, 1, 5, SHD);                             // 背侧影
    rr(g, 5, 12, 5, 2, SHD);
    rr(g, 5, 13, 5, 1, '#33333a');
    rr(g, 6, 8, 2, 3, SHD);                             // 袖
    if (lf) { rr(g, 7, 11, 1, 3, SKIN); px(g, 7, 14, SKIND); }   // 臂前摆
    else    { rr(g, 4, 11, 1, 3, SKIN); px(g, 4, 14, SKIND); }   // 臂后摆
    rr(g, 5, 1, 5, 3, HAIR);                            // 头（侧）
    rr(g, 5, 1, 5, 1, '#232330');
    rr(g, 8, 3, 2, 3, HAIR);                            // 后脑发
    rr(g, 5, 3, 4, 4, SKIN);                            // 脸
    px(g, 5, 4, '#101014');                             // 眼
    px(g, 4, 5, SKIN); px(g, 4, 6, SKIND);              // 鼻
    px(g, 5, 6, SKIND);                                 // 下颌
    rr(g, 6, 7, 2, 1, SKIND);                           // 颈
  }
  grain(g, 16, 24, 0.08);
  return c;
}
/* 剥皮人 刘铮铮：更高大、血围裙、裸背、反光刀 */
function drawEnemy(dir, f) {
  const c = cv(16, 24), g = ctxOf(c);
  const AP = P.apron, APD = '#4a1515', APL = '#7a2626';
  const PA = '#23232a', BO = '#101014';
  shadow(g, 8, 22.5, 5.5, 1.5, 0.35);
  const knifeLow = f === 0;
  if (dir === 'down' || dir === 'up') {
    const lf = f === 0;
    rr(g, lf ? 9 : 5, 17, 3, 3, '#1f1f26'); rr(g, lf ? 9 : 5, 20, 3, 2, BO);   // 后靴
    rr(g, lf ? 5 : 9, 17, 3, 4, PA); rr(g, lf ? 5 : 9, 21, 3, 2, BO);          // 前靴
    rr(g, 5, 16, 6, 2, PA);                           // 胯
    rr(g, 5, 16, 6, 1, '#2c2c34');
    // 裸臂（右臂持刀）
    rr(g, 2, 7, 2, 5, SKIN); rr(g, 2, 11, 2, 2, SKIND);          // 左臂
    px(g, 3, 9, P.blood); px(g, 2, 12, P.blood);                 // 臂上血
    if (knifeLow) {
      rr(g, 12, 7, 2, 6, SKIN); rr(g, 12, 12, 2, 2, SKIND);      // 右臂垂
      rr(g, 13, 14, 2, 2, '#241e22');                            // 刀柄
      rr(g, 14, 16, 1, 5, '#c8d0d8');                            // 反光刀刃
      px(g, 14, 16, '#f4f8fa');                                  // 高光点
      px(g, 14, 19, P.blood); px(g, 14, 20, '#5a1010');          // 刃上血
    } else {
      rr(g, 12, 7, 2, 4, SKIN);                                  // 上臂
      rr(g, 13, 9, 2, 3, SKIN);                                  // 腕/手
      rr(g, 13, 8, 2, 2, '#241e22');                             // 刀柄
      rr(g, 14, 3, 1, 5, '#c8d0d8');                             // 举刀
      px(g, 14, 3, '#f4f8fa'); px(g, 14, 5, P.blood);
    }
    if (dir === 'down') {
      rr(g, 4, 6, 8, 3, SKIN);                          // 胸
      rr(g, 4, 6, 8, 1, '#d8a87a');                     // 肩顶光
      px(g, 6, 7, SKIND); px(g, 9, 7, SKIND);           // 胸肌影
      px(g, 7, 8, '#3a2a20'); px(g, 8, 8, '#3a2a20');   // 胸毛
      rr(g, 5, 6, 1, 3, '#551818'); rr(g, 10, 6, 1, 3, '#551818');  // 围裙肩带
      rr(g, 4, 9, 8, 8, AP);                            // 血围裙
      rr(g, 4, 9, 8, 1, APL);                           // 围裙上沿光
      rr(g, 4, 15, 8, 2, APD);                          // 围裙底影
      px(g, 5, 11, P.blood); px(g, 6, 12, P.blood); px(g, 9, 10, P.blood);
      px(g, 10, 13, P.blood); px(g, 7, 14, P.blood); px(g, 8, 11, '#5a1010');
      rr(g, 5, 15, 2, 1, P.blood);                      // 手印残血
      px(g, 6, 16, '#3f1212'); px(g, 9, 15, '#3f1212');
      px(g, 3, 12, '#551818'); px(g, 12, 12, '#551818');// 侧系带
      rr(g, 5, 1, 6, 4, SKIN);                          // 秃头
      rr(g, 6, 0, 4, 1, '#d8a87a');                     // 头顶高光
      rr(g, 5, 1, 1, 3, '#3a2a20'); rr(g, 10, 1, 1, 3, '#3a2a20');  // 两侧残发
      rr(g, 6, 2, 4, 1, SKIND);                         // 眉脊
      px(g, 6, 3, '#0a0a0a'); px(g, 9, 3, '#0a0a0a');   // 眼窝
      px(g, 7, 4, '#5a3a28'); px(g, 8, 4, '#5a3a28');   // 嘴
      px(g, 10, 4, P.blood);                            // 颊血
      rr(g, 7, 5, 2, 1, SKIND);                         // 颈
    } else {
      rr(g, 4, 6, 8, 10, SKIN);                         // 裸背
      rr(g, 4, 6, 8, 1, '#d8a87a');
      rr(g, 4, 14, 8, 2, SKIND);                        // 腰影
      line(g, 5, 7, 10, 13, '#551818');                 // 围裙背带 X
      line(g, 10, 7, 5, 13, '#551818');
      rr(g, 4, 13, 8, 1, '#551818');                    // 腰系绳
      rr(g, 8, 8, 1, 4, SKIND);                         // 脊沟
      px(g, 6, 9, SKIND); px(g, 10, 10, SKIND);         // 肩胛影
      px(g, 6, 11, P.blood); px(g, 7, 12, '#5a1010');   // 背上血痕
      rr(g, 5, 1, 6, 4, SKIN);                          // 后脑
      rr(g, 6, 0, 4, 1, '#d8a87a');
      px(g, 7, 2, SKIND); px(g, 8, 3, '#8a6844');       // 疤
      rr(g, 5, 1, 1, 3, '#3a2a20'); rr(g, 10, 1, 1, 3, '#3a2a20');
      rr(g, 6, 5, 4, 1, SKIND);                         // 后颈
    }
  } else { /* left（right 由 flipH 镜像生成），脸朝左 */
    const lf = f === 0;
    if (lf) {
      rr(g, 4, 16, 3, 4, PA); rr(g, 3, 20, 4, 2, BO);
      rr(g, 8, 16, 2, 3, '#1f1f26'); rr(g, 7, 19, 3, 2, BO);
    } else {
      rr(g, 4, 16, 2, 3, '#1f1f26'); rr(g, 3, 19, 3, 2, BO);
      rr(g, 6, 16, 3, 4, PA); rr(g, 5, 20, 4, 2, BO);
    }
    rr(g, 5, 15, 5, 2, PA);                             // 胯
    rr(g, 4, 6, 6, 5, SKIN);                            // 裸上身（侧）
    rr(g, 4, 6, 6, 1, '#d8a87a');
    rr(g, 4, 8, 1, 3, SKIND);                           // 胸廓前影
    px(g, 8, 8, SKIND); px(g, 9, 9, SKIND);             // 背肌
    rr(g, 4, 10, 3, 6, AP);                             // 围裙（前垂）
    rr(g, 4, 10, 3, 1, APL);
    rr(g, 4, 14, 3, 2, APD);
    px(g, 5, 12, P.blood); px(g, 4, 13, P.blood); px(g, 6, 15, '#3f1212');
    rr(g, 9, 10, 2, 1, '#551818');                      // 后腰系带
    px(g, 10, 11, '#551818');
    rr(g, 5, 7, 2, 4, SKIN);                            // 上臂
    if (knifeLow) {
      rr(g, 4, 10, 2, 3, SKIN); px(g, 4, 12, SKIND);    // 前臂前伸
      rr(g, 3, 12, 1, 2, '#241e22');                    // 刀柄
      rr(g, 0, 12, 3, 1, '#c8d0d8');                    // 前指刀刃
      px(g, 0, 12, '#f4f8fa'); px(g, 1, 13, P.blood);
    } else {
      rr(g, 4, 9, 2, 2, SKIN);                          // 抬前臂
      rr(g, 3, 8, 1, 2, '#241e22');
      rr(g, 0, 8, 3, 1, '#c8d0d8');                     // 平举刀
      px(g, 0, 8, '#f4f8fa'); px(g, 1, 9, P.blood);
    }
    rr(g, 4, 1, 6, 4, SKIN);                            // 头（侧）
    rr(g, 5, 0, 4, 1, '#d8a87a');
    rr(g, 8, 2, 2, 3, '#3a2a20');                       // 后残发
    px(g, 4, 2, SKIND);                                 // 眉
    px(g, 4, 3, '#0a0a0a');                             // 眼
    px(g, 3, 4, SKIN);                                  // 鼻
    px(g, 4, 4, '#5a3a28');                             // 嘴
    rr(g, 5, 5, 3, 1, SKIND);                           // 颈
  }
  grain(g, 16, 24, 0.09);
  return c;
}

/* ================= 道具图标（12×12） ================= */
function hole(g, x, y, w, h) {                          // 抠透明
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'source-over';
}
const ICONS = {
  i_key(g) {                                            // 大门钥匙（黄铜）
    circle(g, 3, 6, 2.4, '#d8b040');
    g.globalCompositeOperation = 'destination-out'; circle(g, 3, 6, 1.2, '#000');
    g.globalCompositeOperation = 'source-over';
    px(g, 2, 4, '#f0d070');                             // 环高光
    rr(g, 5, 5, 6, 2, '#d8b040');                       // 钥杆
    rr(g, 5, 5, 6, 1, '#f0d070');
    px(g, 9, 7, '#b8922e'); px(g, 9, 8, '#b8922e');     // 齿
    px(g, 7, 7, '#b8922e');
    px(g, 10, 6, '#8a6c22');
  },
  i_roomkey(g) {                                        // 房间钥匙（铁灰方环）
    rr(g, 1, 4, 4, 4, '#b0b0a8'); hole(g, 2, 5, 2, 2);
    px(g, 1, 4, '#d8d8d0');
    rr(g, 5, 5, 6, 2, '#b0b0a8');
    rr(g, 5, 5, 6, 1, '#d8d8d0');
    px(g, 10, 7, '#8a8a82'); px(g, 8, 7, '#8a8a82'); px(g, 8, 8, '#8a8a82');
    px(g, 11, 6, '#6a6a64');
  },
  i_food(g) {                                           // 包子
    shadow(g, 6, 10.5, 3.5, 1, 0.3);
    circle(g, 6, 6.5, 4, '#d8d0c0');
    px(g, 4, 4, '#efece2'); px(g, 5, 3, '#efece2');     // 高光
    px(g, 8, 9, '#a89f8c'); px(g, 7, 10, '#a89f8c');    // 底影
    px(g, 9, 8, '#b0a894');
    line(g, 4, 5, 6, 4, '#b0a894');                     // 褶
    line(g, 8, 5, 6, 4, '#b0a894');
    px(g, 6, 5, '#a89f8c');                             // 顶脐
    ditherAtop(g, 2, 2, 8, 9, ['#cfc7b4', '#e2dccf'], 0.15);
  },
  i_drink(g) {                                          // 汽水
    shadow(g, 6, 11, 3, 0.8, 0.3);
    rr(g, 3, 2, 6, 9, '#a83a28');
    rr(g, 3, 2, 6, 1, '#c8c8c0');                       // 银盖
    px(g, 5, 2, '#8a8a85'); px(g, 6, 2, '#6a6a66');     // 拉环
    rr(g, 3, 10, 6, 1, '#7a2a20');                      // 罐底
    rr(g, 3, 5, 6, 2, '#d8d0c0');                       // 标签带
    px(g, 4, 5, '#a83a28'); px(g, 6, 6, '#a83a28'); px(g, 8, 5, '#a83a28');
    rr(g, 4, 3, 1, 7, '#c05a42');                       // 罐身高光
    ditherAtop(g, 3, 2, 6, 9, ['#983424', '#b0402c'], 0.14);
  },
  i_plank(g) {                                          // 木板
    shadow(g, 6, 10.5, 4, 0.9, 0.3);
    line(g, 2, 10, 9, 3, '#45301c');
    line(g, 2, 9, 9, 2, '#6a4a2e');
    line(g, 3, 10, 10, 3, '#5f422a');
    line(g, 2, 8, 9, 1, '#7d5a38');                     // 板顶光
    px(g, 3, 8, '#20242a'); px(g, 8, 3, '#20242a');     // 钉
    px(g, 5, 6, '#573b22'); px(g, 6, 5, '#573b22');     // 木纹
  },
  i_cracker(g) {                                        // 鞭炮
    shadow(g, 6, 11, 3, 0.8, 0.3);
    rr(g, 4, 3, 5, 8, '#a82020');
    rr(g, 5, 3, 1, 8, '#d04828');                       // 高光
    rr(g, 8, 3, 1, 8, '#701414');                       // 右侧影
    rr(g, 4, 6, 5, 1, '#8a1a1a');                       // 纸箍
    rr(g, 4, 3, 5, 1, '#c8b060');                       // 封口
    px(g, 6, 2, '#c8b060'); px(g, 7, 1, '#c8b060');     // 引线
    px(g, 8, 0, '#f0d070'); px(g, 9, 1, '#e8a44a');     // 火星
    ditherAtop(g, 4, 3, 5, 8, ['#941c1c', '#b82828'], 0.15);
  },
};

/* ================= 其他 ================= */
const OTHER = {
  ui_eye(g) {                                           // 警觉眼睛图标（12×12）
    rr(g, 4, 4, 4, 1, '#c8c0a8');                       // 眼白
    rr(g, 3, 5, 6, 1, '#c8c0a8');
    rr(g, 3, 6, 6, 1, '#c8c0a8');
    rr(g, 4, 7, 4, 1, '#c8c0a8');
    const OL = P.ui;
    for (const x of [4, 5, 6, 7]) { px(g, x, 3, OL); px(g, x, 8, OL); }   // 上下睑
    px(g, 3, 4, OL); px(g, 8, 4, OL);
    px(g, 2, 5, OL); px(g, 9, 5, OL);
    px(g, 2, 6, OL); px(g, 9, 6, OL);
    px(g, 3, 7, OL); px(g, 8, 7, OL);
    circle(g, 6, 5.5, 2, P.blood);                      // 虹膜
    circle(g, 6, 5.5, 0.9, '#0a0a0a');                  // 瞳孔
    px(g, 5, 5, '#e8e0c8');                             // 眼神光
  },
};

/* ================= 构建入口（幂等） ================= */
export function buildSprites() {
  if (_built) return SPR;
  _built = true;
  const put = (table, w, h) => {
    for (const name in table) {
      const c = cv(w, h);
      table[name](ctxOf(c));
      SPR[name] = c;
    }
  };
  put(TILES, 16, 16);
  for (const name in OBJECTS) {
    const [w, h, fn] = OBJECTS[name];
    const c = cv(w, h);
    fn(ctxOf(c));
    SPR[name] = c;
  }
  // 门原名保留为 variant 0（棕木色）别名，避免破坏既有引用（反馈5）
  SPR.t_door = SPR.t_door_0;
  SPR.t_doorClosed = SPR.t_doorClosed_0;
  put(ICONS, 12, 12);
  put(OTHER, 12, 12);
  for (const dir of ['down', 'up', 'left'])
    for (const f of [0, 1]) {
      SPR['p_' + dir + f] = drawPlayer(dir, f);
      SPR['e_' + dir + f] = drawEnemy(dir, f);
    }
  for (const f of [0, 1]) {                             // 右向 = 左向镜像
    SPR['p_right' + f] = flipH(SPR['p_left' + f]);
    SPR['e_right' + f] = flipH(SPR['e_left' + f]);
  }
  return SPR;
}
