// js/items.js — 《珠海剥皮人》道具 / 背包系统（开发者B）
// 依赖：state.js（G/say）、audio.js（Audio）。鞭炮飞行/爆炸状态挂在 world 上由 updateWorld 驱动。
import { G, say } from './state.js';
import { Audio } from './audio.js';

const TS = 16;
const MAX_SLOTS = 4;      // 4 格背包
const STACK = 99;         // 同类堆叠上限

// ---------------------------------------------------------------------------
// §5.3 道具表：中文名 / icon 贴图名 / 描述
// ---------------------------------------------------------------------------
export const ITEMS = {
  key:     { name: '大门钥匙', icon: 'i_key',     desc: '小区大铁门的钥匙，集齐 3 把就能打开东侧大门逃出去。' },
  roomkey: { name: '房间钥匙', icon: 'i_roomkey', desc: '一把老式房门钥匙。走到上锁的门前按 E 使用。' },
  food:    { name: '包子',     icon: 'i_food',    desc: '还温着的肉包。按 Q 吃掉，恢复 40 点体力。' },
  drink:   { name: '汽水',     icon: 'i_drink',   desc: '冰镇玻璃樽汽水。按 Q 喝掉，恢复 25 点体力。' },
  plank:   { name: '木板',     icon: 'i_plank',   desc: '按 Q 架在面前一格挡住去路，能挨剥皮人三刀。' },
  cracker: { name: '鞭炮',     icon: 'i_cracker', desc: '按 Q 朝面前扔出，落地后爆响，把剥皮人引过去。' },
};

// 当前背包：[{id,n}]，模块内唯一
let inv = [];

export function inventory() { return inv; }
export function resetInventory() { inv = []; }

function consume(slot) {
  const i = inv.indexOf(slot);
  if (i < 0) return;
  slot.n--;
  if (slot.n <= 0) inv.splice(i, 1);
}

// ---------------------------------------------------------------------------
// §5.3 giveItem：入背包（最多 4 格，同类堆叠到 99），满则消息提示
// ---------------------------------------------------------------------------
export function giveItem(G, id, n = 1) {
  if (!ITEMS[id] || n <= 0) return false;
  let cap = (MAX_SLOTS - inv.length) * STACK;
  for (const s of inv) if (s.id === id) cap += STACK - s.n;
  if (cap < n) { say(G, '背包满了，装不下了。'); return false; }
  let left = n;
  for (const s of inv) {
    if (!left) break;
    if (s.id === id && s.n < STACK) {
      const add = Math.min(STACK - s.n, left);
      s.n += add; left -= add;
    }
  }
  while (left > 0) {
    const add = Math.min(STACK, left);
    inv.push({ id, n: add });
    left -= add;
  }
  Audio.sfx('pickup');
  return true;
}

// ---------------------------------------------------------------------------
// §5.3 useItem：Q 键使用当前选中格（G.selectedSlot）
// ---------------------------------------------------------------------------
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function useItem(G) {
  const p = G.player, w = G.world;
  if (!p || !w) return;
  const slot = inv[G.selectedSlot | 0];
  if (!slot || slot.n <= 0) { say(G, '这个格子是空的。'); return; }
  const d = DIRV[p.dir] || DIRV.down;
  const ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);

  switch (slot.id) {
    case 'food': {
      p.stamina = Math.min(100, (typeof p.stamina === 'number' ? p.stamina : 100) + 40);
      consume(slot);
      Audio.sfx('pickup');
      say(G, '吃掉了包子，体力恢复了不少。');
      return;
    }
    case 'drink': {
      p.stamina = Math.min(100, (typeof p.stamina === 'number' ? p.stamina : 100) + 25);
      consume(slot);
      Audio.sfx('pickup');
      say(G, '咕咚咕咚灌下一瓶汽水，凉快多了。');
      return;
    }
    case 'plank': {
      const tx = ptx + d[0], ty = pty + d[1];
      const blocked = w.solidTile(tx, ty) || w.objectAt(tx, ty) || w.barricadeAt(tx, ty) ||
        (G.enemy && Math.floor(G.enemy.x / TS) === tx && Math.floor(G.enemy.y / TS) === ty);
      if (blocked) { say(G, '这里放不了木板。'); return; }
      w.barricades.push({ tx, ty, x: tx * TS + 8, y: ty * TS + 8, hp: 3 });
      consume(slot);
      Audio.sfx('plank');
      say(G, '把木板架在了身前。');
      return;
    }
    case 'cracker': {
      // 投向玩家朝向 3 格处（遇墙/障碍则落在最近可达格）
      let tx = ptx, ty = pty;
      for (let i = 1; i <= 3; i++) {
        const nx = ptx + d[0] * i, ny = pty + d[1] * i;
        if (w.solidTile(nx, ny) || w.barricadeAt(nx, ny)) break;
        tx = nx; ty = ny;
      }
      w.crackers.push({ x: p.x, y: p.y, tx: tx * TS + 8, ty: ty * TS + 8, state: 'fly', t: 0 });
      consume(slot);
      say(G, '你把鞭炮扔了出去……');
      return;
    }
    case 'roomkey':
      say(G, '走到上锁的门前，按 E 使用房间钥匙。');
      return;
    case 'key':
      say(G, '集齐 3 把大门钥匙后，去东侧大铁门。');
      return;
    default:
      say(G, '这个东西现在用不上。');
  }
}
