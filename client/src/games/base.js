import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 所有 3D 遊戲的共用基底：建立 renderer/scene/camera、遊戲迴圈、HUD、清理資源。
 * 子類別實作 setup() 與 update(dt)，結束時呼叫 this.finish(score)。
 */
export class GameBase {
  constructor(container, { onEnd }) {
    this.container = container;
    this.onEnd = onEnd;
    this.score = 0;
    this.ended = false;
    this.disposables = [];
    this.listeners = [];

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('game-canvas');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#120a26');
    // 環境貼圖讓金屬材質（金幣、鋼珠）有反光
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.disposables.push(this.envMap);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

    this.hudEl = document.createElement('div');
    this.hudEl.className = 'game-hud';
    container.appendChild(this.hudEl);
    this.centerEl = document.createElement('div');
    this.centerEl.className = 'game-center';
    container.appendChild(this.centerEl);

    this.on(window, 'resize', () => this.resize());
    this.setup();
    this.resize();
    this.clock = { elapsedTime: 0, last: performance.now() };
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ----- 子類別覆寫 -----
  setup() {}
  update() {}
  /** 玩家中途離開時，回傳目前可結算的分數 */
  currentScore() {
    return this.score;
  }

  // ----- 工具 -----
  on(target, event, fn, opts) {
    target.addEventListener(event, fn, opts);
    this.listeners.push(() => target.removeEventListener(event, fn, opts));
  }

  track(obj) {
    this.disposables.push(obj);
    return obj;
  }

  setHud(items) {
    this.hudEl.innerHTML = items.map(([label, value, cls = '']) => `<div class="hud-item ${cls}"><small>${label}</small><b>${value}</b></div>`).join('');
  }

  flash(text, ms = 1200, cls = '') {
    const d = document.createElement('div');
    d.className = `game-flash ${cls}`;
    d.textContent = text;
    this.centerEl.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  addArcadeRoom({ floorColor = '#1a1033', wallColor = '#21143f' } = {}) {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#b9a6ff', '#1a0f2e', 0.9));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    s.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1 }));
    wall.position.set(0, 10, -8);
    s.add(wall);
    // 牆上霓虹燈條
    const colors = ['#ff4fa3', '#41e8ff', '#ffe14f'];
    colors.forEach((c, i) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(30, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: c }));
      bar.position.set(0, 4 + i * 0.5, -7.9);
      s.add(bar);
    });
  }

  /** 用 canvas 畫文字做成材質（招牌、面板用） */
  textTexture(text, { w = 512, h = 128, bg = '#000', color = '#fff', font = 'bold 72px "Noto Sans TC", sans-serif', glow = null } = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return this.track(tex);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h);
  }

  /** 螢幕座標轉成 NDC */
  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  loop() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.clock.last) / 1000, 1 / 20);
    this.clock.last = now;
    this.clock.elapsedTime += dt;
    if (!this.ended && !this.stopped) this.update(dt);
    else this.idle?.(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 停止遊戲邏輯，ms 毫秒後結算（讓玩家看到最後畫面） */
  endSoon(score = this.score, ms = 1200) {
    if (this.stopped) return;
    this.stopped = true;
    setTimeout(() => this.finish(score), ms);
  }

  finish(score = this.score) {
    if (this.ended || this.disposed) return;
    this.ended = true;
    this.onEnd(Math.max(0, Math.floor(score)));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.listeners.forEach((f) => f());
    this.onDispose?.();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    this.disposables.forEach((d) => d.dispose?.());
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.container.innerHTML = '';
  }
}

export { THREE };
