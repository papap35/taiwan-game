import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createArcadeServer } from '../server/app.js';

let srv, base, db;

before(async () => {
  db = openDb(':memory:');
  srv = createArcadeServer({
    db,
    jwtSecret: 'test',
    googleClientId: 'test-client',
    verifyGoogleToken: async (cred) => {
      if (cred === 'bad') throw new Error('bad');
      return { sub: 'g-' + cred, email: `${cred}@gmail.com`, name: cred, picture: null };
    },
  });
  await new Promise((r) => srv.server.listen(0, r));
  base = `http://127.0.0.1:${srv.server.address().port}/api`;
});
after(() => { srv.io.close(); srv.server.close(); });

function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json();
    return { status: res.status, data };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p) };
}

test('google login, wallet, checkin', async () => {
  const a = client();
  assert.equal((await a.get('/me')).status, 401);
  assert.equal((await a.post('/auth/google', { credential: 'bad' })).status, 401);
  const r = await a.post('/auth/google', { credential: 'alice' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.tokens, 100);
  assert.equal(r.data.created, true);
  const again = await client().post('/auth/google', { credential: 'alice' });
  assert.equal(again.data.created, false);
  const c = await a.post('/wallet/checkin');
  assert.equal(c.data.reward, 30);
  assert.equal((await a.post('/wallet/checkin')).status, 400);
  assert.equal((await a.get('/me')).data.tokens, 130);
});

test('games: start costs tokens, finish caps tickets, too-fast is flagged', async () => {
  const a = client();
  await a.post('/auth/guest', { name: 'Gamer' });
  const s = await a.post('/games/claw/start');
  assert.equal(s.status, 200);
  assert.equal((await a.get('/me')).data.tokens, 90);
  const f = await a.post('/games/finish', { sessionId: s.data.sessionId, score: 1 });
  assert.equal(f.data.flagged, true); // claw minSeconds = 3
  assert.equal(f.data.tickets, 0);
  assert.equal((await a.post('/games/finish', { sessionId: s.data.sessionId, score: 1 })).status, 400);
  assert.equal((await a.post('/games/nope/start')).status, 404);
  // first-play achievement awarded
  const me = (await a.get('/me')).data;
  assert.ok(me.achievements.some((x) => x.id === 'first-play'));
});

test('ticket cap and redeem', async () => {
  const a = client();
  const { data } = await a.post('/auth/guest', { name: 'Rich' });
  const s = await a.post('/games/marie/start');
  const res = await a.post('/games/finish', { sessionId: s.data.sessionId, score: 99999 });
  assert.equal(res.data.flagged, true);
  const s2 = await a.post('/games/marie/start');
  db.prepare('UPDATE play_sessions SET started_at = started_at - 60000 WHERE id = ?').run(s2.data.sessionId);
  const res2 = await a.post('/games/finish', { sessionId: s2.data.sessionId, score: 99999 });
  assert.equal(res2.data.tickets, 200); // capped at maxTickets
  assert.equal((await a.get('/me')).data.tickets, 200);
  assert.equal((await a.post('/shop/redeem', { itemId: 'badge-boba' })).status, 200);
  assert.equal((await a.post('/shop/redeem', { itemId: 'badge-boba' })).status, 400); // already owned
  const me = (await a.get('/me')).data;
  assert.deepEqual(me.showcase, ['badge-boba']);
  assert.equal(me.tickets, 50);
  // redeem fails without tickets
  assert.equal((await a.post('/shop/redeem', { itemId: 'badge-lantern' })).status, 400);
  assert.equal(data.user.tickets, 0);
});

test('friends, groups, messages', async () => {
  const a = client(); const b = client(); const c = client();
  const ua = (await a.post('/auth/guest', { name: 'A' })).data.user;
  const ub = (await b.post('/auth/guest', { name: 'B' })).data.user;
  const uc = (await c.post('/auth/guest', { name: 'C' })).data.user;
  assert.equal((await a.post('/messages', { to: ub.id, body: 'hi' })).status, 403);
  assert.equal((await a.post('/friends/request', { code: ub.friendCode })).data.status, 'pending');
  assert.equal((await b.get('/friends')).data.incoming.length, 1);
  assert.equal((await b.post('/friends/accept', { userId: ua.id })).data.status, 'accepted');
  // reverse request auto-accepts
  await c.post('/friends/request', { userId: ua.id });
  assert.equal((await a.post('/friends/request', { userId: uc.id })).data.status, 'accepted');
  assert.equal((await a.get('/friends')).data.friends.length, 2);

  const m = await a.post('/messages', { to: ub.id, body: '  哈囉  ' });
  assert.equal(m.data.body, '哈囉');
  assert.equal((await b.get('/me')).data.unread.messages, 1);
  assert.equal((await b.get(`/messages/dm/${ua.id}`)).data.length, 1);
  await b.post('/messages/read', { userId: ua.id });
  assert.equal((await b.get('/me')).data.unread.messages, 0);

  const g = await a.post('/groups', { name: '夜市小隊', memberIds: [ub.id] });
  assert.equal(g.data.members.length, 2);
  assert.equal((await c.get(`/groups/${g.data.id}`)).status, 403);
  await a.post(`/groups/${g.data.id}/members`, { userId: uc.id });
  await b.post('/messages', { groupId: g.data.id, body: '走吧' });
  assert.equal((await c.get('/me')).data.unread.messages, 1);
  assert.equal((await c.get(`/messages/group/${g.data.id}`)).data[0].sender.name, 'B');
  const convs = (await c.get('/messages/conversations')).data;
  assert.equal(convs[0].type, 'group');
  // B is not friends with C -> cannot kick; A (owner) can
  assert.equal((await b.del(`/groups/${g.data.id}/members/${uc.id}`)).status, 403);
  assert.equal((await a.del(`/groups/${g.data.id}/members/${uc.id}`)).status, 200);

  // gifting
  assert.equal((await a.post('/wallet/gift', { toUserId: ub.id, amount: 20 })).status, 200);
  assert.equal((await b.get('/me')).data.tokens > 100, true);
  assert.equal((await a.post('/wallet/gift', { toUserId: ub.id, amount: 500 })).status, 400);

  const lb = await a.get('/leaderboard?scope=friends');
  assert.equal(lb.status, 200);
  const prof = await a.get(`/users/${ub.id}`);
  assert.equal(prof.data.relation, 'friend');
});

test('socket token: connects cross-origin, cannot be used as session cookie', async () => {
  const { io: ioc } = await import('socket.io-client');
  const a = client();
  await a.post('/auth/guest', { name: 'Sock' });
  const { data } = await a.get('/auth/socket-token');
  assert.ok(data.token);
  const port = srv.server.address().port;
  const ok = await new Promise((resolve) => {
    const s = ioc(`http://127.0.0.1:${port}`, { auth: { token: data.token }, transports: ['websocket'] });
    s.on('connect', () => { s.disconnect(); resolve(true); });
    s.on('connect_error', () => { s.disconnect(); resolve(false); });
  });
  assert.equal(ok, true);
  const bad = await new Promise((resolve) => {
    const s = ioc(`http://127.0.0.1:${port}`, { auth: { token: 'nope' }, transports: ['websocket'] });
    s.on('connect', () => { s.disconnect(); resolve(true); });
    s.on('connect_error', () => { s.disconnect(); resolve(false); });
  });
  assert.equal(bad, false);
  const res = await fetch(base + '/me', { headers: { cookie: `arcade_session=${data.token}` } });
  assert.equal(res.status, 401);
});
