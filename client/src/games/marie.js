import { GameBase, THREE } from './base.js';
import { sfx } from './audio.js';

const START_CREDITS = 20;
const SYMBOLS = [
  { id: 'apple', icon: '🍎', name: '蘋果', mult: 2, weight: 40 },
  { id: 'orange', icon: '🍊', name: '橘子', mult: 3, weight: 27 },
  { id: 'mango', icon: '🥭', name: '芒果', mult: 5, weight: 16 },
  { id: 'bell', icon: '🔔', name: '鈴鐺', mult: 6, weight: 13 },
  { id: 'melon', icon: '🍉', name: '西瓜', mult: 10, weight: 8 },
  { id: 'star', icon: '⭐', name: '星星', mult: 15, weight: 5.3 },
  { id: 'seven', icon: '7️⃣', name: '77', mult: 25, weight: 3.2 },
  { id: 'bar', icon: '💎', name: 'BAR', mult: 50, weight: 1.6 },
];
const LUCKY = { id: 'lucky', icon: '🍀', name: 'LUCKY', weight: 4 };
// 24 格外圈配置
const RING = [
  'bar', 'apple', 'orange', 'bell', 'apple', 'melon', 'mango',
  'apple', 'star', 'orange', 'seven', 'apple', 'lucky',
  'bell', 'orange', 'apple', 'mango', 'melon', 'apple',
  'star', 'orange', 'seven', 'mango', 'bell',
];

const GRID = 7;

