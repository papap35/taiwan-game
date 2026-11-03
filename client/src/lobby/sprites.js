// 像素角色：以字元圖定義，依衣服顏色 / 帽子 / 方向 / 步伐快取成離屏 canvas

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}

const HEAD_FRONT = [
  '....hhhh....',
  '...hhhhhh...',
  '..hhhhhhhh..',
  '..hhsssshh..',
  '..hssssssh..',
  '..sesssses..',
  '..ssssssss..',
  '...ssmmss...',
  '....ssss....',
];
const HEAD_BACK = [
  '....hhhh....',
  '...hhhhhh...',
  '..hhhhhhhh..',
  '..hhhhhhhh..',
  '..hhhhhhhh..',
  '..hhhhhhhh..',
  '..shhhhhhs..',
  '...ssssss...',
  '....ssss....',
];
const HEAD_SIDE = [
  '....hhhh....',
  '...hhhhhh...',
  '..hhhhhhhh..',
  '..hhhhssss..',
  '..hhhsssss..',
  '..hhssssess.',
  '..hsssssss..',
  '...ssssssm..',
  '....ssss....',
];
const BODY_FRONT = [
  '..cccccccc..',
  '.scccccccccs',
  '.sccccccccs.',
  '.sccccccccs.',
  '..dddddddd..',
  '..pppppppp..',
];
const BODY_SIDE = [
  '...cccccc...',
  '...cccscc...',
  '...cccscc...',
  '...cccssc...',
  '...dddddd...',
  '...pppppp...',
];
const LEGS = {
  front: [
    ['..ppp..ppp..', '..ppp..ppp..', '..bbb..bbb..'],
    ['..ppp..ppp..', '..bbb..ppp..', '.......bbb..'],
    ['..ppp..ppp..', '..ppp..bbb..', '..bbb.......'],
  ],
  side: [
    ['...pp..pp...', '...pp..pp...', '...bb..bbb..'],
    ['..pp....pp..', '.pp......pp.', '.bb......bbb'],
    ['....pppp....', '....pppp....', '....bbbb....'],
  ],
};

const HATS = {
  cap: { rows: ['...kkkkkk...', '..kkkkkkkk..', '..kkkkkkkkkk'], colors: { k: '#d63031' }, offset: -1 },
  bamboo: { rows: ['.....yy.....', '...yyyyyy...', '.yyyyyyyyyy.', 'yyyyyyyyyyyy'], colors: { y: '#d9b46a' }, offset: -3 },
  crown: { rows: ['..y..yy..y..', '..yy.yy.yy..', '..yyyyyyyy..', '..yryyyyry..'], colors: { y: '#ffcc33', r: '#e84a5f' }, offset: -3 },
};

export const CHAR_W = 12;
export const CHAR_H = 21;
const HAT_SPACE = 4;

const cache = new Map();

function paint(ctx, rows, ox, oy, pal, mirror = false) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(mirror ? ox + row.length - 1 - x : ox + x, oy + y, 1, 1);
    }
  });
}

/** 取得角色 canvas（寬 12，高 21+4，帽子空間在上方） */
export function characterSprite({ color = '#3d7bfd', hat = null, dir = 'down', frame = 0, skin = '#f7c9a0', hair = '#2b1d14' }) {
  const key = `${color}|${hat}|${dir}|${frame}|${skin}|${hair}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = CHAR_W;
  c.height = CHAR_H + HAT_SPACE;
  const ctx = c.getContext('2d');
  const pal = {
    h: hair, s: skin, e: '#1a1a2e', m: '#c0392b', c: color, d: shade(color, -0.18),
    p: '#2d3561', b: '#1b1b1b', w: '#ffffff',
  };
  const side = dir === 'left' || dir === 'right';
  const mirror = dir === 'left';
  const head = dir === 'up' ? HEAD_BACK : side ? HEAD_SIDE : HEAD_FRONT;
  const body = side ? BODY_SIDE : BODY_FRONT;
  const legs = LEGS[side ? 'side' : 'front'][frame % 3];
  const bob = frame === 0 ? 0 : 1;
  const top = HAT_SPACE;
  paint(ctx, legs, 0, top + 15, pal, mirror);
  paint(ctx, body, 0, top + 9 + bob, pal, mirror);
  paint(ctx, head, 0, top + bob, pal, mirror);
  if (hat && HATS[hat]) {
    const h = HATS[hat];
    paint(ctx, h.rows, 0, top + bob + h.offset, h.colors, mirror && hat === 'cap');
  }
  cache.set(key, c);
  return c;
}

/** 在一般（非像素縮放）canvas 上畫大型角色預覽 */
export function drawCharacterPreview(canvas, { color, hat }) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const spr = characterSprite({ color, hat, dir: 'down' });
  const s = Math.floor(Math.min(canvas.width / spr.width, canvas.height / spr.height));
  ctx.drawImage(spr, (canvas.width - spr.width * s) / 2, (canvas.height - spr.height * s) / 2, spr.width * s, spr.height * s);
}
