import * as CANNON from 'cannon-es';
import { GameBase, THREE } from './base.js';
import { sfx } from './audio.js';

const HALF = 1.6; // 機台內部半寬
const TOP_Y = 3.4;
const CHUTE = { x: 1.15, z: 1.15, r: 0.5 };
const TIME_LIMIT = 20;
const COLORS = ['#ffb3c7', '#ffe08a', '#9ee6a8', '#b8a9ff', '#ffd1a1', '#8fd3ff', '#ff8a80', '#e1bee7'];

export default class Claw extends GameBase {
  setup() {
    const s = this.scene;
    this.addArcadeRoom();
    this.camera.position.set(0, 4.2, 6.4);
    this.camera.lookAt(0, 1.4, 0);
    const spot = new THREE.SpotLight('#ffffff', 70, 15, Math.PI / 4, 0.4);
    spot.position.set(0, TOP_Y + 0.3, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    s.add(spot, spot.target);
    s.add(new THREE.PointLight('#ff6fae', 8, 6).translateY(3).translateZ(2));

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.allowSleep = true;
    this.world = world;
    const mat = new CANNON.Material('plush');
    world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.6, restitution: 0.1 }));
    this.plushMat = mat;

    const staticBox = (w, h, d, x, y, z) => {
      const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) });
      b.position.set(x, y, z);
      world.addBody(b);
      return b;
    };
    // 地板（有出口洞）：用四塊拼出來
    const floorY = 0.5;
    const fx = CHUTE.x - CHUTE.r, fz = CHUTE.z - CHUTE.r;
    staticBox(HALF + fx, 0.2, HALF * 2, (-HALF + fx) / 2, floorY - 0.1, 0);
    staticBox(HALF - fx, 0.2, HALF + fz, (fx + HALF) / 2, floorY - 0.1, (-HALF + fz) / 2);
    // 出口周圍的擋板（防止娃娃自己滾進去）
    staticBox(0.05, 0.35, CHUTE.r * 2, fx, floorY + 0.17, CHUTE.z);
    staticBox(CHUTE.r * 2, 0.35, 0.05, CHUTE.x, floorY + 0.17, fz);
    // 牆
    for (const [w, d, x, z] of [[0.1, HALF * 2, -HALF, 0], [0.1, HALF * 2, HALF, 0], [HALF * 2, 0.1, 0, -HALF], [HALF * 2, 0.1, 0, HALF]]) staticBox(w, 4, d, x, 2, z);

    // ---- 外觀 ----
    const pink = new THREE.MeshStandardMaterial({ color: '#e0558f', roughness: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.4, floorY + 0.1, HALF * 2 + 0.4), pink);
    base.position.y = floorY / 2 - 0.05;
    s.add(base);
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ color: '#7e57c2', roughness: 0.9 }));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = floorY + 0.001;
    floorMesh.receiveShadow = true;
    s.add(floorMesh);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(CHUTE.r * 2, 0.02, CHUTE.r * 2), new THREE.MeshBasicMaterial({ color: '#000' }));
    hole.position.set(CHUTE.x, floorY + 0.005, CHUTE.z);
    s.add(hole);
    const chuteGlass = new THREE.Mesh(new THREE.BoxGeometry(CHUTE.r * 2, 0.35, CHUTE.r * 2), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 }));
    chuteGlass.position.set(CHUTE.x, floorY + 0.17, CHUTE.z);
    s.add(chuteGlass);
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cdefff', transparent: true, opacity: 0.12, roughness: 0, side: THREE.DoubleSide, depthWrite: false });
    for (const [w, d, x, z] of [[0.02, HALF * 2, -HALF, 0], [0.02, HALF * 2, HALF, 0], [HALF * 2, 0.02, 0, -HALF]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, TOP_Y - floorY, d), glass);
      m.position.set(x, (TOP_Y + floorY) / 2, z);
      s.add(m);
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, TOP_Y + 0.6, 0.12), pink);
      post.position.set(x * HALF, (TOP_Y + 0.6) / 2, z * HALF);
      s.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.4, 0.5, HALF * 2 + 0.4), pink);
    roof.position.y = TOP_Y + 0.4;
    s.add(roof);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 0.45), new THREE.MeshBasicMaterial({ map: this.textTexture('♥ 夾娃娃 ♥', { bg: '#ff6fae', color: '#ffffff', glow: '#fff' }) }));
    sign.position.set(0, TOP_Y + 0.4, HALF + 0.21);
    s.add(sign);

    // 爪子
    this.clawPos = new THREE.Vector3(-1, TOP_Y - 0.2, -1);
    this.claw = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.9, roughness: 0.25 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 16), metal);
    this.claw.add(hub);
    this.fingers = [];
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 3) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.position.set(0.15, -0.1, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.06), metal);
      upper.position.set(0.08, -0.18, 0);
      upper.rotation.z = 0.4;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.06), metal);
      lower.position.set(0.12, -0.48, 0);
      lower.rotation.z = -0.3;
      arm.add(upper, lower);
      pivot.add(arm);
      this.claw.add(pivot);
      this.fingers.push(arm);
    }
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), new THREE.MeshStandardMaterial({ color: '#333' }));
    s.add(this.cable, this.claw);
    this.gantry = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.08, 0.12), metal);
    s.add(this.gantry);
    this.shadowDot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }));
    this.shadowDot.rotation.x = -Math.PI / 2;
    s.add(this.shadowDot);

    // 娃娃
    this.plushes = [];
    for (let i = 0; i < 16; i++) {
      let x, z;
      do {
        x = (Math.random() * 2 - 1) * (HALF - 0.35);
        z = (Math.random() * 2 - 1) * (HALF - 0.35);
      } while (Math.hypot(x - CHUTE.x, z - CHUTE.z) < 0.9);
      this.addPlush(x, floorY + 0.3 + Math.random() * 1.2, z, COLORS[i % COLORS.length]);
    }

    this.state = 'move'; // move → down → grab → up → carry → release → done
    this.stateT = 0;
    this.timeLeft = TIME_LIMIT;
    this.grip = 0; // 0 張開，1 合起
    this.held = null;
    this.won = 0;
    this.keys = new Set();
    this.bindInput();
    this.updateHud();
  }

  addPlush(x, y, z, color) {
    const r = 0.26 + Math.random() * 0.06;
    const body = new CANNON.Body({ mass: 0.3, material: this.plushMat, shape: new CANNON.Sphere(r), linearDamping: 0.3, angularDamping: 0.5, sleepSpeedLimit: 0.05 });
    body.position.set(x, y, z);
    this.world.addBody(body);
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m);
    head.castShadow = true;
    const kind = Math.floor(Math.random() * 3);
    // 耳朵：熊（圓）/ 兔（長）/ 貓（尖）
    for (const sx of [-1, 1]) {
      let ear;
      if (kind === 0) ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 12, 8), m);
      else if (kind === 1) {
        ear = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.13, r * 0.7, 4, 8), m);
        ear.rotation.z = sx * -0.2;
      } else ear = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 0.5, 4), m);
      ear.position.set(sx * r * 0.6, r * (kind === 1 ? 1.05 : 0.8), 0);
      g.add(ear);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#222' });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 8, 8), eyeMat);
      eye.position.set(sx * r * 0.33, r * 0.15, r * 0.92);
      g.add(eye);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(r * 0.12, 12), new THREE.MeshBasicMaterial({ color: '#ff8a80', transparent: true, opacity: 0.6 }));
      blush.position.set(sx * r * 0.5, -r * 0.08, r * 0.87);
      blush.rotation.y = sx * 0.5;
      g.add(blush);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 8), new THREE.MeshBasicMaterial({ color: '#5d4037' }));
    nose.position.set(0, -r * 0.05, r * 0.98);
    g.add(head, nose);
    this.scene.add(g);
    this.plushes.push({ body, group: g, r });
  }

  bindInput() {
    this.on(window, 'keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        this.dropClaw();
      }
    });
    this.on(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // 螢幕控制
    const pad = document.createElement('div');
    pad.className = 'claw-pad';
    pad.innerHTML = `
      <div class="dpad">
        <button data-k="w">▲</button><button data-k="a">◀</button><button data-k="d">▶</button><button data-k="s">▼</button>
      </div>
      <button class="game-btn grab-btn">夾！</button>`;
    this.container.appendChild(pad);
    pad.querySelectorAll('[data-k]').forEach((b) => {
      const k = 'pad-' + b.dataset.k;
      this.on(b, 'pointerdown', (e) => {
        e.preventDefault();
        this.keys.add(k);
      });
      this.on(b, 'pointerup', () => this.keys.delete(k));
      this.on(b, 'pointerleave', () => this.keys.delete(k));
    });
    this.on(pad.querySelector('.grab-btn'), 'pointerdown', (e) => {
      e.preventDefault();
      this.dropClaw();
    });
    this.pad = pad;
  }

  dropClaw() {
    if (this.state !== 'move') return;
    this.state = 'down';
    this.stateT = 0;
    this.pad.classList.add('disabled');
    sfx.click();
  }

  updateHud() {
    this.setHud([
      ['時間', this.state === 'move' ? Math.ceil(this.timeLeft) : '—', this.timeLeft < 5 && this.state === 'move' ? 'warn' : ''],
      ['夾到', this.won ? '🧸 1' : '0'],
    ]);
  }

  /** 找爪子正下方的娃娃 */
  findTarget() {
    let best = null, bestD = 0.38;
    for (const p of this.plushes) {
      const d = Math.hypot(p.body.position.x - this.clawPos.x, p.body.position.z - this.clawPos.z);
      const dy = this.clawPos.y - p.body.position.y;
      if (d < bestD && dy < p.r + 0.75) {
        best = p;
        bestD = d;
      }
    }
    return best ? { p: best, d: bestD } : null;
  }

  update(dt) {
    this.stateT += dt;
    const k = this.keys;
    const c = this.clawPos;
    if (this.state === 'move') {
      const sp = 1.3 * dt;
      let moved = false;
      if (k.has('arrowleft') || k.has('a') || k.has('pad-a')) (c.x -= sp), (moved = true);
      if (k.has('arrowright') || k.has('d') || k.has('pad-d')) (c.x += sp), (moved = true);
      if (k.has('arrowup') || k.has('w') || k.has('pad-w')) (c.z -= sp), (moved = true);
      if (k.has('arrowdown') || k.has('s') || k.has('pad-s')) (c.z += sp), (moved = true);
      if (moved && Math.random() < dt * 8) sfx.motor();
      c.x = THREE.MathUtils.clamp(c.x, -HALF + 0.3, HALF - 0.3);
      c.z = THREE.MathUtils.clamp(c.z, -HALF + 0.3, HALF - 0.3);
      const prev = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      if (Math.ceil(this.timeLeft) !== prev) {
        this.updateHud();
        if (this.timeLeft < 5) sfx.tick();
      }
      if (this.timeLeft <= 0) this.dropClaw();
    } else if (this.state === 'down') {
      c.y -= dt * 1.2;
      // 碰到娃娃或地板就停
      let floorY = 0.95;
      for (const p of this.plushes) {
        const d = Math.hypot(p.body.position.x - c.x, p.body.position.z - c.z);
        if (d < p.r + 0.1) floorY = Math.max(floorY, p.body.position.y + p.r * 0.9 + 0.35);
      }
      if (c.y <= floorY) {
        c.y = floorY;
        this.state = 'grab';
        this.stateT = 0;
      }
    } else if (this.state === 'grab') {
      this.grip = Math.min(1, this.stateT / 0.6);
      if (this.stateT >= 0.7) {
        const t = this.findTarget();
        if (t) {
          // 越接近中心越容易夾穩
          const chance = THREE.MathUtils.clamp(0.95 - t.d * 1.8, 0.2, 0.92);
          if (Math.random() < chance) {
            this.held = t.p;
            this.held.body.type = CANNON.Body.KINEMATIC;
            this.held.body.velocity.setZero();
            this.held.body.angularVelocity.setZero();
            this.held.offset = new THREE.Vector3(t.p.body.position.x - c.x, -0.62, t.p.body.position.z - c.z).multiplyScalar(0.5);
            this.held.offset.y = -0.62;
            // 搬運途中掉落的機率
            this.slipAt = Math.random() < 0.18 + t.d * 0.6 ? 0.4 + Math.random() * 1.6 : Infinity;
          } else {
            // 輕輕推一下娃娃，表示沒夾穩
            t.p.body.wakeUp();
            t.p.body.velocity.set((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5);
          }
        }
        this.state = 'up';
        this.stateT = 0;
      }
    } else if (this.state === 'up') {
      c.y += dt * 1.0;
      if (c.y >= TOP_Y - 0.2) {
        c.y = TOP_Y - 0.2;
        this.state = 'carry';
        this.stateT = 0;
      }
    } else if (this.state === 'carry') {
      const tx = CHUTE.x, tz = CHUTE.z;
      const dx = tx - c.x, dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      const sp = dt * 1.1;
      if (d > sp) {
        c.x += (dx / d) * sp;
        c.z += (dz / d) * sp;
      } else {
        c.x = tx;
        c.z = tz;
        this.state = 'release';
        this.stateT = 0;
      }
    } else if (this.state === 'release') {
      this.grip = Math.max(0, 1 - this.stateT / 0.4);
      if (this.held) this.dropHeld(true);
      if (this.stateT > 2.2) {
        this.state = 'done';
        const win = this.won > 0;
        this.flash(win ? '🎉 夾到了！' : '可惜～差一點！', 1800, win ? 'gold' : 'big');
        if (win) sfx.win();
        else sfx.lose();
        this.endSoon(this.won, 1800);
      }
    }

    // 搬運中滑落
    if (this.held && (this.state === 'up' || this.state === 'carry')) {
      this.slipAt -= dt;
      if (this.slipAt <= 0) {
        this.dropHeld(false);
        this.grip = 0.4;
        sfx.bad();
        this.flash('啊！掉了…', 900);
      }
    }
    if (this.state !== 'grab' && this.state !== 'release' && !this.held && this.state !== 'move' && this.state !== 'down') this.grip = Math.max(0.3, this.grip - dt);
    if (this.state === 'move' || this.state === 'down') this.grip = 0;

    this.world.step(1 / 60, dt, 3);
    if (this.held) {
      const b = this.held.body;
      b.position.set(c.x + this.held.offset.x, c.y + this.held.offset.y, c.z + this.held.offset.z);
    }
    for (let i = this.plushes.length - 1; i >= 0; i--) {
      const p = this.plushes[i];
      p.group.position.copy(p.body.position);
      p.group.quaternion.copy(p.body.quaternion);
      // 掉進出口
      if (p.body.position.y < 0.2) {
        if (Math.hypot(p.body.position.x - CHUTE.x, p.body.position.z - CHUTE.z) < CHUTE.r + 0.3) {
          if (!this.won) {
            this.won = 1;
            this.updateHud();
            sfx.fanfare();
          }
        }
        this.world.removeBody(p.body);
        this.scene.remove(p.group);
        this.plushes.splice(i, 1);
      }
    }

    // 更新外觀
    this.claw.position.copy(c);
    this.gantry.position.set(0, TOP_Y + 0.05, c.z);
    const cableLen = TOP_Y + 0.05 - c.y;
    this.cable.scale.y = Math.max(0.01, cableLen);
    this.cable.position.set(c.x, c.y + cableLen / 2, c.z);
    this.fingers.forEach((f) => (f.rotation.z = THREE.MathUtils.lerp(0.35, -0.35, this.grip)));
    let groundY = 0.51;
    for (const p of this.plushes) if (Math.hypot(p.body.position.x - c.x, p.body.position.z - c.z) < p.r) groundY = Math.max(groundY, p.body.position.y + p.r + 0.01);
    this.shadowDot.position.set(c.x, groundY, c.z);
  }

  dropHeld() {
    if (!this.held) return;
    const b = this.held.body;
    b.type = CANNON.Body.DYNAMIC;
    b.mass = 0.3;
    b.updateMassProperties();
    b.wakeUp();
    b.velocity.set(0, -0.5, 0);
    this.held = null;
  }

  currentScore() {
    return this.won;
  }
}
