// js/main.js — 《珠海剥皮人》启动与主循环（集成者，契约 §9）
// buildSprites() → initInput → requestAnimationFrame 主循环（dt 上限 50ms）。
import { G, setFactories } from './state.js';
import { buildSprites } from './sprites.js';
import { Audio } from './audio.js';
import { buildWorld, updateWorld } from './world.js';
import { resetInventory, inventory } from './items.js';
import { initInput, updateCamera, render } from './engine.js';
import { createPlayer, updatePlayer } from './player.js';
import { createEnemy, updateEnemy } from './enemy.js';
import {
  drawUI, drawMenu, drawHelp, drawPause, drawDeath, drawWin, handleMenuInput, drawJumpscare,
} from './ui.js';

// 工厂注入 state.js（state 不 import world/player/enemy/items，避免循环依赖）
setFactories({ buildWorld, createPlayer, createEnemy, resetInventory, inventory });

// ---------------------------------------------------------------------------
// 画布初始化：内部逻辑分辨率 426×240，CSS 整数倍放大填满窗口（留黑边）
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
canvas.width = G.W;
canvas.height = G.H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
G.canvas = canvas;
G.ctx = ctx;

function fitCanvas() {
  const ww = (typeof window !== 'undefined' && window.innerWidth) || G.W;
  const wh = (typeof window !== 'undefined' && window.innerHeight) || G.H;
  const s = Math.min(ww / G.W, wh / G.H);
  // 整数倍缩放优先（≥1x 尽可能大）；窗口不足 1x 时等比缩小保证可见
  const scale = s >= 1 ? Math.max(1, Math.floor(s)) : s;
  canvas.style.width = Math.round(G.W * scale) + 'px';
  canvas.style.height = Math.round(G.H * scale) + 'px';
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', fitCanvas);
}
fitCanvas();

// ---------------------------------------------------------------------------
// 资源与输入（buildSprites 幂等；initInput 在首次手势且 G.audioStarted
// 守门下自动 Audio.init + startAmbient）
// ---------------------------------------------------------------------------
buildSprites();
initInput(canvas, G);

// ---------------------------------------------------------------------------
// 画面白色闪烁（井盖传送/鞭炮爆响：world.flash>0，render 之后叠加）
// ---------------------------------------------------------------------------
function flashOverlay() {
  const w = G.world;
  const f = w ? w.flash : 0;
  if (f > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, f).toFixed(3) + ')';
    ctx.fillRect(0, 0, G.W, G.H);
  }
}

// ---------------------------------------------------------------------------
// 主循环：状态机分发
// ---------------------------------------------------------------------------
let last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

function frame(now) {
  requestAnimationFrame(frame);

  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;      // 时钟回拨/首帧保护
  if (dt > 0.05) dt = 0.05;   // dt 上限 50ms
  G.dt = dt;
  G.time += dt;
  G.frame++;

  // 底部消息计时
  if (G.msg.timer > 0) {
    G.msg.timer -= dt;
    if (G.msg.timer <= 0) { G.msg.timer = 0; G.msg.text = ''; }
  }

  switch (G.state) {
    case 'playing': {
      // Esc → 暂停（paused 侧的 Esc 由 ui.handleMenuInput 处理，避免双触发）
      if (G.pressed.Escape) {
        delete G.pressed.Escape;
        G.state = 'paused';
        try { Audio.sfx('click'); } catch (_) { /* 音频未初始化时静默 */ }
        break;
      }
      if (G.stats) G.stats.time += dt;
      updateWorld(G, dt);   // 噪音衰减 / 鞭炮 / flash 全靠它
      updatePlayer(G, dt);
      updateEnemy(G, dt);
      updateCamera(G);
      render(G);
      flashOverlay();
      drawUI(G);
      break;
    }
    case 'paused':
      handleMenuInput(G);
      render(G);            // render 仅绘制 playing/paused：场景作暂停背景
      flashOverlay();
      drawPause(G);
      break;
    case 'menu':
      handleMenuInput(G);
      drawMenu(G);
      break;
    case 'help':
      handleMenuInput(G);
      drawHelp(G);
      break;
    case 'jumpscare': {
      // 抓捕跳杀：约 1.8s 后自动进入死亡画面（回车可跳过，由 ui 处理）
      try { Audio.setTension(0); } catch (_) { /* 静默 */ }
      G.jumpscareT = (typeof G.jumpscareT === 'number' ? G.jumpscareT : 1.8) - dt;
      handleMenuInput(G);
      if (G.state === 'jumpscare' && G.jumpscareT <= 0) G.state = 'dead';
      if (G.state === 'jumpscare') drawJumpscare(G);
      else drawDeath(G);
      break;
    }
    case 'dead':
      try { Audio.setTension(0); } catch (_) { /* 静默 */ }
      handleMenuInput(G);
      drawDeath(G);
      break;
    case 'win':
      handleMenuInput(G);
      drawWin(G);
      break;
    default:
      G.state = 'menu';
      break;
  }

  // 兜底清空本帧 pressed（ui/player 各自消费后会 delete，这里清空残余）
  G.pressed = {};
}

requestAnimationFrame(frame);
