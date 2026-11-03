import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Server as SocketServer } from 'socket.io';
import { OAuth2Client } from 'google-auth-library';
import { createServices, HttpError, cleanText } from './services.js';
import { publicCatalog } from './catalog.js';

const COOKIE = 'arcade_session';

export function createArcadeServer({
  db,
  jwtSecret,
  googleClientId = '',
  allowGuest = true,
  staticDir = null,
  verifyGoogleToken = null, // 測試用：可替換 Google token 驗證
}) {
  if (!jwtSecret) throw new Error('jwtSecret is required');
  const app = express();
  const server = http.createServer(app);
  const io = new SocketServer(server, { cors: { origin: false } });

  // ---- 線上狀態 ----
  const online = new Map(); // userId -> socket 數量
  const emitToUser = (userId, event, data) => io.to(`user:${userId}`).emit(event, data);
  const services = createServices(db, { emitToUser, isOnline: (id) => online.has(id) });

  const google = new OAuth2Client();
  const verifyGoogle = verifyGoogleToken || (async (credential) => {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: googleClientId });
    return ticket.getPayload();
  });

  const signSession = (userId) => jwt.sign({ uid: userId }, jwtSecret, { expiresIn: '30d' });
  const readSession = (token) => {
    try {
      return jwt.verify(token, jwtSecret).uid;
    } catch {
      return null;
    }
  };
  const setSessionCookie = (res, userId) => res.cookie(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 86400_000,
  });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  const api = express.Router();

  // 簡單的每 IP 速率限制（登入與寫入操作）
  const hits = new Map();
  const rateLimit = (max, windowMs) => (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const t = Date.now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    hits.set(key, arr);
    if (arr.length > max) return res.status(429).json({ error: '操作太頻繁，請稍後再試' });
    next();
  };
  setInterval(() => hits.clear(), 10 * 60_000).unref();

  const auth = (req, res, next) => {
    const uid = readSession(req.cookies[COOKIE]);
    if (!uid || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) return res.status(401).json({ error: '請先登入' });
    req.uid = uid;
    next();
  };

  const h = (fn) => async (req, res, next) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      next(err);
    }
  };

  api.get('/config', (req, res) => res.json({ googleClientId, allowGuest }));
  api.get('/catalog', (req, res) => res.json(publicCatalog()));

  api.post('/auth/google', rateLimit(20, 60_000), h(async (req, res) => {
    if (!googleClientId && !verifyGoogleToken) throw new HttpError(400, '伺服器尚未設定 GOOGLE_CLIENT_ID');
    const { credential } = req.body || {};
    if (!credential) throw new HttpError(400, '缺少 Google 憑證');
    let payload;
    try {
      payload = await verifyGoogle(credential);
    } catch {
      throw new HttpError(401, 'Google 登入驗證失敗');
    }
    if (!payload?.sub) throw new HttpError(401, 'Google 登入驗證失敗');
    const { user, created } = services.upsertGoogleUser({
      sub: payload.sub, email: payload.email, name: payload.name || payload.email?.split('@')[0], picture: payload.picture,
    });
    setSessionCookie(res, user.id);
    return { user: services.me(user.id), created };
  }));

  api.post('/auth/guest', rateLimit(10, 60_000), h(async (req, res) => {
    if (!allowGuest) throw new HttpError(403, '訪客登入已停用');
    const name = cleanText(req.body?.name, 20) || `訪客${Math.floor(Math.random() * 9000 + 1000)}`;
    const user = services.createUser({ name, isGuest: true });
    setSessionCookie(res, user.id);
    return { user: services.me(user.id), created: true };
  }));

  api.post('/auth/logout', (req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  api.use(auth);

  api.get('/me', h((req) => services.me(req.uid)));
  api.patch('/me', h((req) => {
    services.updateProfile(req.uid, req.body || {});
    const me = services.me(req.uid);
    io.emit('lobby:update', { id: me.id, name: me.name, color: me.color, hat: me.hat });
    return me;
  }));
  api.get('/users/search', h((req) => services.searchUsers(req.uid, req.query.q)));
  api.get('/users/:id', h((req) => services.profile(req.uid, Number(req.params.id))));

  api.get('/wallet/transactions', h((req) => services.transactions(req.uid)));
  api.post('/wallet/checkin', h((req) => services.checkin(req.uid)));
  api.post('/wallet/gift', rateLimit(20, 60_000), h((req) => services.gift(req.uid, Number(req.body?.toUserId), req.body?.amount)));

  api.post('/games/:id/start', rateLimit(30, 60_000), h((req) => services.startGame(req.uid, req.params.id)));
  api.post('/games/finish', h((req) => services.finishGame(req.uid, req.body?.sessionId, req.body?.score)));
  api.get('/games/history', h((req) => services.history(req.uid)));

  api.post('/shop/redeem', rateLimit(30, 60_000), h((req) => services.redeem(req.uid, req.body?.itemId)));

  api.get('/friends', h((req) => services.listFriends(req.uid)));
  api.post('/friends/request', rateLimit(30, 60_000), h((req) => services.requestFriend(req.uid, req.body || {})));
  api.post('/friends/accept', h((req) => services.acceptFriend(req.uid, Number(req.body?.userId))));
  api.delete('/friends/:id', h((req) => services.removeFriend(req.uid, Number(req.params.id))));

  api.get('/groups', h((req) => services.listGroups(req.uid)));
  api.post('/groups', rateLimit(10, 60_000), h((req) => {
    const g = services.createGroup(req.uid, req.body || {});
    joinGroupRoom(g.members.map((m) => m.id), g.id);
    return g;
  }));
  api.get('/groups/:id', h((req) => {
    const gid = Number(req.params.id);
    if (!services.groupIds(req.uid).includes(gid)) throw new HttpError(403, '你不是這個群組的成員');
    return services.groupInfo(gid, req.uid);
  }));
  api.post('/groups/:id/members', h((req) => {
    const g = services.addGroupMember(req.uid, Number(req.params.id), Number(req.body?.userId));
    joinGroupRoom([Number(req.body?.userId)], g.id);
    return g;
  }));
  api.delete('/groups/:id/members/:userId', h((req) => services.removeGroupMember(req.uid, Number(req.params.id), Number(req.params.userId))));

  api.get('/messages/conversations', h((req) => services.conversations(req.uid)));
  api.get('/messages/dm/:userId', h((req) => services.dmHistory(req.uid, Number(req.params.userId), Number(req.query.before) || Infinity)));
  api.get('/messages/group/:id', h((req) => services.groupHistory(req.uid, Number(req.params.id), Number(req.query.before) || Infinity)));
  api.post('/messages', rateLimit(60, 60_000), h((req) => services.sendMessage(req.uid, req.body || {})));
  api.post('/messages/read', h((req) => services.markRead(req.uid, req.body || {})));

  api.get('/leaderboard', h((req) => services.leaderboard(req.uid, { game: req.query.game, scope: req.query.scope })));
  api.get('/notifications', h((req) => services.notifications(req.uid)));
  api.post('/notifications/read', h((req) => services.markNotificationsRead(req.uid)));

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '格式錯誤' });
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  });

  // ---- Socket.io：即時訊息、線上狀態、多人遊戲場 ----
  function joinGroupRoom(userIds, groupId) {
    for (const uid of userIds) io.in(`user:${uid}`).socketsJoin(`group:${groupId}`);
  }

  const lobby = new Map(); // userId -> { id, name, color, hat, x, y, dir, moving }

  io.use((socket, next) => {
    const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').map((c) => {
      const i = c.indexOf('=');
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    }));
    const uid = readSession(cookies[COOKIE]);
    if (!uid || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) return next(new Error('unauthorized'));
    socket.data.uid = uid;
    next();
  });

  const notifyFriendsPresence = (uid, isOnline) => {
    for (const fid of services.friendIds(uid)) emitToUser(fid, 'presence', { userId: uid, online: isOnline });
  };

  io.on('connection', (socket) => {
    const uid = socket.data.uid;
    socket.join(`user:${uid}`);
    for (const gid of services.groupIds(uid)) socket.join(`group:${gid}`);
    const count = (online.get(uid) || 0) + 1;
    online.set(uid, count);
    if (count === 1) notifyFriendsPresence(uid, true);

    let lastMove = 0;

    socket.on('lobby:join', (pos) => {
      const u = services.getUser(uid);
      const p = {
        id: uid, name: u.name, color: u.color, hat: u.hat,
        x: Number(pos?.x) || 0, y: Number(pos?.y) || 0, dir: pos?.dir || 'down', moving: false,
      };
      lobby.set(uid, p);
      socket.join('lobby');
      socket.emit('lobby:state', [...lobby.values()].filter((x) => x.id !== uid));
      socket.to('lobby').emit('lobby:join', p);
    });

    socket.on('lobby:move', (pos) => {
      const p = lobby.get(uid);
      if (!p) return;
      const t = Date.now();
      if (t - lastMove < 40) return; // 最多 25 次/秒
      lastMove = t;
      p.x = Number(pos?.x) || 0;
      p.y = Number(pos?.y) || 0;
      p.dir = ['up', 'down', 'left', 'right'].includes(pos?.dir) ? pos.dir : 'down';
      p.moving = !!pos?.moving;
      socket.to('lobby').volatile.emit('lobby:move', { id: uid, x: p.x, y: p.y, dir: p.dir, moving: p.moving });
    });

    socket.on('lobby:status', (status) => {
      const p = lobby.get(uid);
      if (!p) return;
      p.status = cleanText(status, 20);
      socket.to('lobby').emit('lobby:status', { id: uid, status: p.status });
    });

    let sayTimes = [];
    socket.on('lobby:say', (text) => {
      const t = Date.now();
      sayTimes = sayTimes.filter((x) => t - x < 10_000);
      if (sayTimes.length >= 5) return;
      sayTimes.push(t);
      const body = cleanText(text, 60);
      if (body && lobby.has(uid)) io.to('lobby').emit('lobby:say', { id: uid, text: body });
    });

    const leaveLobby = () => {
      if (lobby.delete(uid)) io.to('lobby').emit('lobby:leave', { id: uid });
      socket.leave('lobby');
    };
    socket.on('lobby:leave', leaveLobby);

    socket.on('typing', ({ to, groupId } = {}) => {
      if (groupId && services.groupIds(uid).includes(Number(groupId))) socket.to(`group:${groupId}`).emit('typing', { from: uid, groupId: Number(groupId) });
      else if (to && services.areFriends(uid, Number(to))) emitToUser(Number(to), 'typing', { from: uid });
    });

    socket.on('disconnect', () => {
      const c = (online.get(uid) || 1) - 1;
      if (c <= 0) {
        online.delete(uid);
        if (lobby.delete(uid)) io.to('lobby').emit('lobby:leave', { id: uid });
        notifyFriendsPresence(uid, false);
      } else online.set(uid, c);
    });
  });

  return { app, server, io, services };
}
