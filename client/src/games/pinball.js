import * as CANNON from 'cannon-es';
import { GameBase, THREE } from './base.js';
import { sfx } from './audio.js';

const BALL_R = 0.2;
const W = 3; // 半寬
const TOP = -5.5, BOTTOM = 5.5;
const LANE_X = 2.42;
const FLIP_L = 1.25;
const FLIP_Z = 4.25;
const REST = -0.52, ACTIVE = 0.45; // 左擋板角度（右擋板取相反數）
const BALLS = 3;

export default class Pinball extends GameBase {
  setup() {
    const s = this.scene;
    this.addArcadeRoom();
    this.camera.position.set(0, 10.5, 9.5);
    this.camera.lookAt(0, 0, -0.3);
    const spot = new THREE.SpotLight('#ffffff', 140, 30, Math.PI / 4, 0.5);
    spot.position.set(0, 12, 4);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    s.add(spot, spot.target);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 5.2) });
    world.solver.iterations = 12;
    this.world = world;
    const ballMat = new CANNON.Material('ball');
    const wallMat = new CANNON.Material('wall');
    const flipMat = new CANNON.Material('flip');
    const bumpMat = new CANNON.Material('bump');
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat, { friction: 0.02, restitution: 0.35 }));
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, flipMat, { friction: 0.1, restitution: 0.25 }));
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, bumpMat, { friction: 0, restitution: 0.9 }));
    this.mats = { wallMat, flipMat, bumpMat };

    // 桌面（物理平面 + 有圖案的貼圖）
    const floor = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);
    const ceil = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
    ceil.quaternion.setFromEuler(Math.PI / 2, 0, 0);
    ceil.position.y = BALL_R * 2 + 0.03;
    world.addBody(ceil);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, BOTTOM - TOP), new THREE.MeshStandardMaterial({ map: this.fieldTexture(), roughness: 0.35, metalness: 0.1 }));
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    s.add(field);
    // 桌子外殼
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.8, 1.2, BOTTOM - TOP + 0.8), new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.6 }));
    cab.position.y = -0.62;
    s.add(cab);
    const backbox = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.8, 3, 0.6), new THREE.MeshStandardMaterial({ color: '#37474f' }));
    backbox.position.set(0, 1.5, TOP - 0.7);
    s.add(backbox);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 1.4), new THREE.MeshBasicMaterial({ map: this.textTexture('彈珠台 PINBALL', { bg: '#0d0d1a', color: '#ffeb3b', glow: '#ff4081', font: 'bold 64px "Noto Sans TC", sans-serif' }) }));
    sign.position.set(0, 2.2, TOP - 0.39);
    s.add(sign);

    // 牆
    const railMat = new THREE.MeshStandardMaterial({ color: '#b0bec5', metalness: 0.8, roughness: 0.25 });
    this.railMat = railMat;
    const wall = (x1, z1, x2, z2, t = 0.12) => this.wall(x1, z1, x2, z2, t, railMat);
    wall(-W, -3.9, -W, BOTTOM);
    wall(W, -3.9, W, BOTTOM);
    wall(LANE_X, -3.0, LANE_X, BOTTOM, 0.08);
    wall(-1.4, TOP, 1.4, TOP);
    wall(-W, BOTTOM, -0.9, BOTTOM);
    wall(0.9, BOTTOM, W, BOTTOM);
    // 上方弧形（以多段牆近似）
    const arc = (cx, cz, r, a0, a1, n) => {
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
        wall(cx + Math.cos(t0) * r, cz - Math.sin(t0) * r, cx + Math.cos(t1) * r, cz - Math.sin(t1) * r);
      }
    };
    arc(1.4, -3.9, 1.6, 0, Math.PI / 2, 8);
    arc(-1.4, -3.9, 1.6, Math.PI / 2, Math.PI, 8);
    // 導引斜牆（左右通往擋板）
    const pivL = new THREE.Vector2(-1.45, FLIP_Z), pivR = new THREE.Vector2(1.45, FLIP_Z);
    wall(-W, 2.6, pivL.x - 0.08, pivL.y - 0.12, 0.14);
    wall(LANE_X, 2.6, pivR.x + 0.08, pivR.y - 0.12, 0.14);
    // 擋板下方的排水口邊緣
    wall(-W, 4.9, -0.9, 5.5);
    wall(LANE_X, 4.9, 0.9, 5.5);

    // 彈跳柱
    this.bumpers = [];
    for (const [x, z] of [[-1, -2.7], [1, -2.7], [0, -1.6]]) this.addBumper(x, z, 0.42);
    // 彈弓（擋板上方的三角形踢板）
    this.addKicker(-2.1, 1.6, -1.55, 2.95);
    this.addKicker(1.95, 1.6, 1.4, 2.95, true);

    // 上方三條通道（全部亮起 = 加乘）
    wall(-0.55, TOP, -0.55, TOP + 0.9, 0.07);
    wall(0.55, TOP, 0.55, TOP + 0.9, 0.07);
    this.lanes = [-1.1, 0, 1.1].map((x) => this.addSensor(x, TOP + 0.6, 0.25, 'lane'));
    // 星星目標
    this.stars = [[-2.2, -1.2], [-2.3, 0.4], [2.0, -0.6], [1.9, 0.9], [0, 0.8]].map(([x, z]) => this.addSensor(x, z, 0.3, 'star'));
    this.multiplier = 1;

    // 擋板
    this.flippers = [
      this.addFlipper(pivL, 1),
      this.addFlipper(pivR, -1),
    ];

    // 彈珠
    this.ballBody = new CANNON.Body({ mass: 1, material: ballMat, shape: new CANNON.Sphere(BALL_R), linearDamping: 0.02, angularDamping: 0.05 });
    this.ballBody.ccdSpeedThreshold = 1;
    world.addBody(this.ballBody);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.08 }));
    this.ball.castShadow = true;
    s.add(this.ball);
    this.ballsLeft = BALLS;
    this.charge = 0;
    this.charging = false;
    this.stuckTimer = 0;

    // 發射桿
    this.plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12), new THREE.MeshStandardMaterial({ color: '#e53935', metalness: 0.4 }));
    this.plunger.rotation.x = Math.PI / 2;
    s.add(this.plunger);

    this.resetBall();
    this.bindInput();
    this.updateHud();
  }

  wall(x1, z1, x2, z2, t, mat) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(-dz, dx);
    const body = new CANNON.Body({ mass: 0, material: this.mats.wallMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2 + t / 2, 0.4, t / 2)));
    body.position.set((x1 + x2) / 2, 0.4, (z1 + z2) / 2);
    body.quaternion.setFromEuler(0, angle, 0);
    this.world.addBody(body);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len + t, 0.5, t), mat);
    mesh.position.set((x1 + x2) / 2, 0.25, (z1 + z2) / 2);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return body;
  }

  addBumper(x, z, r) {
    const body = new CANNON.Body({ mass: 0, material: this.mats.bumpMat, shape: new CANNON.Cylinder(r, r, 0.8, 16) });
    body.position.set(x, 0.4, z);
    this.world.addBody(body);
    const g = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.25, 32), new THREE.MeshStandardMaterial({ color: '#ff1744', emissive: '#550010', roughness: 0.3 }));
    cap.position.y = 0.45;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.35, 24), new THREE.MeshStandardMaterial({ color: '#fafafa' }));
    skirt.position.y = 0.17;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.04, 8, 32), new THREE.MeshStandardMaterial({ color: '#ffeb3b', emissive: '#ffeb3b', emissiveIntensity: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    g.add(cap, skirt, ring);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const b = { body, cap, flash: 0 };
    body.addEventListener('collide', (e) => {
      if (e.body !== this.ballBody) return;
      // 往外踢
      const d = new CANNON.Vec3(this.ballBody.position.x - x, 0, this.ballBody.position.z - z);
      d.normalize();
      this.ballBody.velocity.x += d.x * 5;
      this.ballBody.velocity.z += d.z * 5;
      b.flash = 1;
      this.addScore(100);
      sfx.boing();
    });
    this.bumpers.push(b);
  }

  addKicker(x1, z1, x2, z2, mirror = false) {
    const body = this.wall(x1, z1, x2, z2, 0.14, new THREE.MeshStandardMaterial({ color: '#00e5ff', emissive: '#004d57' }));
    const nx = mirror ? -(z2 - z1) : z2 - z1, nz = mirror ? x2 - x1 : -(x2 - x1);
    const n = new THREE.Vector2(nx, nz).normalize();
    // 法線朝向桌面中央
    if ((mirror && n.x > 0) || (!mirror && n.x < 0)) n.multiplyScalar(-1);
    body.addEventListener('collide', (e) => {
      if (e.body !== this.ballBody) return;
      this.ballBody.velocity.x += n.x * 4.5;
      this.ballBody.velocity.z += n.y * 4.5;
      this.addScore(50);
      sfx.bump();
    });
  }

  addSensor(x, z, r, kind) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(r, r, 0.3, 12), collisionResponse: false });
    body.position.set(x, 0.15, z);
    this.world.addBody(body);
    const mat = new THREE.MeshStandardMaterial({ color: kind === 'star' ? '#ffd740' : '#69f0ae', emissive: '#000', transparent: true, opacity: 0.85 });
    const mesh = kind === 'star'
      ? new THREE.Mesh(this.starGeometry(r), mat)
      : new THREE.Mesh(new THREE.CircleGeometry(r * 0.6, 24), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.012, z);
    this.scene.add(mesh);
    const sensor = { body, mesh, mat, lit: false, kind, cool: 0 };
    body.addEventListener('collide', (e) => {
      if (e.body !== this.ballBody || sensor.cool > 0) return;
      sensor.cool = 0.5;
      this.hitSensor(sensor);
    });
    return sensor;
  }

  starGeometry(r) {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    return new THREE.ShapeGeometry(sh);
  }

  hitSensor(sensor) {
    if (sensor.kind === 'lane') {
      sensor.lit = true;
      this.addScore(200);
      sfx.tick();
      if (this.lanes.every((l) => l.lit)) {
        this.multiplier = Math.min(5, this.multiplier + 1);
        this.lanes.forEach((l) => (l.lit = false));
        this.flash(`倍率 ×${this.multiplier}！`, 1200, 'gold');
        sfx.fanfare();
      }
    } else {
      if (!sensor.lit) {
        sensor.lit = true;
        this.addScore(250);
        sfx.ding();
      }
      if (this.stars.every((st) => st.lit)) {
        this.addScore(3000);
        this.flash('⭐ 全星達成 +3000', 1400, 'gold');
        sfx.win();
        this.stars.forEach((st) => (st.lit = false));
      }
    }
    this.refreshLights();
  }

  refreshLights() {
    for (const s of [...this.lanes, ...this.stars]) {
      s.mat.emissive.set(s.lit ? (s.kind === 'star' ? '#ffab00' : '#00e676') : '#000');
      s.mat.opacity = s.lit ? 1 : 0.45;
    }
  }

  addFlipper(pivot, side) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.mats.flipMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(FLIP_L / 2, 0.3, 0.11)), new CANNON.Vec3((side * FLIP_L) / 2, 0, 0));
    body.addShape(new CANNON.Sphere(0.16));
    body.position.set(pivot.x, 0.3, pivot.y);
    this.world.addBody(body);
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    // 漸細的擋板外形
    shape.absarc(0, 0, 0.17, Math.PI / 2, (Math.PI * 3) / 2, side < 0);
    shape.lineTo(side * FLIP_L, -0.07);
    shape.absarc(side * FLIP_L, 0, 0.07, -Math.PI / 2, Math.PI / 2, side < 0);
    shape.lineTo(0, 0.17);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.4, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fdd835', roughness: 0.3 }));
    mesh.castShadow = true;
    g.add(mesh);
    g.position.set(pivot.x, 0, pivot.y);
    this.scene.add(g);
    const rest = side * REST, active = side * ACTIVE;
    body.quaternion.setFromEuler(0, rest, 0);
    return { body, group: g, side, angle: rest, rest, active, pressed: false };
  }

  bindInput() {
    const setFlip = (side, v) => {
      const f = this.flippers[side === 'L' ? 0 : 1];
      if (v && !f.pressed) sfx.clack();
      f.pressed = v;
    };
    this.on(window, 'keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'z' || k === 'shift') setFlip('L', true);
      if (k === 'arrowright' || k === 'm' || k === '/') setFlip('R', true);
      if (k === ' ' || k === 'arrowdown') {
        e.preventDefault();
        this.charging = true;
      }
    });
    this.on(window, 'keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'z' || k === 'shift') setFlip('L', false);
      if (k === 'arrowright' || k === 'm' || k === '/') setFlip('R', false);
      if (k === ' ' || k === 'arrowdown') this.launch();
    });
    // 觸控 / 滑鼠：左右半邊控制擋板
    const pointers = new Map();
    const update = () => {
      const sides = [...pointers.values()];
      setFlip('L', sides.includes('L'));
      setFlip('R', sides.includes('R'));
    };
    this.on(this.canvas, 'pointerdown', (e) => {
      const r = this.canvas.getBoundingClientRect();
      pointers.set(e.pointerId, e.clientX - r.left < r.width / 2 ? 'L' : 'R');
      update();
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      update();
    };
    this.on(window, 'pointerup', up);
    this.on(window, 'pointercancel', up);
    // 發射按鈕
    const btn = document.createElement('button');
    btn.className = 'game-btn launch-btn';
    btn.textContent = '按住發射';
    this.container.appendChild(btn);
    this.on(btn, 'pointerdown', (e) => {
      e.stopPropagation();
      this.charging = true;
    });
    this.on(btn, 'pointerup', () => this.launch());
    this.on(btn, 'pointerleave', () => this.charging && this.launch());
    this.launchBtn = btn;
  }

  inPlungerLane() {
    const p = this.ballBody.position;
    return p.x > LANE_X && p.z > 3.5;
  }

  launch() {
    if (!this.charging) return;
    this.charging = false;
    if (this.inPlungerLane() && this.ballBody.position.z > 4.6) {
      this.ballBody.wakeUp();
      const v = 11.5 + this.charge * 8;
      this.ballBody.velocity.set(0, 0, -v);
      // 同時給滾動的角速度，否則滑動轉滾動時會損失大量速度
      this.ballBody.angularVelocity.set(-v / BALL_R, 0, 0);
      sfx.swish();
    }
    this.charge = 0;
  }

  resetBall() {
    const b = this.ballBody;
    b.velocity.setZero();
    b.angularVelocity.setZero();
    b.position.set((LANE_X + W) / 2, BALL_R, 5.0);
    this.launchBtn?.classList.remove('hidden');
  }

  addScore(n) {
    this.score += n * this.multiplier;
    this.updateHud();
  }

  updateHud() {
    this.setHud([
      ['分數', this.score.toLocaleString()],
      ['彈珠', '⚪'.repeat(this.ballsLeft) || '—'],
      ['倍率', `×${this.multiplier}`],
    ]);
  }

  fieldTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 940;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#1a237e');
    g.addColorStop(0.5, '#4a148c');
    g.addColorStop(1, '#880e4f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`;
      ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
    }
    ctx.strokeStyle = 'rgba(255,235,59,0.35)';
    ctx.lineWidth = 6;
    for (let r = 60; r < 400; r += 60) {
      ctx.beginPath();
      ctx.arc(256, 300, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = 'bold 70px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText('台灣', 256, 560);
    ctx.fillText('彈珠台', 256, 650);
    ctx.fillStyle = '#ff4081';
    ctx.beginPath();
    ctx.moveTo(256, 880);
    ctx.lineTo(236, 840);
    ctx.lineTo(276, 840);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return this.track(tex);
  }

  update(dt) {
    // 擋板
    const speed = 22; // rad/s
    for (const f of this.flippers) {
      const target = f.pressed ? f.active : f.rest;
      const diff = target - f.angle;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
      f.body.angularVelocity.set(0, Math.abs(diff) > 1e-3 ? step / dt : 0, 0);
    }
    if (this.charging) this.charge = Math.min(1, this.charge + dt * 1.2);

    const sub = 4;
    for (let i = 0; i < sub; i++) {
      this.world.step(dt / sub);
      for (const f of this.flippers) {
        // 夾住角度範圍，避免漂移
        const e = new CANNON.Vec3();
        f.body.quaternion.toEuler(e);
        f.angle = e.y;
        const lo = Math.min(f.rest, f.active), hi = Math.max(f.rest, f.active);
        if (f.angle < lo || f.angle > hi) {
          f.angle = THREE.MathUtils.clamp(f.angle, lo, hi);
          f.body.quaternion.setFromEuler(0, f.angle, 0);
          f.body.angularVelocity.setZero();
        }
      }
      // 限制最高速度避免穿牆
      const v = this.ballBody.velocity;
      const sp = v.length();
      if (sp > 22) v.scale(22 / sp, v);
    }
    for (const f of this.flippers) f.group.rotation.y = f.angle;

    const p = this.ballBody.position;
    this.ball.position.copy(p);
    this.ball.quaternion.copy(this.ballBody.quaternion);
    this.plunger.position.set((LANE_X + W) / 2, BALL_R, 5.6 + this.charge * 0.35);
    this.launchBtn.classList.toggle('hidden', !this.inPlungerLane());

    for (const b of this.bumpers) {
      b.flash = Math.max(0, b.flash - dt * 4);
      b.cap.material.emissive.setRGB(0.3 + b.flash, b.flash * 0.6, 0.05);
    }
    for (const s of [...this.lanes, ...this.stars]) s.cool -= dt;

    // 卡住偵測
    if (!this.inPlungerLane() && this.ballBody.velocity.length() < 0.15) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 3) {
        this.ballBody.velocity.set((Math.random() - 0.5) * 4, 0, -3);
        this.stuckTimer = 0;
      }
    } else this.stuckTimer = 0;

    // 掉球
    if (p.z > BOTTOM + 0.2) {
      this.ballsLeft--;
      this.updateHud();
      sfx.lose();
      if (this.ballsLeft <= 0) {
        this.flash('遊戲結束', 1500, 'big');
        this.ballBody.velocity.setZero();
        this.ballBody.position.set(0, -5, 0);
        this.endSoon(this.score, 1500);
      } else {
        this.flash(`剩 ${this.ballsLeft} 顆`, 1200);
        this.multiplier = 1;
        this.resetBall();
        this.updateHud();
      }
    }
    // 防呆：飛出桌外
    if (!this.stopped && (p.y < -1 || p.y > 3 || Math.abs(p.x) > W + 0.5 || p.z < TOP - 0.5)) this.resetBall();
  }

  currentScore() {
    return this.score;
  }
}
