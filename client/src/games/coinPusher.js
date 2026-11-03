import * as CANNON from 'cannon-es';
import { GameBase, THREE } from './base.js';
import { sfx } from './audio.js';

const COIN_R = 0.32;
const COIN_H = 0.09;
const START_COINS = 25;
const FIELD_W = 2.5; // 半寬
const FRONT_Z = 2.0;
const WALL_END_Z = 0.9; // 側牆到這裡為止，之後側邊掉落 = 沒收
const PUSH_MIN = -1.7, PUSH_MAX = -0.3, PUSH_DEPTH = 3;
const PUSH_H = 0.5;

export default class CoinPusher extends GameBase {
  setup() {
    this.addArcadeRoom();
    const s = this.scene;
    this.camera.position.set(0, 5.2, 7.2);
    this.camera.lookAt(0, 0.2, -0.2);

    const spot = new THREE.SpotLight('#fff1d6', 120, 25, Math.PI / 5, 0.4);
    spot.position.set(0, 9, 3);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    s.add(spot, spot.target);
    s.add(new THREE.PointLight('#ff4fa3', 10, 8).translateX(-3).translateY(2));
    s.add(new THREE.PointLight('#41e8ff', 10, 8).translateX(3).translateY(2));

    // ---- 物理世界 ----
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 8;
    this.world = world;
    const coinMat = new CANNON.Material('coin');
    const surfMat = new CANNON.Material('surface');
    world.addContactMaterial(new CANNON.ContactMaterial(coinMat, surfMat, { friction: 0.25, restitution: 0.05 }));
    world.addContactMaterial(new CANNON.ContactMaterial(coinMat, coinMat, { friction: 0.3, restitution: 0.05 }));
    this.coinMat = coinMat;

    const box = (w, h, d, x, y, z, color, visible = true, opts = {}) => {
      const body = new CANNON.Body({ mass: 0, material: surfMat, type: opts.kinematic ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
      body.position.set(x, y, z);
      world.addBody(body);
      let mesh = null;
      if (visible) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.material || new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }));
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        mesh.castShadow = !!opts.cast;
        s.add(mesh);
      }
      return { body, mesh };
    };

    // 地板（前端到 FRONT_Z）
    box(FIELD_W * 2, 0.4, FRONT_Z + 3.5, 0, -0.2, (FRONT_Z - 3.5) / 2, '#c9a227', true, {
      material: new THREE.MeshStandardMaterial({ color: '#b08d2a', roughness: 0.35, metalness: 0.6 }),
    });
    // 側牆（玻璃）
    const glass = new THREE.MeshPhysicalMaterial({ color: '#aee6ff', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, side: THREE.DoubleSide });
    const wallLen = WALL_END_Z + 3.5;
    box(0.1, 2.5, wallLen, -FIELD_W - 0.05, 1.25, WALL_END_Z - wallLen / 2, null, true, { material: glass });
    box(0.1, 2.5, wallLen, FIELD_W + 0.05, 1.25, WALL_END_Z - wallLen / 2, null, true, { material: glass });
    // 後方擋牆（擋住推台上方的金幣）
    box(FIELD_W * 2, 2, 0.2, 0, PUSH_H + 1.05, -2.1, '#3a1f5c');
    box(FIELD_W * 2, 3, 0.2, 0, 1.5, -3.6, '#2a1645');
    // 推台
    this.pusher = box(FIELD_W * 2 - 0.02, PUSH_H, PUSH_DEPTH, 0, PUSH_H / 2 + 0.001, PUSH_MAX - PUSH_DEPTH / 2, '#d9d9e3', true, {
      kinematic: true, cast: true,
      material: new THREE.MeshStandardMaterial({ color: '#e0e0ea', roughness: 0.2, metalness: 0.9 }),
    });
    this.pushT = 0;

    // 機台外殼
    const cab = new THREE.MeshStandardMaterial({ color: '#b8322a', roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W * 2 + 1, 2, 6.5), cab);
    base.position.set(0, -1.4, -0.9);
    s.add(base);
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.4), cab);
      pillar.position.set(sx * (FIELD_W + 0.3), 1, WALL_END_Z);
      s.add(pillar);
    }
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W * 2 + 1, 0.9, 0.3), new THREE.MeshBasicMaterial({ map: this.textTexture('★ 推金幣 ★', { bg: '#ffcf3a', color: '#8e1c0e' }) }));
    marquee.position.set(0, 3.4, WALL_END_Z);
    s.add(marquee);
    // 出口托盤
    const tray = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W * 2, 0.15, 1), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.5 }));
    tray.position.set(0, -0.9, FRONT_Z + 0.7);
    s.add(tray);
    // 燈泡
    this.bulbs = [];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffe14f' }));
      b.position.set(-FIELD_W - 0.3 + (i / 13) * (FIELD_W * 2 + 0.6), 2.9, WALL_END_Z + 0.2);
      s.add(b);
      this.bulbs.push(b);
    }

    // 投幣器
    this.dropX = 0;
    this.dropper = new THREE.Group();
    const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd54f', metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide }));
    const ghost = new THREE.Mesh(new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 24), new THREE.MeshBasicMaterial({ color: '#ffe082', transparent: true, opacity: 0.6 }));
    ghost.position.y = -0.4;
    this.dropper.add(chute, ghost);
    this.dropper.position.set(0, 2.6, -1.25);
    s.add(this.dropper);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W * 2, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.9 }));
    rail.position.set(0, 2.9, -1.25);
    s.add(rail);

    // 金幣
    this.coinGeo = this.track(new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 24));
    this.bigGeo = this.track(new THREE.CylinderGeometry(COIN_R * 1.5, COIN_R * 1.5, COIN_H * 1.4, 28));
    this.coinMats = {
      normal: this.track(new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.85, roughness: 0.25 })),
      big: this.track(new THREE.MeshStandardMaterial({ color: '#ff6f61', metalness: 0.7, roughness: 0.2, emissive: '#4a0a00' })),
    };
    this.coins = [];
    this.coinsLeft = START_COINS;
    this.won = 0;
    this.settling = 1.5;
    this.cooldown = 0;
    this.idleTimer = 0;

    // 預先鋪滿金幣
    for (let i = 0; i < 46; i++) {
      this.addCoin((Math.random() * 2 - 1) * (FIELD_W - 0.4), 0.2 + Math.random() * 0.8, PUSH_MAX + 0.4 + Math.random() * (FRONT_Z - PUSH_MAX - 0.8));
    }
    for (let i = 0; i < 12; i++) this.addCoin((Math.random() * 2 - 1) * (FIELD_W - 0.4), PUSH_H + 0.3 + Math.random() * 0.5, -1.9 + Math.random() * 1.2);
    for (let i = 0; i < 3; i++) this.addCoin((Math.random() * 2 - 1) * 1.5, 0.8, 0.6 + Math.random(), 'big');

    // 輸入
    this.raycaster = new THREE.Raycaster();
    this.dropPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.25);
    this.keys = new Set();
    this.on(this.canvas, 'pointermove', (e) => this.aim(e));
    this.on(this.canvas, 'pointerdown', (e) => {
      this.aim(e);
      this.drop();
    });
    this.on(window, 'keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        this.drop();
      }
      this.keys.add(e.key);
    });
    this.on(window, 'keyup', (e) => this.keys.delete(e.key));
    this.updateHud();
    this.flash('點擊投下金幣！', 1500);
  }

  addCoin(x, y, z, type = 'normal') {
    const big = type === 'big';
    const body = new CANNON.Body({
      mass: big ? 0.25 : 0.1,
      material: this.coinMat,
      shape: new CANNON.Cylinder(COIN_R * (big ? 1.5 : 1), COIN_R * (big ? 1.5 : 1), COIN_H * (big ? 1.4 : 1), 10),
      sleepSpeedLimit: 0.08,
      sleepTimeLimit: 0.5,
      linearDamping: 0.05,
      angularDamping: 0.3,
    });
    body.position.set(x, y, z);
    body.quaternion.setFromEuler((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    this.world.addBody(body);
    const mesh = new THREE.Mesh(big ? this.bigGeo : this.coinGeo, this.coinMats[big ? 'big' : 'normal']);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const c = { body, mesh, type, value: big ? 5 : 1 };
    this.coins.push(c);
    return c;
  }

  aim(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dropPlane, p)) this.dropX = THREE.MathUtils.clamp(p.x, -FIELD_W + 0.45, FIELD_W - 0.45);
  }

  drop() {
    if (this.cooldown > 0 || this.coinsLeft <= 0 || this.stopped) return;
    this.coinsLeft--;
    this.cooldown = 0.28;
    this.idleTimer = 0;
    const c = this.addCoin(this.dropX + (Math.random() - 0.5) * 0.05, 2.2, -1.25);
    c.body.velocity.set(0, -1, 0.3);
    sfx.clack();
    this.updateHud();
  }

  updateHud() {
    this.setHud([
      ['剩餘金幣', this.coinsLeft, this.coinsLeft <= 5 ? 'warn' : ''],
      ['贏得', this.won],
      ['彩票', `≈${this.won * 4}`],
    ]);
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.dropX = Math.max(-FIELD_W + 0.45, this.dropX - dt * 3);
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.dropX = Math.min(FIELD_W - 0.45, this.dropX + dt * 3);
    this.dropper.position.x += (this.dropX - this.dropper.position.x) * Math.min(1, dt * 20);

    // 推台運動（kinematic：用速度驅動）
    this.pushT += dt;
    const w = 1.4;
    const amp = (PUSH_MAX - PUSH_MIN) / 2, mid = (PUSH_MAX + PUSH_MIN) / 2;
    const front = mid + Math.sin(this.pushT * w) * amp;
    const pb = this.pusher.body;
    // 解析速度 + 位置誤差修正，避免累積漂移
    pb.velocity.set(0, 0, Math.cos(this.pushT * w) * amp * w + (front - PUSH_DEPTH / 2 - pb.position.z) * 5);
    this.world.step(1 / 60, dt, 3);
    this.pusher.mesh.position.copy(pb.position);
    // 推台移動時叫醒附近的金幣
    for (const c of this.coins) if (c.body.sleepState === CANNON.Body.SLEEPING && c.body.position.z < front + 0.8 && c.body.position.z > front - 0.2) c.body.wakeUp();

    if (this.settling > 0) this.settling -= dt;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.mesh.position.copy(c.body.position);
      c.mesh.quaternion.copy(c.body.quaternion);
      if (c.body.position.y < -0.8) {
        const p = c.body.position;
        const win = p.z > FRONT_Z - 0.2 && Math.abs(p.x) < FIELD_W + 0.2;
        if (win && this.settling <= 0) {
          this.won += c.value;
          sfx.coin();
          if (c.type === 'big') this.flash('🔴 大金幣 +5！', 1000, 'gold');
          this.updateHud();
        }
        this.world.removeBody(c.body);
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }
    // 偶爾補一枚大金幣進場（讓台面不會空掉）
    if (this.coins.length < 45 && Math.random() < dt * 0.15) this.addCoin((Math.random() * 2 - 1) * 1.5, PUSH_H + 0.6, -1.8, Math.random() < 0.15 ? 'big' : 'normal');

    const t = this.pushT;
    this.bulbs.forEach((b, i) => b.material.color.set((i + Math.floor(t * 6)) % 3 === 0 ? '#ffe14f' : '#5a3a10'));

    if (this.coinsLeft <= 0) {
      this.idleTimer += dt;
      if (this.idleTimer > 6) {
        this.flash('金幣用完囉！', 1500, 'big');
        this.endSoon(this.won, 1500);
      }
    }
  }

  currentScore() {
    return this.won;
  }

  onDispose() {
    this.world = null;
  }
}
