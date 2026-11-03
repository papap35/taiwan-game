import * as CANNON from 'cannon-es';
import { GameBase, THREE } from './base.js';
import { sfx } from './audio.js';

const DURATION = 40;
const BALL_R = 0.22;
const RIM_R = 0.42;
const HOOP = { y: 3.0, z: -3.6 };
const LANE_HALF = 1.5;
const SLOPE = 0.11; // 坡度（往玩家方向下降）
const READY = new THREE.Vector3(0, 0.95, 2.3);

export default class Basketball extends GameBase {
  setup() {
    const s = this.scene;
    this.addArcadeRoom();
    this.camera.position.set(0, 2.7, 6.3);
    this.camera.lookAt(0, 2.0, -3);
    const spot = new THREE.SpotLight('#ffffff', 90, 20, Math.PI / 4, 0.5);
    spot.position.set(0, 7, 1);
    spot.target.position.set(0, 0, -2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    s.add(spot, spot.target);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.solver.iterations = 10;
    this.world = world;
    const ballMat = new CANNON.Material('ball');
    const hardMat = new CANNON.Material('hard');
    const netMat = new CANNON.Material('net');
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, hardMat, { friction: 0.3, restitution: 0.55 }));
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, netMat, { friction: 0.2, restitution: 0.15 }));
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, ballMat, { friction: 0.2, restitution: 0.5 }));
    this.ballMat = ballMat;

    const addBox = (w, h, d, pos, rotX = 0, material = hardMat, mesh = null) => {
      const b = new CANNON.Body({ mass: 0, material, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) });
      b.position.set(pos.x, pos.y, pos.z);
      b.quaternion.setFromEuler(rotX, 0, 0);
      world.addBody(b);
      if (mesh) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mesh);
        m.position.copy(pos);
        m.rotation.x = rotX;
        m.receiveShadow = true;
        s.add(m);
      }
      return b;
    };
    // 斜坡地板
    const laneLen = 7.5;
    const wood = new THREE.MeshStandardMaterial({ map: this.woodTexture(), roughness: 0.6 });
    addBox(LANE_HALF * 2, 0.2, laneLen, new THREE.Vector3(0, 0.4 + Math.sin(SLOPE) * 0.5, -0.75), SLOPE, hardMat, wood);
    // 前擋
    addBox(LANE_HALF * 2, 0.6, 0.1, new THREE.Vector3(0, 0.35, 2.95), 0, hardMat, new THREE.MeshStandardMaterial({ color: '#5d4037' }));
    // 側邊網子（看不見的牆 + 半透明網）
    const netLook = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
    for (const sx of [-1, 1]) {
      addBox(0.1, 4.5, laneLen, new THREE.Vector3(sx * (LANE_HALF + 0.05), 2.4, -0.75), 0, netMat, netLook);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, laneLen), new THREE.MeshStandardMaterial({ color: '#3e2723' }));
      rail.position.set(sx * (LANE_HALF + 0.06), 0.6, -0.75);
      s.add(rail);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6), new THREE.MeshStandardMaterial({ color: '#9e9e9e', metalness: 0.8 }));
      post.position.set(sx * (LANE_HALF + 0.06), 2.3, -4.4);
      s.add(post);
    }
    addBox(LANE_HALF * 2, 4.5, 0.1, new THREE.Vector3(0, 2.4, -4.5), 0, netMat);
    addBox(LANE_HALF * 2 + 0.2, 0.1, 6, new THREE.Vector3(0, 4.7, -1.6), 0, netMat);

    // 籃框組（可左右移動）
    this.hoop = new THREE.Group();
    s.add(this.hoop);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.06), new THREE.MeshStandardMaterial({ map: this.boardTexture(), roughness: 0.3 }));
    board.position.set(0, HOOP.y + 0.45, HOOP.z - RIM_R - 0.2);
    board.castShadow = true;
    this.hoop.add(board);
    const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.03, 12, 40), new THREE.MeshStandardMaterial({ color: '#ff6d00', metalness: 0.6, roughness: 0.3 }));
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(0, HOOP.y, HOOP.z);
    this.hoop.add(rimMesh);
    // 籃網（線段）
    const netPts = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
      const top = (ang) => new THREE.Vector3(Math.cos(ang) * RIM_R, HOOP.y, HOOP.z + Math.sin(ang) * RIM_R);
      const bot = (ang) => new THREE.Vector3(Math.cos(ang) * RIM_R * 0.6, HOOP.y - 0.5, HOOP.z + Math.sin(ang) * RIM_R * 0.6);
      netPts.push(top(a), bot(b), top(b), bot(a), bot(a), bot(b));
    }
    this.net = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(netPts), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.hoop.add(this.net);

    this.boardBody = addBox(1.8, 1.2, 0.06, new THREE.Vector3(0, HOOP.y + 0.45, HOOP.z - RIM_R - 0.2));
    this.rimBodies = [];
    const RIM_SEG = 22;
    for (let i = 0; i < RIM_SEG; i++) {
      const a = (i / RIM_SEG) * Math.PI * 2;
      const b = new CANNON.Body({ mass: 0, material: hardMat, shape: new CANNON.Sphere(0.035) });
      b.userData = { ox: Math.cos(a) * RIM_R, oz: Math.sin(a) * RIM_R };
      b.position.set(b.userData.ox, HOOP.y, HOOP.z + b.userData.oz);
      world.addBody(b);
      this.rimBodies.push(b);
    }
    this.hoopX = 0;

    // 計分板
    this.scoreCanvas = document.createElement('canvas');
    this.scoreCanvas.width = 256;
    this.scoreCanvas.height = 96;
    this.scoreTex = this.track(new THREE.CanvasTexture(this.scoreCanvas));
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: this.scoreTex }));
    sb.position.set(0, 4.45, -4.4);
    s.add(sb);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), new THREE.MeshBasicMaterial({ map: this.textTexture('投籃機 HOOPS', { bg: '#b71c1c', color: '#fff', glow: '#ffeb3b' }) }));
    sign.position.set(0, 5, -4.4);
    s.add(sign);

    // 籃球
    this.ballGeo = this.track(new THREE.SphereGeometry(BALL_R, 32, 16));
    this.ballMatVis = this.track(new THREE.MeshStandardMaterial({ map: this.ballTexture(), roughness: 0.7 }));
    this.balls = [];
    for (let i = 0; i < 4; i++) this.addBall(-0.9 + i * 0.6, 1.2, 2.2);

    this.timeLeft = DURATION;
    this.ready = null;
    this.swipe = null;
    this.bindInput();
    this.updateHud();
    this.drawScoreboard();
    this.flash('往上甩出籃球！', 1500);
  }

  addBall(x, y, z) {
    const body = new CANNON.Body({ mass: 0.6, material: this.ballMat, shape: new CANNON.Sphere(BALL_R), linearDamping: 0.05, angularDamping: 0.2 });
    body.position.set(x, y, z);
    this.world.addBody(body);
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMatVis);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const b = { body, mesh, prevY: y, scored: false, shot: false };
    this.balls.push(b);
    return b;
  }

  bindInput() {
    this.on(this.canvas, 'pointerdown', (e) => {
      this.swipe = { id: e.pointerId, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
      this.canvas.setPointerCapture?.(e.pointerId);
    });
    this.on(this.canvas, 'pointermove', (e) => {
      if (!this.swipe || e.pointerId !== this.swipe.id) return;
      this.swipe.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (this.swipe.pts.length > 20) this.swipe.pts.shift();
    });
    const up = (e) => {
      if (!this.swipe || e.pointerId !== this.swipe.id) return;
      const pts = this.swipe.pts;
      this.swipe = null;
      const now = performance.now();
      const recent = pts.filter((p) => now - p.t < 150);
      const first = recent[0] || pts[0];
      const last = pts[pts.length - 1];
      const dt = Math.max(0.016, (last.t - first.t) / 1000);
      const vy = (first.y - last.y) / dt; // 往上為正
      const vx = (last.x - first.x) / dt;
      const totalDy = pts[0].y - last.y;
      if (totalDy < 25 || vy < 200) return;
      const h = this.canvas.clientHeight;
      this.shoot(vy / h, vx / h);
    };
    this.on(window, 'pointerup', up);
    this.on(window, 'pointercancel', up);
    // 鍵盤：空白鍵以中等力道投（方便測試 / 無障礙）
    this.on(window, 'keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        this.shoot(1.68 + (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.15);
      }
    });
  }

  shoot(power, side) {
    if (!this.ready || this.stopped) return;
    const b = this.ready;
    this.ready = null;
    const p = THREE.MathUtils.clamp(power, 0.4, 3);
    // 甩動越快越遠：速度 6 ~ 12
    const speed = THREE.MathUtils.clamp(5.2 + p * 2.6, 6, 12.5);
    const ang = THREE.MathUtils.degToRad(53);
    b.body.type = CANNON.Body.DYNAMIC;
    b.body.mass = 0.6;
    b.body.updateMassProperties();
    b.body.wakeUp();
    b.body.velocity.set(THREE.MathUtils.clamp(side, -1, 1) * 2.2 + this.hoopX * 0.0, speed * Math.sin(ang), -speed * Math.cos(ang));
    b.body.angularVelocity.set(-8, 0, 0);
    b.shot = true;
    b.scored = false;
    sfx.swish();
  }

  pickReady() {
    // 從前方球架挑一顆接近靜止的球
    let best = null;
    for (const b of this.balls) {
      if (b === this.ready) continue;
      const p = b.body.position;
      if (p.z > 1.6 && p.y < 1.3 && b.body.velocity.length() < 1.5) {
        if (!best || Math.abs(p.x) < Math.abs(best.body.position.x)) best = b;
      }
    }
    if (!best) return;
    this.ready = best;
    best.body.type = CANNON.Body.KINEMATIC;
    best.body.velocity.setZero();
    best.body.angularVelocity.setZero();
    best.shot = false;
  }

  updateHud() {
    const bonus = this.timeLeft <= 10;
    this.setHud([
      ['分數', this.score],
      ['時間', Math.ceil(Math.max(0, this.timeLeft)), this.timeLeft <= 10 ? 'warn' : ''],
      ...(bonus ? [['加倍', '×2', 'gold']] : []),
    ]);
  }

  drawScoreboard() {
    const ctx = this.scoreCanvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 256, 96);
    ctx.font = 'bold 56px "Press Start 2P", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff1744';
    ctx.textAlign = 'left';
    ctx.fillText(String(this.score).padStart(2, '0'), 10, 52);
    ctx.fillStyle = '#ffea00';
    ctx.textAlign = 'right';
    ctx.font = 'bold 40px "Press Start 2P", monospace';
    ctx.fillText(String(Math.ceil(Math.max(0, this.timeLeft))), 248, 52);
    this.scoreTex.needsUpdate = true;
  }

  update(dt) {
    const prevSec = Math.ceil(this.timeLeft);
    this.timeLeft -= dt;
    if (Math.ceil(this.timeLeft) !== prevSec) {
      this.updateHud();
      this.drawScoreboard();
      if (Math.ceil(this.timeLeft) === 10) {
        this.flash('最後 10 秒 得分加倍！', 1500, 'gold');
        sfx.fanfare();
      }
      if (this.timeLeft < 5 && this.timeLeft > 0) sfx.tick();
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.flash('時間到！', 1500, 'big');
      this.endSoon(this.score, 1600);
      return;
    }
    // 20 秒後籃框開始左右移動
    const elapsed = DURATION - this.timeLeft;
    this.hoopX = elapsed > 20 ? Math.sin((elapsed - 20) * 1.2) * 0.75 : 0;
    this.hoop.position.x = this.hoopX;
    this.boardBody.position.x = this.hoopX;
    for (const r of this.rimBodies) r.position.x = this.hoopX + r.userData.ox;

    if (!this.ready) this.pickReady();
    if (this.ready) {
      const b = this.ready.body;
      b.position.x += (READY.x - b.position.x) * Math.min(1, dt * 12);
      b.position.y += (READY.y - b.position.y) * Math.min(1, dt * 12);
      b.position.z += (READY.z - b.position.z) * Math.min(1, dt * 12);
    }

    this.world.step(1 / 120, dt, 6);

    for (const b of this.balls) {
      const p = b.body.position;
      // 進球判定：由上往下穿過籃框平面，且在籃框內
      if (b.shot && !b.scored && b.prevY > HOOP.y && p.y <= HOOP.y) {
        const d = Math.hypot(p.x - this.hoopX, p.z - HOOP.z);
        if (d < RIM_R - BALL_R * 0.35) {
          b.scored = true;
          const pts = this.timeLeft <= 10 ? 4 : 2;
          this.score += pts;
          this.netWobble = 1;
          sfx.swish();
          sfx.ding();
          this.flash(`+${pts}`, 600, pts > 2 ? 'gold' : '');
          this.updateHud();
          this.drawScoreboard();
        }
      }
      b.prevY = p.y;
      // 防呆：卡在奇怪的地方就送回球架
      if (p.y < -1 || p.z > 3.5 || Math.abs(p.x) > 2.5) {
        b.body.position.set((Math.random() - 0.5) * 1.5, 1.4, 2.2);
        b.body.velocity.setZero();
      }
      b.mesh.position.copy(p);
      b.mesh.quaternion.copy(b.body.quaternion);
    }
    if (this.netWobble > 0) {
      this.netWobble = Math.max(0, this.netWobble - dt * 3);
      this.net.scale.set(1 - this.netWobble * 0.15, 1 + this.netWobble * 0.25, 1 - this.netWobble * 0.15);
    }
  }

  woodTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = `hsl(30, 45%, ${45 + Math.random() * 10}%)`;
      ctx.fillRect(x, 0, 32, 512);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, 0, 2, 512);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 80, 70, 0, Math.PI);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return this.track(t);
  }

  boardTexture() {
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 240;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, 360, 240);
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 344, 224);
    ctx.strokeRect(120, 110, 120, 90);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return this.track(t);
  }

  ballTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e65100';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#1a0a00';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(256, 64);
    for (const x of [64, 192]) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 128);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(128, 64, 40, 64, 0, 0, Math.PI * 2);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return this.track(t);
  }

  currentScore() {
    return this.score;
  }
}
