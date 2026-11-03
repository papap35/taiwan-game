import { store } from '../store.js';
import { el, $, isModalOpen, toast, esc } from '../ui/dom.js';
import { characterSprite, CHAR_W } from './sprites.js';
import { TILE, WORLD_W, WORLD_H, WALL_H, buildObjects, renderBackground, drawMachineLights, drawNpc, drawText, drawLabels, PIXEL_FONT } from './world.js';
import { launchGame } from '../games/runner.js';
import { sfx } from '../games/audio.js';

const SPEED = 78; // px / 秒
const FEET = { w: 8, h: 5 };
const SPAWN = { x: 20 * TILE, y: 22 * TILE };

const LABELS = {
  shop: '兌換獎品',
  wallet: '代幣機・每日簽到',
  leaderboard: '查看排行榜',
  social: '好友・群組佈告欄',
  vending: '自動販賣機',
};

const VENDING_LINES = ['叮咚～掉出一瓶彈珠汽水 🥤', '叮咚～是麥香紅茶！🧃', '叮咚～蘆筍汁，好懷念 🥫', '機器吃了你的零錢…騙你的啦 😆'];

export class Lobby {
  constructor(root, socket) {
    this.socket = socket;
    this.objects = buildObjects();
    this.bg = renderBackground();
    this.others = new Map();
    this.bubbles = new Map();
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.paused = false;
    const saved = (() => {
      try {
        return JSON.parse(sessionStorage.getItem('lobby.pos'));
      } catch {
        return null;
      }
    })();
    this.me = { x: saved?.x ?? SPAWN.x, y: saved?.y ?? SPAWN.y, dir: saved?.dir || 'up', moving: false, anim: 0 };
    if (this.collides(this.me.x, this.me.y)) Object.assign(this.me, SPAWN);

    this.el = el(`
      <div class="lobby">
        <canvas class="lobby-canvas"></canvas>
        <div class="prompt hidden"></div>
        <div class="lobby-online"></div>
        <form class="lobby-say"><input maxlength="60" placeholder="按 Enter 在遊戲場說話…" enterkeyhint="send"></form>
        <div class="touch-ui">
          <div class="joystick"><div class="stick"></div></div>
          <button class="action-btn" aria-label="互動">A</button>
        </div>
      </div>`);
    root.appendChild(this.el);
    this.canvas = $('.lobby-canvas', this.el);
    this.ctx = this.canvas.getContext('2d');
    this.promptEl = $('.prompt', this.el);
    this.sayForm = $('.lobby-say', this.el);
    this.sayInput = $('input', this.sayForm);

    this.bind();
    this.resize();
    this.joinLobby();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- 網路 ----------
  joinLobby() {
    const s = this.socket;
    const join = () => s.emit('lobby:join', { x: this.me.x, y: this.me.y, dir: this.me.dir });
    this.handlers = {
      connect: join,
      'lobby:state': (list) => {
        this.others.clear();
        for (const p of list) this.others.set(p.id, { ...p, rx: p.x, ry: p.y, anim: 0 });
        this.updateOnline();
      },
      'lobby:join': (p) => {
        this.others.set(p.id, { ...p, rx: p.x, ry: p.y, anim: 0 });
        this.updateOnline();
      },
      'lobby:leave': ({ id }) => {
        this.others.delete(id);
        this.updateOnline();
      },
      'lobby:move': (m) => {
        const o = this.others.get(m.id);
        if (o) Object.assign(o, { x: m.x, y: m.y, dir: m.dir, moving: m.moving });
      },
      'lobby:update': (u) => {
        const o = this.others.get(u.id);
        if (o) Object.assign(o, u);
      },
      'lobby:status': ({ id, status }) => {
        const o = this.others.get(id);
        if (o) o.status = status;
      },
      'lobby:say': ({ id, text }) => {
        this.bubbles.set(id, { text, until: performance.now() + 5000 });
        if (id !== store.me.id) sfx.tick();
      },
    };
    for (const [ev, fn] of Object.entries(this.handlers)) s.on(ev, fn);
    if (s.connected) join();
  }

  updateOnline() {
    $('.lobby-online', this.el).innerHTML = `<span class="dot-online static"></span> 遊戲場內 ${this.others.size + 1} 人`;
  }

  // ---------- 輸入 ----------
  bind() {
    this.onKeyDown = (e) => {
      if (this.paused || isModalOpen()) return;
      if (document.activeElement === this.sayInput) {
        if (e.key === 'Escape') this.sayInput.blur();
        return;
      }
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'enter') {
        e.preventDefault();
        this.sayInput.focus();
        return;
      }
      if (k === 'e' || k === ' ') {
        e.preventDefault();
        this.interact();
        return;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        e.preventDefault();
        this.keys.add(k);
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    this.onBlur = () => this.keys.clear();
    this.onResize = () => this.resize();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);

    this.sayForm.onsubmit = (e) => {
      e.preventDefault();
      const t = this.sayInput.value.trim();
      if (t) this.socket.emit('lobby:say', t);
      this.sayInput.value = '';
      this.sayInput.blur();
    };

    // 點擊其他玩家 → 個人檔案；點擊互動物件 → 互動（若在附近）
    this.canvas.addEventListener('click', (e) => {
      sfx.unlock();
      const r = this.canvas.getBoundingClientRect();
      const wx = (e.clientX - r.left) / this.scale + this.cam.x;
      const wy = (e.clientY - r.top) / this.scale + this.cam.y;
      for (const o of this.others.values()) {
        if (wx >= o.rx - 7 && wx <= o.rx + 7 && wy >= o.ry - 26 && wy <= o.ry + 2) {
          store.openPanel('profile', o.id);
          return;
        }
      }
      const near = this.nearest();
      if (near && wx >= near.x && wx <= near.x + near.w && wy >= near.y && wy <= near.y + near.h) this.interact();
    });

    // 搖桿
    const joy = $('.joystick', this.el), stick = $('.stick', this.el);
    let joyId = null, cx = 0, cy = 0;
    const R = 40;
    joy.addEventListener('pointerdown', (e) => {
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / R, y: dy / R };
    };
    joy.addEventListener('pointermove', move);
    const end = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      stick.style.transform = '';
      this.joy = { x: 0, y: 0 };
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
    $('.action-btn', this.el).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      this.interact();
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    // 依螢幕大小選擇整數縮放倍率，讓像素保持銳利
    const target = Math.min(w / 380, h / 250);
    this.scale = Math.max(2, Math.round(target * dpr)) / dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this.viewW = w / this.scale;
    this.viewH = h / this.scale;
  }

  // ---------- 物理 ----------
  collides(x, y) {
    const fx = x - FEET.w / 2, fy = y - FEET.h;
    if (fx < 6 || fx + FEET.w > WORLD_W - 6 || fy < WALL_H || fy + FEET.h > WORLD_H - 6) return true;
    for (const o of this.objects) {
      const s = o.solid;
      if (!s || !s.h) continue;
      const sx = o.x + s.x, sy = o.y + s.y;
      if (fx < sx + s.w && fx + FEET.w > sx && fy < sy + s.h && fy + FEET.h > sy) return true;
    }
    return false;
  }

  /** 最近可互動物件 */
  nearest() {
    let best = null, bestD = Infinity;
    const { x, y } = this.me;
    for (const o of this.objects) {
      if (o.kind === 'deco' || o.kind === 'npc') continue;
      const s = o.solid?.h ? o.solid : { x: 0, y: 0, w: o.w, h: o.h };
      const sx = o.x + s.x, sy = o.y + s.y;
      const dx = Math.max(sx - x, 0, x - (sx + s.w));
      const dy = Math.max(sy - y, 0, y - FEET.h - (sy + s.h));
      const d = Math.hypot(dx, dy);
      const limit = o.kind === 'leaderboard' ? 30 : o.kind === 'shop' ? 16 : 12;
      if (d < limit && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  interact() {
    const o = this.nearest();
    if (!o) return;
    sfx.click();
    if (o.kind === 'machine') {
      this.keys.clear();
      launchGame(o.gameId, {
        onEnter: () => this.pause(store.game(o.gameId).name),
        onExit: () => this.resume(),
      });
    } else if (o.kind === 'shop') store.openPanel('shop');
    else if (o.kind === 'wallet') store.openPanel('wallet');
    else if (o.kind === 'leaderboard') store.openPanel('leaderboard');
    else if (o.kind === 'social') store.openPanel('friends');
    else if (o.kind === 'vending') {
      sfx.thud();
      toast(VENDING_LINES[Math.floor(Math.random() * VENDING_LINES.length)]);
    }
  }

  pause(gameName) {
    this.paused = true;
    this.keys.clear();
    this.socket.emit('lobby:status', `🎮 ${gameName}`);
    cancelAnimationFrame(this.raf);
  }

  resume() {
    this.paused = false;
    this.socket.emit('lobby:status', '');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {
    let vx = 0, vy = 0;
    const k = this.keys;
    if (!isModalOpen()) {
      if (k.has('arrowleft') || k.has('a')) vx -= 1;
      if (k.has('arrowright') || k.has('d')) vx += 1;
      if (k.has('arrowup') || k.has('w')) vy -= 1;
      if (k.has('arrowdown') || k.has('s')) vy += 1;
      if (Math.abs(this.joy.x) > 0.2 || Math.abs(this.joy.y) > 0.2) {
        vx = this.joy.x;
        vy = this.joy.y;
      }
    }
    const len = Math.hypot(vx, vy);
    const me = this.me;
    const wasMoving = me.moving;
    me.moving = len > 0.01;
    if (me.moving) {
      if (len > 1) {
        vx /= len;
        vy /= len;
      }
      me.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      const nx = me.x + vx * SPEED * dt, ny = me.y + vy * SPEED * dt;
      if (!this.collides(nx, me.y)) me.x = nx;
      if (!this.collides(me.x, ny)) me.y = ny;
      const prev = Math.floor(me.anim);
      me.anim += dt * 8;
      if (Math.floor(me.anim) !== prev && Math.floor(me.anim) % 2 === 0) sfx.step();
    }
    const now = performance.now();
    if ((me.moving || wasMoving) && (!this.lastSent || now - this.lastSent > 60)) {
      this.lastSent = now;
      this.socket.emit('lobby:move', { x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: me.moving });
      try {
        sessionStorage.setItem('lobby.pos', JSON.stringify({ x: me.x, y: me.y, dir: me.dir }));
      } catch {
        /* ignore */
      }
    }
    for (const o of this.others.values()) {
      const t = Math.min(1, dt * 12);
      o.rx += (o.x - o.rx) * t;
      o.ry += (o.y - o.ry) * t;
      if (o.moving) o.anim += dt * 8;
    }
    // 互動提示
    const near = this.nearest();
    if (near !== this.lastNear) {
      this.lastNear = near;
      if (!near) this.promptEl.classList.add('hidden');
      else {
        const label = near.kind === 'machine'
          ? `${store.game(near.gameId).name} <span class="cost">🪙 ${store.game(near.gameId).cost}</span>`
          : LABELS[near.kind];
        this.promptEl.innerHTML = `<kbd class="kbd-e">E</kbd> ${label}`;
        this.promptEl.classList.remove('hidden');
      }
    }
  }

  // ---------- 繪製 ----------
  drawPlayer(ctx, p, x, y, isMe, t) {
    const frame = p.moving ? 1 + (Math.floor(p.anim) % 2) : 0;
    const spr = characterSprite({ color: p.color, hat: p.hat, dir: p.dir, frame });
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(spr, Math.round(x - CHAR_W / 2), Math.round(y - spr.height + 1));
    const nameY = Math.round(y - spr.height - 2);
    drawText(ctx, p.name, Math.round(x), nameY, { size: 5, color: isMe ? '#ffe14f' : '#fff', stroke: 'rgba(0,0,0,0.85)' });
    if (p.status) drawText(ctx, p.status, Math.round(x), nameY - 7, { size: 5, color: '#7dff6a', stroke: 'rgba(0,0,0,0.85)' });
    const b = this.bubbles.get(p.id);
    if (b) {
      if (performance.now() > b.until) this.bubbles.delete(p.id);
      else this.drawBubble(ctx, b.text, Math.round(x), nameY - (p.status ? 14 : 7));
    }
    void t;
  }

  drawBubble(ctx, str, x, y) {
    ctx.font = `6px ${PIXEL_FONT}`;
    const w = Math.min(120, ctx.measureText(str).width + 8);
    const h = 11;
    const bx = Math.round(x - w / 2), by = Math.round(y - h - 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx, by, w, h);
    ctx.fillRect(bx + 1, by - 1, w - 2, h + 2);
    ctx.fillRect(x - 1, by + h + 1, 3, 2);
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, by + h / 2 + 0.5, w - 6);
  }

  render(t) {
    const ctx = this.ctx;
    const s = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0618';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    // 相機
    const camX = Math.round(Math.max(0, Math.min(WORLD_W - this.viewW, this.me.x - this.viewW / 2)) * s) / s;
    const camY = Math.round(Math.max(0, Math.min(WORLD_H - this.viewH, this.me.y - this.viewH / 2 - 10)) * s) / s;
    const offX = this.viewW > WORLD_W ? (this.viewW - WORLD_W) / 2 : -camX;
    const offY = this.viewH > WORLD_H ? (this.viewH - WORLD_H) / 2 : -camY;
    this.cam = { x: -offX, y: -offY };
    ctx.setTransform(s, 0, 0, s, Math.round(offX * s), Math.round(offY * s));
    ctx.drawImage(this.bg, 0, 0);
    drawLabels(ctx, this.bg.labels);

    // 依腳底 y 排序
    const drawables = [];
    for (const o of this.objects) drawables.push({ y: o.wall ? -1 : o.y + o.h, o });
    for (const p of this.others.values()) drawables.push({ y: p.ry, p, x: p.rx });
    drawables.push({ y: this.me.y, p: { ...this.me, id: store.me.id, name: store.me.name, color: store.me.color, hat: store.me.hat }, x: this.me.x, isMe: true });
    drawables.sort((a, b) => a.y - b.y);

    const near = this.lastNear;
    for (const d of drawables) {
      if (d.o) {
        const o = d.o;
        if (o.kind === 'npc') {
          drawNpc(ctx, o, t);
          continue;
        }
        ctx.drawImage(o.sprite, o.x, o.y);
        drawLabels(ctx, o.sprite.labels, o.x, o.y);
        if (o.kind === 'machine') drawMachineLights(ctx, o, t);
        if (o === near) {
          ctx.strokeStyle = `rgba(255,225,79,${0.6 + Math.sin(t * 6) * 0.4})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(o.x - 1.5, o.y - 3.5, o.w + 3, o.h + 5);
        }
      } else {
        this.drawPlayer(ctx, d.p, d.x, d.y, d.isMe, t);
      }
    }
  }

  loop = (now) => {
    if (this.paused) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render(now / 1000);
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.paused = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    for (const [ev, fn] of Object.entries(this.handlers || {})) this.socket.off(ev, fn);
    this.socket.emit('lobby:leave');
    this.el.remove();
  }
}

void esc;
