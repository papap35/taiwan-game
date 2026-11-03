// 遊戲場地圖：背景（地毯、牆壁）預先繪製；機台各自繪製成 sprite，燈光每格動畫
import { characterSprite } from './sprites.js';

export const TILE = 16;
export const WORLD_W = 40 * TILE;
export const WORLD_H = 26 * TILE;
export const WALL_H = 3 * TILE;
export const PIXEL_FONT = '"DotGothic16", "Noto Sans TC", monospace';

function R(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// 製作 sprite 時把文字收集起來，改在畫面縮放後才繪製（保持清晰）
let collecting = null;

function text(ctx, str, x, y, opts = {}) {
  if (collecting) {
    collecting.push({ str, x, y, opts });
    return;
  }
  const { size = 7, color = '#fff', align = 'center', stroke = null, bold = false } = opts;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${PIXEL_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = Math.max(1, size / 4);
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

const NEON = ['#ff4fa3', '#41e8ff', '#ffe14f', '#7dff6a', '#b07bff', '#ff8a3d'];

// ---------------- 機台 sprite ----------------
const machineDraw = {
  'coin-pusher'(ctx, w) {
    R(ctx, 2, 20, w - 4, 26, '#b8322a');
    R(ctx, 2, 20, 3, 26, '#8e2119');
    R(ctx, w - 5, 20, 3, 26, '#8e2119');
    R(ctx, 4, 6, w - 8, 16, '#1d2c50');
    R(ctx, 5, 7, w - 10, 3, '#c9d6e8');
    R(ctx, 8, 10, w - 16, 3, '#9aa9bf');
    const rnd = seeded(7);
    for (let i = 0; i < 46; i++) {
      const x = 6 + Math.floor(rnd() * (w - 14));
      const y = 13 + Math.floor(rnd() * 8);
      R(ctx, x, y, 3, 2, rnd() > 0.3 ? '#f6c544' : '#d39a1c');
    }
    R(ctx, 3, 4, w - 6, 2, '#ffd36b');
    R(ctx, 0, 0, w, 6, '#ffcf3a');
    R(ctx, 0, 5, w, 1, '#c8901a');
    text(ctx, '推金幣', w / 2, 3.2, { size: 6, color: '#7a1e10', bold: true });
    R(ctx, 10, 32, w - 20, 7, '#1a1a1a');
    R(ctx, 12, 35, w - 24, 2, '#f6c544');
    R(ctx, 8, 24, 6, 4, '#2b2b2b');
    R(ctx, w - 14, 24, 6, 4, '#2b2b2b');
    R(ctx, 10, 25, 2, 2, '#ffe14f');
    R(ctx, w - 12, 25, 2, 2, '#ffe14f');
  },
  claw(ctx, w) {
    R(ctx, 2, 32, w - 4, 16, '#e0558f');
    R(ctx, 2, 32, 2, 16, '#b83c70');
    R(ctx, 5, 35, w - 10, 4, '#7a1e48');
    R(ctx, 8, 41, 2, 4, '#555');
    R(ctx, 7, 39, 4, 3, '#ff3b3b');
    R(ctx, w - 12, 41, 5, 3, '#ffe14f');
    R(ctx, 2, 6, w - 4, 27, '#e0558f');
    R(ctx, 4, 8, w - 8, 24, '#a9e3ff');
    R(ctx, 4, 8, 3, 24, '#d6f3ff');
    const cols = ['#ffb3c7', '#ffe08a', '#9ee6a8', '#b8a9ff', '#ffd1a1', '#8fd3ff'];
    const rnd = seeded(3);
    for (let i = 0; i < 12; i++) {
      const x = 5 + Math.floor(rnd() * (w - 14));
      const y = 24 + Math.floor(rnd() * 5);
      const c = cols[i % cols.length];
      R(ctx, x, y, 5, 4, c);
      R(ctx, x, y - 1, 1, 1, c);
      R(ctx, x + 4, y - 1, 1, 1, c);
      R(ctx, x + 1, y + 1, 1, 1, '#333');
      R(ctx, x + 3, y + 1, 1, 1, '#333');
    }
    R(ctx, w - 10, 26, 6, 6, '#7ec8e3');
    R(ctx, 4, 9, w - 8, 1, '#888');
    R(ctx, 14, 9, 1, 8, '#bbb');
    R(ctx, 12, 17, 5, 2, '#ccc');
    R(ctx, 11, 19, 1, 2, '#ccc');
    R(ctx, 17, 19, 1, 2, '#ccc');
    R(ctx, 0, 0, w, 7, '#ff6fae');
    text(ctx, '夾娃娃', w / 2, 3.7, { size: 6, color: '#fff', bold: true, stroke: '#a12a5e' });
  },
  marie(ctx, w) {
    R(ctx, 3, 6, w - 6, 40, '#5e35b1');
    R(ctx, 3, 6, 2, 40, '#4527a0');
    R(ctx, 5, 9, w - 10, 20, '#120a24');
    const fruits = ['#e53935', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#1e88e5'];
    for (let i = 0; i < 6; i++) R(ctx, 9 + (i % 3) * 5, 14 + Math.floor(i / 3) * 6, 3, 3, fruits[i]);
    R(ctx, 4, 30, w - 8, 6, '#311b92');
    for (let i = 0; i < 6; i++) R(ctx, 6 + i * 3.5, 32, 2, 2, fruits[i]);
    R(ctx, 8, 38, w - 16, 3, '#222');
    R(ctx, 0, 0, w, 7, '#ffd54f');
    text(ctx, '小瑪莉', w / 2, 3.7, { size: 6, color: '#4a148c', bold: true });
  },
  pinball(ctx, w) {
    R(ctx, 4, 40, 2, 6, '#333');
    R(ctx, w - 6, 40, 2, 6, '#333');
    R(ctx, 2, 14, w - 4, 28, '#263238');
    R(ctx, 4, 16, w - 8, 24, '#0d47a1');
    R(ctx, 4, 16, w - 8, 1, '#64b5f6');
    const bump = [[10, 21], [18, 21], [14, 26]];
    for (const [x, y] of bump) {
      R(ctx, x - 2, y - 1, 5, 3, '#ff5252');
      R(ctx, x - 1, y - 2, 3, 5, '#ff5252');
      R(ctx, x, y, 1, 1, '#fff');
    }
    R(ctx, 9, 35, 5, 2, '#ffeb3b');
    R(ctx, w - 14, 35, 5, 2, '#ffeb3b');
    R(ctx, w - 7, 18, 2, 20, '#37474f');
    R(ctx, 2, 0, w - 4, 15, '#37474f');
    R(ctx, 4, 2, w - 8, 11, '#1a1a1a');
    text(ctx, '彈珠台', w / 2, 7.5, { size: 6, color: '#ffeb3b', bold: true });
  },
  whack(ctx, w) {
    R(ctx, 2, 16, w - 4, 26, '#ef6c00');
    R(ctx, 2, 16, 2, 26, '#c75400');
    R(ctx, 2, 9, w - 4, 9, '#ffa726');
    for (let i = 0; i < 6; i++) {
      const x = 5 + (i % 3) * 8, y = 10 + Math.floor(i / 3) * 4;
      R(ctx, x, y, 6, 3, '#3e2723');
    }
    R(ctx, 6, 24, w - 12, 8, '#fff3e0');
    text(ctx, '打地鼠', w / 2, 28, { size: 6, color: '#bf360c', bold: true });
    R(ctx, 4, 0, w - 8, 9, '#6d4c41');
    R(ctx, 5, 1, w - 10, 7, '#8d6e63');
    R(ctx, 12, 3, 8, 4, '#a1887f');
    R(ctx, 13, 4, 1, 1, '#000');
    R(ctx, 18, 4, 1, 1, '#000');
    R(ctx, w - 6, 18, 3, 10, '#8d6e63');
    R(ctx, w - 8, 15, 7, 4, '#d84315');
  },
  basketball(ctx, w) {
    R(ctx, 3, 22, w - 6, 40, '#5d4037');
    R(ctx, 5, 24, w - 10, 34, '#c8a165');
    for (let y = 26; y < 58; y += 4) R(ctx, 5, y, w - 10, 1, '#b08850');
    R(ctx, 3, 22, 2, 40, '#3e2723');
    R(ctx, w - 5, 22, 2, 40, '#3e2723');
    R(ctx, 2, 10, 1, 14, '#888');
    R(ctx, w - 3, 10, 1, 14, '#888');
    R(ctx, 6, 2, w - 12, 15, '#fafafa');
    R(ctx, 6, 2, w - 12, 1, '#bbb');
    R(ctx, 12, 7, 8, 6, '#e53935');
    R(ctx, 13, 8, 6, 4, '#fafafa');
    R(ctx, 11, 16, 10, 2, '#ff6d00');
    for (let i = 0; i < 5; i++) R(ctx, 12 + i * 2, 18, 1, 4, '#eee');
    for (const [x, y] of [[9, 50], [16, 52], [22, 49], [13, 55]]) {
      R(ctx, x, y, 4, 4, '#f57c00');
      R(ctx, x + 1, y, 1, 4, '#5d2a00');
    }
    R(ctx, 0, 0, w, 3, '#d32f2f');
    R(ctx, 3, 30, w - 6, 5, '#212121');
    text(ctx, '投籃機', w / 2, 32.6, { size: 5, color: '#ff5252', bold: true });
  },
};

const otherDraw = {
  counter(ctx, w) {
    R(ctx, 0, 14, w, 22, '#8d5a2b');
    R(ctx, 0, 14, w, 3, '#b07a43');
    R(ctx, 0, 34, w, 2, '#5d3a1a');
    R(ctx, 6, 19, w - 12, 12, '#bfe9ff');
    R(ctx, 6, 19, w - 12, 1, '#fff');
    const icons = ['#ffcc33', '#e84a5f', '#4ea8ff', '#c26dff', '#3ec46d', '#ff8a3d'];
    for (let i = 0; i < 10; i++) {
      const x = 10 + i * ((w - 24) / 9);
      R(ctx, x, 24, 5, 5, icons[i % icons.length]);
      R(ctx, x + 1, 25, 3, 3, '#fff8');
    }
    R(ctx, w / 2 - 22, 0, 44, 10, '#d32f2f');
    R(ctx, w / 2 - 21, 1, 42, 8, '#e53935');
    text(ctx, '彩票兌換中心', w / 2, 5.3, { size: 6, color: '#fff59d', bold: true });
  },
  tokenMachine(ctx, w) {
    R(ctx, 2, 4, w - 4, 38, '#1565c0');
    R(ctx, 2, 4, 2, 38, '#0d47a1');
    R(ctx, 5, 8, w - 10, 10, '#0a1a3a');
    text(ctx, '代幣', w / 2, 13.3, { size: 6, color: '#ffe14f', bold: true });
    R(ctx, w / 2 - 4, 22, 8, 8, '#ffcc33');
    R(ctx, w / 2 - 2, 24, 4, 4, '#e0a800');
    R(ctx, 6, 33, w - 12, 5, '#111');
    R(ctx, 0, 0, w, 5, '#42a5f5');
  },
  vending(ctx, w) {
    R(ctx, 1, 0, w - 2, 42, '#c62828');
    R(ctx, 3, 3, w - 9, 26, '#e3f2fd');
    const c = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292'];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) R(ctx, 5 + i * 5, 5 + r * 6, 3, 5, c[(r + i) % 4]);
    R(ctx, w - 6, 6, 3, 14, '#424242');
    R(ctx, 3, 32, w - 9, 6, '#212121');
  },
  board(ctx, w) {
    R(ctx, 0, 0, w, 26, '#5d4037');
    R(ctx, 2, 2, w - 4, 22, '#1b2a1b');
    text(ctx, '🏆 排行榜', w / 2, 7, { size: 6, color: '#ffd54f', bold: true });
    for (let i = 0; i < 3; i++) {
      R(ctx, 6, 12 + i * 4, 4, 2, ['#ffd54f', '#cfd8dc', '#d7a46b'][i]);
      R(ctx, 12, 12 + i * 4, w - 22 - i * 5, 2, '#a5d6a7');
    }
  },
  cork(ctx, w) {
    R(ctx, 0, 0, w, 24, '#8d6e63');
    R(ctx, 2, 2, w - 4, 20, '#d7a86e');
    const notes = [['#fff59d', 4, 8], ['#80deea', 14, 5], ['#f48fb1', 24, 9], ['#c5e1a5', 34, 6]];
    for (const [c, x, y] of notes) {
      R(ctx, x, y, 8, 8, c);
      R(ctx, x + 3, y, 2, 1, '#e53935');
    }
    text(ctx, '好友・群組', w / 2, 19, { size: 5, color: '#4e342e', bold: true });
  },
  sofa(ctx, w) {
    R(ctx, 0, 4, w, 12, '#7b1fa2');
    R(ctx, 0, 0, w, 6, '#9c27b0');
    R(ctx, 0, 4, 4, 12, '#6a1b9a');
    R(ctx, w - 4, 4, 4, 12, '#6a1b9a');
    R(ctx, 4, 8, w - 8, 1, '#8e24aa');
  },
  plant(ctx) {
    R(ctx, 3, 12, 10, 8, '#8d6e63');
    R(ctx, 3, 12, 10, 2, '#a1887f');
    const leaves = [[2, 6], [8, 2], [5, 0], [10, 7], [0, 3], [6, 8]];
    for (const [x, y] of leaves) R(ctx, x, y, 6, 5, '#2e7d32');
    for (const [x, y] of leaves.slice(0, 3)) R(ctx, x + 1, y + 1, 3, 2, '#43a047');
  },
  table(ctx, w) {
    R(ctx, 0, 0, w, 10, '#795548');
    R(ctx, 0, 0, w, 2, '#a1887f');
    R(ctx, 3, 10, 2, 6, '#4e342e');
    R(ctx, w - 5, 10, 2, 6, '#4e342e');
    R(ctx, w / 2 - 3, 2, 6, 5, '#fff');
    R(ctx, w / 2 - 2, 3, 4, 3, '#a0522d');
  },
};

function makeSprite(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  collecting = [];
  fn(ctx, w, h);
  c.labels = collecting;
  collecting = null;
  return c;
}

/** 繪製 sprite 上的文字標籤（在已縮放的 ctx 上） */
export function drawLabels(ctx, labels, ox = 0, oy = 0) {
  for (const l of labels) text(ctx, l.str, ox + l.x, oy + l.y, l.opts);
}

/**
 * 物件：x,y,w,h 為 sprite 在世界中的位置（像素）
 * solid: 碰撞區（相對 sprite），interact: 互動類型
 */
export function buildObjects() {
  const T = TILE;
  const objs = [];
  const machine = (id, tx, ty, w, h) => objs.push({
    kind: 'machine', gameId: id, x: tx * T, y: ty * T, w, h,
    solid: { x: 0, y: h - 22, w, h: 22 }, sprite: makeSprite(w, h, (ctx) => machineDraw[id](ctx, w, h)),
  });
  machine('coin-pusher', 3, 4, 48, 46);
  machine('claw', 8, 4, 32, 48);
  machine('claw', 11, 4, 32, 48); // 兩台夾娃娃機比較有感覺
  machine('marie', 14, 4, 32, 46);
  machine('pinball', 3, 12, 32, 46);
  machine('whack', 7, 12, 32, 42);
  machine('basketball', 11, 11, 32, 62);
  machine('basketball', 14, 11, 32, 62);
  machine('pinball', 18, 12, 32, 46);
  machine('marie', 18, 4, 32, 46);
  machine('coin-pusher', 3, 19, 48, 46);
  machine('whack', 8, 19, 32, 42);

  const other = (type, kind, x, y, w, h, solidH = h, extra = {}) => objs.push({
    kind, x, y, w, h, solid: { x: 0, y: h - solidH, w, h: solidH },
    sprite: makeSprite(w, h, (ctx) => otherDraw[type](ctx, w, h)), ...extra,
  });
  other('counter', 'shop', 25 * T, 6 * T, 112, 36, 22);
  other('tokenMachine', 'wallet', 22 * T, 3 * T + 4, 24, 44, 20);
  other('vending', 'vending', 37 * T, 3 * T, 24, 42, 20);
  other('board', 'leaderboard', 30 * T, 4, 48, 26, 0, { wall: true });
  other('cork', 'social', 22 * T + 8, 14 * T, 44, 24, 0, { wall: false, solid: { x: 0, y: 14, w: 44, h: 10 } });
  other('sofa', 'deco', 27 * T, 17 * T, 48, 16);
  other('sofa', 'deco', 33 * T, 17 * T, 48, 16);
  other('table', 'deco', 30 * T + 8, 17 * T + 2, 24, 16);
  for (const [x, y] of [[1, 3], [20, 3], [24, 13], [38, 13], [1, 23], [38, 23], [20, 23]]) other('plant', 'deco', x * T, y * T - 4, 16, 20, 8);
  // 兌換櫃台後面的店員
  objs.push({ kind: 'npc', x: 31 * T + 2, y: 5 * T - 4, w: 12, h: 25, solid: null, npc: { color: '#e53935', hat: 'cap', dir: 'down' } });
  return objs;
}

/** 預先繪製背景（地毯 + 牆壁 + 牆面裝飾） */
export function renderBackground() {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const ctx = c.getContext('2d');
  collecting = [];
  const rnd = seeded(42);
  // 地毯
  R(ctx, 0, 0, WORLD_W, WORLD_H, '#1c1240');
  for (let ty = 0; ty < WORLD_H / TILE; ty++) {
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      const x = tx * TILE, y = ty * TILE;
      R(ctx, x, y, TILE, TILE, (tx + ty) % 2 ? '#1c1240' : '#20154a');
      for (let i = 0; i < 2; i++) {
        if (rnd() < 0.35) continue;
        const c2 = NEON[Math.floor(rnd() * NEON.length)];
        const px = x + Math.floor(rnd() * 13), py = y + Math.floor(rnd() * 13);
        const shape = Math.floor(rnd() * 3);
        ctx.globalAlpha = 0.3;
        if (shape === 0) {
          R(ctx, px, py + 1, 3, 1, c2);
          R(ctx, px + 1, py, 1, 3, c2);
        } else if (shape === 1) {
          R(ctx, px, py, 2, 2, c2);
        } else {
          R(ctx, px, py, 1, 1, c2);
          R(ctx, px + 1, py + 1, 1, 1, c2);
          R(ctx, px + 2, py, 1, 1, c2);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
  // 休息區地板（木地板）
  for (let y = 12 * TILE; y < 20 * TILE; y += 4) {
    R(ctx, 24 * TILE, y, 15 * TILE, 4, (y / 4) % 2 ? '#6d4c41' : '#795548');
    for (let x = 24 * TILE + ((y / 4) % 3) * 10; x < 39 * TILE; x += 30) R(ctx, x, y, 1, 4, '#4e342e');
  }
  // 牆
  R(ctx, 0, 0, WORLD_W, WALL_H, '#2a1f4d');
  for (let x = 0; x < WORLD_W; x += 32) {
    R(ctx, x, 0, 31, WALL_H - 6, '#30245a');
    R(ctx, x, 0, 31, 2, '#3a2c6b');
  }
  R(ctx, 0, WALL_H - 6, WORLD_W, 6, '#160e30');
  R(ctx, 0, WALL_H - 7, WORLD_W, 1, '#ff4fa3');
  // 霓虹招牌
  const sx = 4 * TILE, sw = 14 * TILE;
  R(ctx, sx, 6, sw, 30, '#0c0620');
  text(ctx, '★ 懷舊遊樂場 ★', sx + sw / 2, 21, { size: 14, color: '#ffd1ec', bold: true, stroke: '#ff4fa3' });
  // 窗戶
  for (const wx of [20 * TILE + 8, 26 * TILE]) {
    R(ctx, wx, 8, 28, 22, '#3a2c6b');
    R(ctx, wx + 2, 10, 24, 18, '#0b1d3a');
    R(ctx, wx + 13, 10, 2, 18, '#3a2c6b');
    R(ctx, wx + 4, 13, 1, 1, '#fff');
    R(ctx, wx + 20, 16, 1, 1, '#ffe14f');
    R(ctx, wx + 8, 22, 1, 1, '#fff');
  }
  // 兌換中心後方的獎品架
  const shelfX = 25 * TILE, shelfW = 7 * TILE;
  R(ctx, shelfX, WALL_H - 2, shelfW, 52, '#4e342e');
  for (let r = 0; r < 3; r++) {
    const y = WALL_H + r * 16;
    R(ctx, shelfX + 2, y + 12, shelfW - 4, 3, '#8d6e63');
    for (let i = 0; i < 9; i++) {
      const c2 = ['#ffb3c7', '#ffe08a', '#9ee6a8', '#b8a9ff', '#ffd1a1', '#8fd3ff'][(i + r) % 6];
      const px = shelfX + 6 + i * 12;
      R(ctx, px, y + 4, 8, 8, c2);
      R(ctx, px, y + 2, 2, 2, c2);
      R(ctx, px + 6, y + 2, 2, 2, c2);
      R(ctx, px + 2, y + 6, 1, 1, '#333');
      R(ctx, px + 5, y + 6, 1, 1, '#333');
    }
  }
  // 入口
  const dx = 18 * TILE;
  R(ctx, dx, WORLD_H - 10, 4 * TILE, 10, '#3e2723');
  R(ctx, dx + 4, WORLD_H - 8, 4 * TILE - 8, 8, '#c62828');
  text(ctx, '入口', dx + 2 * TILE, WORLD_H - 4, { size: 6, color: '#fff' });
  // 邊框牆
  R(ctx, 0, WALL_H, 4, WORLD_H - WALL_H, '#160e30');
  R(ctx, WORLD_W - 4, WALL_H, 4, WORLD_H - WALL_H, '#160e30');
  R(ctx, 0, WORLD_H - 4, dx, 4, '#160e30');
  R(ctx, dx + 4 * TILE, WORLD_H - 4, WORLD_W - dx - 4 * TILE, 4, '#160e30');
  c.labels = collecting;
  collecting = null;
  return c;
}

/** 機台的動態燈光 */
export function drawMachineLights(ctx, o, t) {
  const { x, y, w } = o;
  const phase = Math.floor(t * 6);
  const n = Math.floor(w / 4);
  for (let i = 0; i < n; i++) {
    const on = (i + phase) % 3 === 0;
    ctx.fillStyle = on ? NEON[(i + Math.floor(t * 2)) % NEON.length] : '#3a2a50';
    ctx.fillRect(x + 1 + i * 4, y - 2, 2, 2);
  }
  if (o.gameId === 'marie') {
    const k = Math.floor(t * 10) % 12;
    const px = [0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0, 0][k], py = [0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 2, 1][k];
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 7 + px * 5, y + 11 + py * 4.5, 2, 2);
  }
  if (o.gameId === 'whack') {
    const k = Math.floor(t * 3) % 6;
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(x + 6 + (k % 3) * 8, y + 8 + Math.floor(k / 3) * 4, 4, 3);
  }
}

export function drawNpc(ctx, o, t) {
  const spr = characterSprite({ ...o.npc, frame: 0 });
  ctx.drawImage(spr, o.x, o.y + (Math.floor(t * 2) % 2));
}

export { text as drawText };