export default class Marie extends GameBase {
  setup() {
    const s = this.scene;
    this.addArcadeRoom();
    this.camera.position.set(0, 2.6, 5.4);
    this.camera.lookAt(0, 2.3, 0);
    const key = new THREE.SpotLight('#ffffff', 50, 15, Math.PI / 4, 0.5);
    key.position.set(1, 6, 5);
    s.add(key, key.target);

    // 機台
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 5.4, 1.4), new THREE.MeshStandardMaterial({ color: '#5e35b1', roughness: 0.4 }));
    cab.position.set(0, 2.2, -0.75);
    s.add(cab);
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.5), new THREE.MeshBasicMaterial({ map: this.textTexture('小瑪莉', { bg: '#ffd54f', color: '#6a1b9a', glow: '#fff' }) }));
    top.position.set(0, 5.2, -0.7);
    s.add(top);

    // 盤面：canvas 畫出 7x7 外圈的水果格
    const size = 3.4;
    this.cell = size / GRID;
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = this.boardCanvas.height = 700;
    this.boardTex = this.track(new THREE.CanvasTexture(this.boardCanvas));
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.boardTex }));
    board.position.set(0, 2.5, -0.04);
    s.add(board);
    this.boardCenter = board.position.clone();

    // 每一格的燈
    this.lamps = RING.map((id, i) => {
      const [gx, gy] = this.ringPos(i);
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(this.cell * 0.92, this.cell * 0.92), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      lamp.position.set(-size / 2 + this.cell * (gx + 0.5), 2.5 + size / 2 - this.cell * (gy + 0.5), -0.03);
      s.add(lamp);
      return lamp;
    });
    // 外框燈泡
    this.bulbs = [];
    for (let i = 0; i < 28; i++) {
      const t = i / 28;
      const per = size + 0.3;
      let x, y;
      const side = Math.floor(t * 4), f = (t * 4) % 1;
      if (side === 0) [x, y] = [-per / 2 + f * per, per / 2];
      else if (side === 1) [x, y] = [per / 2, per / 2 - f * per];
      else if (side === 2) [x, y] = [per / 2 - f * per, -per / 2];
      else [x, y] = [-per / 2, -per / 2 + f * per];
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffeb3b' }));
      b.position.set(x, 2.5 + y, 0);
      s.add(b);
      this.bulbs.push(b);
    }

    this.credits = START_CREDITS;
    this.bets = Object.fromEntries(SYMBOLS.map((x) => [x.id, 0]));
    this.lastBets = null;
    this.pos = 0;
    this.spinning = null;
    this.lastWin = 0;
    this.message = '押注後按「開始」';
    this.drawBoard();
    this.buildControls();
    this.updateHud();
  }

  ringPos(i) {
    const n = GRID - 1; // 每邊 6 格
    if (i < n) return [i, 0];
    if (i < n * 2) return [n, i - n];
    if (i < n * 3) return [n - (i - n * 2), n];
    return [0, n - (i - n * 3)];
  }

  drawBoard() {
    const ctx = this.boardCanvas.getContext('2d');
    const W = 700, c = W / GRID;
    ctx.fillStyle = '#12082a';
    ctx.fillRect(0, 0, W, W);
    RING.forEach((id, i) => {
      const [gx, gy] = this.ringPos(i);
      const sym = id === 'lucky' ? LUCKY : SYMBOLS.find((x) => x.id === id);
      ctx.fillStyle = i % 2 ? '#2a1458' : '#3a1d70';
      ctx.fillRect(gx * c + 3, gy * c + 3, c - 6, c - 6);
      ctx.font = `${c * 0.55}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sym.icon, gx * c + c / 2, gy * c + c / 2 + 4);
    });
    // 中央顯示
    ctx.fillStyle = '#000';
    ctx.fillRect(c + 10, c + 10, c * 5 - 20, c * 5 - 20);
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#ffd54f';
    ctx.fillText('CREDIT', W / 2, c * 1.6);
    ctx.font = 'bold 80px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff1744';
    ctx.fillText(String(this.credits).padStart(3, '0'), W / 2, c * 2.5);
    ctx.font = 'bold 30px "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#69f0ae';
    ctx.fillText(this.lastWin ? `贏得 ${this.lastWin}` : ' ', W / 2, c * 3.35);
    ctx.fillStyle = '#fff';
    ctx.font = '26px "Noto Sans TC", sans-serif';
    ctx.fillText(this.message, W / 2, c * 4.05);
    // 押注列
    ctx.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    SYMBOLS.forEach((sym, i) => {
      const x = c * 1.35 + (i % 4) * c * 1.1, y = c * 4.6 + Math.floor(i / 4) * 34;
      ctx.fillText(`${sym.icon}${this.bets[sym.id]}`, x + 12, y);
    });
    this.boardTex.needsUpdate = true;
  }

  buildControls() {
    const panel = document.createElement('div');
    panel.className = 'marie-panel';
    panel.innerHTML = `
      <div class="marie-bets">${SYMBOLS.map((x) => `
        <button class="marie-bet" data-id="${x.id}"><span class="mi">${x.icon}</span><small>×${x.mult}</small><b data-bet="${x.id}">0</b></button>`).join('')}
      </div>
      <div class="marie-actions">
        <button class="btn small ghost" data-act="clear">清除</button>
        <button class="btn small ghost" data-act="repeat">續押</button>
        <button class="btn small ghost" data-act="all">全押+1</button>
        <button class="btn primary" data-act="spin">開始</button>
        <button class="btn small gold" data-act="cash">結算</button>
      </div>`;
    this.container.appendChild(panel);
    this.panel = panel;
    panel.addEventListener('click', (e) => {
      const bet = e.target.closest('.marie-bet');
      if (bet) return this.addBet(bet.dataset.id, 1);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'clear') this.clearBets();
      if (act === 'repeat') this.repeatBets();
      if (act === 'all') SYMBOLS.forEach((x) => this.addBet(x.id, 1));
      if (act === 'spin') this.spin();
      if (act === 'cash') this.cashOut();
    });
    this.on(window, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.spin();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 8) this.addBet(SYMBOLS[n - 1].id, 1);
    });
  }

  totalBet() {
    return Object.values(this.bets).reduce((a, b) => a + b, 0);
  }

  addBet(id, n) {
    if (this.spinning || this.stopped) return;
    if (this.bets[id] + n > 9) return;
    if (this.credits < n) {
      this.flash('點數不足', 700);
      return;
    }
    this.credits -= n;
    this.bets[id] += n;
    this.lastWin = 0;
    sfx.click();
    this.refresh();
  }

  clearBets() {
    if (this.spinning) return;
    this.credits += this.totalBet();
    for (const k in this.bets) this.bets[k] = 0;
    this.refresh();
  }

  repeatBets() {
    if (this.spinning || !this.lastBets) return;
    this.clearBets();
    for (const [id, n] of Object.entries(this.lastBets)) if (n) this.addBet(id, n);
  }

  refresh() {
    for (const sym of SYMBOLS) this.panel.querySelector(`[data-bet="${sym.id}"]`).textContent = this.bets[sym.id];
    this.drawBoard();
    this.updateHud();
  }

  pickTarget() {
    const pool = [...SYMBOLS, LUCKY];
    const total = pool.reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * total;
    let sym = pool[0];
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) {
        sym = p;
        break;
      }
    }
    const idxs = RING.map((id, i) => (id === sym.id ? i : -1)).filter((i) => i >= 0);
    return idxs[Math.floor(Math.random() * idxs.length)];
  }

  spin() {
    if (this.spinning || this.stopped) return;
    if (this.totalBet() === 0) {
      this.flash('請先押注', 800);
      return;
    }
    this.lastBets = { ...this.bets };
    const target = this.pickTarget();
    const steps = 24 * 2 + ((target - this.pos + 24) % 24) + 24;
    this.spinning = { steps, done: 0, timer: 0, extra: 0 };
    this.message = '轉動中…';
    this.lastWin = 0;
    this.panel.classList.add('busy');
    this.drawBoard();
  }

  stepInterval(sp) {
    const remain = sp.steps - sp.done;
    if (sp.done < 8) return 0.09 - sp.done * 0.008;
    if (remain > 14) return 0.03;
    return 0.03 + (14 - remain) * 0.022;
  }

  settle() {
    const id = RING[this.pos];
    let win = 0;
    if (id === 'lucky') {
      // LUCKY：再隨機點亮 3 格，全部照押注賠
      this.message = '🍀 LUCKY！加送三燈';
      this.luckyLamps = [];
      for (let i = 0; i < 3; i++) {
        let idx;
        do idx = this.pickTarget(); while (RING[idx] === 'lucky' || this.luckyLamps.includes(idx));
        this.luckyLamps.push(idx);
        const sym = SYMBOLS.find((x) => x.id === RING[idx]);
        win += this.bets[sym.id] * sym.mult;
      }
      sfx.fanfare();
    } else {
      const sym = SYMBOLS.find((x) => x.id === id);
      win = this.bets[sym.id] * sym.mult;
      this.message = win ? `${sym.icon} ${sym.name} ×${sym.mult}` : `${sym.icon} ${sym.name}…沒押到`;
    }
    for (const k in this.bets) this.bets[k] = 0;
    this.credits += win;
    this.lastWin = win;
    if (win > 0) {
      sfx.win();
      this.flash(`+${win}`, 1000, win >= 50 ? 'gold' : '');
    } else if (id !== 'lucky') sfx.lose();
    this.spinning = null;
    this.panel.classList.remove('busy');
    this.refresh();
    if (this.credits <= 0) {
      this.message = '點數用完了';
      this.drawBoard();
      this.endSoon(0, 1500);
    }
  }

  cashOut() {
    if (this.spinning || this.stopped) return;
    this.clearBets();
    this.flash(`結算 ${this.credits} 點 → ${this.credits} 張彩票`, 1500, 'gold');
    this.endSoon(this.credits, 1300);
  }

  updateHud() {
    this.setHud([
      ['點數', this.credits],
      ['押注', this.totalBet()],
      ['可換彩票', this.credits + this.totalBet(), 'gold'],
    ]);
  }

  update(dt) {
    const t = this.clock.elapsedTime;
    const sp = this.spinning;
    if (sp) {
      sp.timer -= dt;
      while (sp.timer <= 0 && sp.done < sp.steps) {
        sp.done++;
        this.pos = (this.pos + 1) % 24;
        sp.timer += this.stepInterval(sp);
        sfx.tick();
      }
      if (sp.done >= sp.steps && sp.timer <= -0.25) this.settle();
    }
    this.lamps.forEach((l, i) => {
      let o = 0;
      if (i === this.pos) o = 0.55;
      else if (sp && ((this.pos - i + 24) % 24) === 1) o = 0.25;
      else if (sp && ((this.pos - i + 24) % 24) === 2) o = 0.1;
      if (!sp && this.luckyLamps?.includes(i)) o = 0.35 + Math.sin(t * 10) * 0.15;
      if (!sp && i === this.pos && this.lastWin) o = 0.4 + Math.sin(t * 12) * 0.25;
      l.material.opacity = o;
    });
    if (sp) this.luckyLamps = null;
    this.bulbs.forEach((b, i) => b.material.color.set((i + Math.floor(t * (sp ? 14 : 4))) % 4 === 0 ? '#ffeb3b' : '#4a2a00'));
  }

  currentScore() {
    return this.credits + this.totalBet();
  }
}
