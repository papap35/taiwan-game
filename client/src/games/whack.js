import { GameBase, THREE } from './base.js';
import { sfx } from './audio.js';

const DURATION = 30;
const HOLE_GAP = 1.15;

export default class Whack extends GameBase {
  setup() {
    this.addArcadeRoom();
    const s = this.scene;
    this.camera.position.set(0, 6.2, 4.6);
    this.camera.lookAt(0, 0.6, 0.3);

    const key = new THREE.SpotLight('#fff3e0', 60, 20, Math.PI / 4, 0.5);
    key.position.set(2, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    s.add(key, key.target);

    // 機台本體
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#ef6c00', roughness: 0.5 }));
    body.position.y = 0.2;
    body.receiveShadow = true;
    s.add(body);
    const topMat = new THREE.MeshStandardMaterial({ color: '#ffa726', roughness: 0.6 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 3.8), topMat);
    top.position.y = 1.02;
    top.receiveShadow = true;
    s.add(top);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: this.textTexture('打地鼠', { bg: '#6d4c41', color: '#ffe0b2', glow: '#ff9800' }) }));
    sign.position.set(0, 2.1, -2);
    s.add(sign);
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 0.2), new THREE.MeshStandardMaterial({ color: '#4e342e' }));
    back.position.set(0, 1.6, -2.1);
    s.add(back);

    // 洞 + 地鼠
    this.moles = [];
    const holeMat = new THREE.MeshStandardMaterial({ color: '#1b0f0a' });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.8 });
    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * HOLE_GAP, z = (Math.floor(i / 3) - 1) * HOLE_GAP;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, 1.085, z);
      s.add(hole);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 8, 32), rimMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, 1.09, z);
      s.add(rim);
      const mole = this.makeMole();
      mole.position.set(x, -0.4, z);
      s.add(mole);
      this.moles.push({ group: mole, x, z, state: 'down', t: 0, upTime: 0, type: 'normal', hit: false, idx: i });
    }

    // 槌子
    this.hammer = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1), new THREE.MeshStandardMaterial({ color: '#8d6e63' }));
    handle.position.set(0, 0.55, 0.3);
    handle.rotation.x = Math.PI / 2.6;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 20), new THREE.MeshStandardMaterial({ color: '#e53935', roughness: 0.4 }));
    head.rotation.z = Math.PI / 2;
    head.castShadow = true;
    const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 20), new THREE.MeshStandardMaterial({ color: '#ffeb3b' }));
    cap1.rotation.z = Math.PI / 2;
    cap1.position.x = 0.28;
    const cap2 = cap1.clone();
    cap2.position.x = -0.28;
    this.hammer.add(handle, head, cap1, cap2);
    this.hammer.position.set(0, 2.2, 1);
    s.add(this.hammer);
    this.swing = 0;

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
    this.timeLeft = DURATION;
    this.countdown = 3;
    this.spawnTimer = 0;
    this.combo = 0;

    this.on(this.canvas, 'pointermove', (e) => this.aim(e));
    this.on(this.canvas, 'pointerdown', (e) => {
      this.aim(e);
      this.strike();
    });
    this.on(window, 'keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        // 數字鍵配置跟九宮格鍵盤一樣（7 8 9 在上）
        const map = [6, 7, 8, 3, 4, 5, 0, 1, 2];
        const m = this.moles[map[n - 1]];
        this.hammer.position.x = m.x;
        this.hammer.position.z = m.z + 0.1;
        this.strike();
      }
    });
    this.updateHud();
  }

  makeMole() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.8, 24), mat);
    body.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 16), mat);
    head.position.y = 0.8;
    head.castShadow = true;
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#111' });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    e1.position.set(-0.12, 0.9, 0.28);
    const e2 = e1.clone();
    e2.position.x = 0.12;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: '#f48fb1' }));
    nose.position.set(0, 0.8, 0.32);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), new THREE.MeshStandardMaterial({ color: '#fff' }));
    teeth.position.set(0, 0.7, 0.31);
    // 炸彈外觀（預設隱藏）
    const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 16), new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.3, metalness: 0.4 }));
    bomb.position.y = 0.75;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25), new THREE.MeshStandardMaterial({ color: '#795548' }));
    fuse.position.y = 1.18;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffeb3b' }));
    spark.position.y = 1.32;
    const bombGroup = new THREE.Group();
    bombGroup.add(bomb, fuse, spark);
    bombGroup.visible = false;
    const moleGroup = new THREE.Group();
    moleGroup.add(body, head, e1, e2, nose, teeth);
    g.add(moleGroup, bombGroup);
    g.userData = { mat, moleGroup, bombGroup, spark, eyes: [e1, e2] };
    return g;
  }

  aim(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, p)) {
      this.hammer.position.x = THREE.MathUtils.clamp(p.x, -2, 2);
      this.hammer.position.z = THREE.MathUtils.clamp(p.z + 0.1, -2, 2);
    }
  }

  strike() {
    if (this.swing > 0) return;
    this.swing = 1;
    if (this.countdown > 0) return;
    const hx = this.hammer.position.x, hz = this.hammer.position.z - 0.1;
    let target = null, best = 0.55;
    for (const m of this.moles) {
      if (m.state === 'down' || m.hit) continue;
      const d = Math.hypot(m.x - hx, m.z - hz);
      if (d < best) {
        best = d;
        target = m;
      }
    }
    if (!target) {
      sfx.thud();
      this.combo = 0;
      return;
    }
    target.hit = true;
    target.state = 'falling';
    if (target.type === 'bomb') {
      this.score = Math.max(0, this.score - 20);
      this.combo = 0;
      sfx.bad();
      this.flash('💥 -20', 800, 'bad');
    } else {
      this.combo++;
      const pts = (target.type === 'gold' ? 30 : 10) + (this.combo >= 5 ? 5 : 0);
      this.score += pts;
      sfx.whack();
      if (target.type === 'gold') sfx.coin();
      this.flash(`${target.type === 'gold' ? '⭐ ' : ''}+${pts}${this.combo >= 5 ? ` 連擊×${this.combo}` : ''}`, 600, target.type === 'gold' ? 'gold' : '');
    }
    // 被打扁
    target.group.scale.set(1.25, 0.6, 1.25);
    target.group.userData.eyes.forEach((e) => (e.scale.y = 0.2));
    this.updateHud();
  }

  spawn() {
    const free = this.moles.filter((m) => m.state === 'down');
    if (!free.length) return;
    const m = free[Math.floor(Math.random() * free.length)];
    const r = Math.random();
    const progress = 1 - this.timeLeft / DURATION;
    m.type = r < 0.1 ? 'gold' : r < 0.1 + 0.08 + progress * 0.08 ? 'bomb' : 'normal';
    m.state = 'rising';
    m.t = 0;
    m.hit = false;
    m.upTime = THREE.MathUtils.lerp(1.1, 0.55, progress) * (m.type === 'gold' ? 0.7 : 1);
    const ud = m.group.userData;
    ud.moleGroup.visible = m.type !== 'bomb';
    ud.bombGroup.visible = m.type === 'bomb';
    ud.mat.color.set(m.type === 'gold' ? '#ffca28' : '#8d6e63');
    ud.mat.metalness = m.type === 'gold' ? 0.6 : 0;
    m.group.scale.set(1, 1, 1);
    ud.eyes.forEach((e) => (e.scale.y = 1));
  }

  updateHud() {
    this.setHud([
      ['分數', this.score],
      ['時間', Math.ceil(Math.max(0, this.timeLeft)), this.timeLeft < 6 ? 'warn' : ''],
    ]);
  }

  update(dt) {
    // 槌子揮動
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 6);
      const a = Math.sin(this.swing * Math.PI);
      this.hammer.position.y = 2.2 - a * 0.9;
      this.hammer.rotation.x = -a * 0.9;
    }
    if (this.countdown > 0) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== prev || !this.shown) {
        this.shown = true;
        if (this.countdown > 0) {
          this.flash(String(Math.ceil(this.countdown)), 700, 'big');
          sfx.tick();
        } else {
          this.flash('開始！', 700, 'big');
          sfx.ding();
        }
      }
      return;
    }
    const prevSec = Math.ceil(this.timeLeft);
    this.timeLeft -= dt;
    if (Math.ceil(this.timeLeft) !== prevSec) {
      this.updateHud();
      if (this.timeLeft < 5.5 && this.timeLeft > 0) sfx.tick();
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.updateHud();
      this.flash('時間到！', 1500, 'big');
      this.endSoon(this.score, 1300);
      return;
    }
    const progress = 1 - this.timeLeft / DURATION;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      if (progress > 0.5 && Math.random() < 0.4) this.spawn();
      this.spawnTimer = THREE.MathUtils.lerp(0.75, 0.35, progress) * (0.7 + Math.random() * 0.6);
    }
    for (const m of this.moles) {
      m.t += dt;
      const g = m.group;
      if (m.state === 'rising') {
        g.position.y = THREE.MathUtils.lerp(-0.4, 0.55, Math.min(1, m.t / 0.12));
        if (m.t >= 0.12) {
          m.state = 'up';
          m.t = 0;
        }
      } else if (m.state === 'up') {
        g.position.y = 0.55 + Math.sin(m.t * 12) * 0.02;
        if (m.type === 'bomb') g.userData.spark.scale.setScalar(0.8 + Math.random() * 0.6);
        if (m.t >= m.upTime) {
          m.state = 'falling';
          m.t = 0;
          if (m.type !== 'bomb') this.combo = 0;
        }
      } else if (m.state === 'falling') {
        g.position.y -= dt * (m.hit ? 4 : 6);
        if (g.position.y <= -0.4) {
          g.position.y = -0.4;
          m.state = 'down';
        }
      }
    }
  }

  currentScore() {
    return this.score;
  }
}
