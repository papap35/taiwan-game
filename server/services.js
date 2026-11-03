import crypto from 'node:crypto';
import { tx } from './db.js';
import {
  ACHIEVEMENTS, DAILY_CHECKIN_BASE, DAILY_CHECKIN_STREAK_BONUS, DEFAULT_COLOR,
  GAMES, GIFT_DAILY_LIMIT, SHOP_ITEMS, STARTING_TOKENS,
} from './catalog.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => Date.now();

/** 台灣時間的日期字串 YYYY-MM-DD */
export function taipeiDate(ts = now()) {
  return new Date(ts + 8 * 3600_000).toISOString().slice(0, 10);
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(6)) s += chars[b % chars.length];
  return s;
}

export function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function createServices(db, { emitToUser = () => {}, isOnline = () => false } = {}) {
  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userBySub: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    userByCode: db.prepare('SELECT * FROM users WHERE friend_code = ?'),
    setBalance: {
      tokens: db.prepare('UPDATE users SET tokens = ? WHERE id = ?'),
      tickets: db.prepare('UPDATE users SET tickets = ? WHERE id = ?'),
    },
    insertTx: db.prepare('INSERT INTO transactions (user_id, currency, amount, balance, reason, created_at) VALUES (?,?,?,?,?,?)'),
    insertNotif: db.prepare('INSERT INTO notifications (user_id, type, text, data, created_at) VALUES (?,?,?,?,?)'),
    friendship: db.prepare(`SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`),
    isMember: db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'),
  };

  function getUser(id) {
    const u = q.userById.get(id);
    if (!u) throw new HttpError(404, '找不到使用者');
    return u;
  }

  function publicUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      picture: u.picture,
      friendCode: u.friend_code,
      color: u.color,
      hat: u.hat,
      bio: u.bio,
      showcase: JSON.parse(u.showcase || '[]'),
      online: isOnline(u.id),
      createdAt: u.created_at,
    };
  }

  function notify(userId, type, text, data = null) {
    const r = q.insertNotif.run(userId, type, text, data ? JSON.stringify(data) : null, now());
    emitToUser(userId, 'notify', { id: Number(r.lastInsertRowid), type, text, data, createdAt: now() });
  }

  function emitWallet(userId) {
    const u = q.userById.get(userId);
    if (u) emitToUser(userId, 'wallet', { tokens: u.tokens, tickets: u.tickets });
  }

  /** 增減代幣或彩票（需在交易內呼叫）。餘額不足時丟出 400。 */
  function adjust(userId, currency, amount, reason) {
    const u = getUser(userId);
    const balance = u[currency] + amount;
    if (balance < 0) throw new HttpError(400, currency === 'tokens' ? '代幣不足' : '彩票不足');
    q.setBalance[currency].run(balance, userId);
    q.insertTx.run(userId, currency, amount, balance, reason, now());
    return balance;
  }

  function upsertGoogleUser({ sub, email, name, picture }) {
    const existing = q.userBySub.get(sub);
    if (existing) {
      db.prepare('UPDATE users SET email = ?, picture = ?, last_seen = ? WHERE id = ?').run(email, picture, now(), existing.id);
      return { user: getUser(existing.id), created: false };
    }
    return { user: createUser({ sub, email, name, picture, isGuest: false }), created: true };
  }

  function createUser({ sub = null, email = null, name, picture = null, isGuest }) {
    return tx(db, () => {
      let code;
      do code = randomCode(); while (q.userByCode.get(code));
      const r = db.prepare(`INSERT INTO users (google_sub, email, name, picture, friend_code, color, is_guest, created_at, last_seen)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(sub, email, cleanText(name, 20) || '玩家', picture, code, DEFAULT_COLOR, isGuest ? 1 : 0, now(), now());
      const id = Number(r.lastInsertRowid);
      adjust(id, 'tokens', STARTING_TOKENS, '新玩家見面禮');
      q.insertNotif.run(id, 'welcome', `歡迎來到懷舊遊樂場！送你 ${STARTING_TOKENS} 枚代幣，到處逛逛吧 🎉`, null, now());
      return getUser(id);
    });
  }

  function ownedItems(userId) {
    return db.prepare('SELECT item_id FROM user_items WHERE user_id = ?').all(userId).map((r) => r.item_id);
  }

  function friendIds(userId) {
    return db.prepare(`SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS id
      FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`)
      .all(userId, userId, userId).map((r) => r.id);
  }

  function areFriends(a, b) {
    const f = q.friendship.get(a, b, b, a);
    return f?.status === 'accepted';
  }

  function groupIds(userId) {
    return db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId).map((r) => r.group_id);
  }

  function stats(userId) {
    const u = getUser(userId);
    const plays = db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT game_id) d, COALESCE(SUM(tickets),0) t FROM play_sessions WHERE user_id = ? AND ended_at IS NOT NULL').get(userId);
    const best = {};
    for (const r of db.prepare('SELECT game_id, MAX(score) s FROM play_sessions WHERE user_id = ? AND ended_at IS NOT NULL GROUP BY game_id').all(userId)) best[r.game_id] = r.s;
    const clawWins = db.prepare("SELECT COUNT(*) c FROM play_sessions WHERE user_id = ? AND game_id = 'claw' AND score > 0").get(userId).c;
    const badgeIds = new Set(SHOP_ITEMS.filter((i) => i.type === 'badge').map((i) => i.id));
    const badges = ownedItems(userId).filter((i) => badgeIds.has(i)).length;
    return {
      plays: plays.c,
      distinctGames: plays.d,
      ticketsEarned: plays.t,
      best,
      clawWins,
      friends: friendIds(userId).length,
      groups: groupIds(userId).length,
      streak: u.checkin_streak,
      badges,
    };
  }

  function unlockedAchievements(userId) {
    return db.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?').all(userId);
  }

  /** 檢查並解鎖成就，回傳新解鎖的成就。 */
  function checkAchievements(userId) {
    const have = new Set(unlockedAchievements(userId).map((a) => a.achievement_id));
    const s = stats(userId);
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (have.has(a.id) || !a.check(s)) continue;
      tx(db, () => {
        db.prepare('INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?,?,?)').run(userId, a.id, now());
        if (a.reward) adjust(userId, 'tokens', a.reward, `成就：${a.name}`);
      });
      unlocked.push({ id: a.id, name: a.name, icon: a.icon, reward: a.reward });
      notify(userId, 'achievement', `🏅 解鎖成就「${a.name}」！獲得 ${a.reward} 代幣`, { achievementId: a.id });
    }
    if (unlocked.length) emitWallet(userId);
    return unlocked;
  }

  // ---------- 錢包 ----------
  function checkin(userId) {
    const u = getUser(userId);
    const today = taipeiDate();
    if (u.last_checkin === today) throw new HttpError(400, '今天已經簽到過了');
    const yesterday = taipeiDate(now() - 86400_000);
    const streak = u.last_checkin === yesterday ? u.checkin_streak + 1 : 1;
    const reward = DAILY_CHECKIN_BASE + DAILY_CHECKIN_STREAK_BONUS * (Math.min(streak, 7) - 1);
    tx(db, () => {
      db.prepare('UPDATE users SET last_checkin = ?, checkin_streak = ? WHERE id = ?').run(today, streak, userId);
      adjust(userId, 'tokens', reward, `每日簽到（連續 ${streak} 天）`);
    });
    emitWallet(userId);
    const achievements = checkAchievements(userId);
    return { reward, streak, achievements };
  }

  function gift(fromId, toId, amount) {
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 1) throw new HttpError(400, '數量不正確');
    if (fromId === toId) throw new HttpError(400, '不能送給自己');
    if (!areFriends(fromId, toId)) throw new HttpError(403, '只能贈送給好友');
    const since = new Date(taipeiDate() + 'T00:00:00+08:00').getTime();
    const sent = -db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id = ? AND currency = 'tokens' AND reason LIKE '贈送給%' AND created_at >= ?").get(fromId, since).s;
    if (sent + amount > GIFT_DAILY_LIMIT) throw new HttpError(400, `每天最多贈送 ${GIFT_DAILY_LIMIT} 代幣（今天已送 ${sent}）`);
    const from = getUser(fromId);
    const to = getUser(toId);
    tx(db, () => {
      adjust(fromId, 'tokens', -amount, `贈送給 ${to.name}`);
      adjust(toId, 'tokens', amount, `${from.name} 的禮物`);
    });
    emitWallet(fromId);
    emitWallet(toId);
    notify(toId, 'gift', `🎁 ${from.name} 送你 ${amount} 枚代幣！`, { fromId });
    return { ok: true };
  }

  // ---------- 遊戲 ----------
  function startGame(userId, gameId) {
    const game = GAMES[gameId];
    if (!game) throw new HttpError(404, '沒有這款遊戲');
    const id = crypto.randomUUID();
    tx(db, () => {
      // 未結束的舊局一律作廢（避免同時開多局刷彩票）
      db.prepare('UPDATE play_sessions SET ended_at = ?, score = 0, tickets = 0 WHERE user_id = ? AND ended_at IS NULL').run(now(), userId);
      adjust(userId, 'tokens', -game.cost, `遊玩 ${game.name}`);
      db.prepare('INSERT INTO play_sessions (id, user_id, game_id, cost, started_at) VALUES (?,?,?,?,?)').run(id, userId, gameId, game.cost, now());
    });
    emitWallet(userId);
    return { sessionId: id, game: { id: game.id, cost: game.cost } };
  }

  function finishGame(userId, sessionId, rawScore) {
    const s = db.prepare('SELECT * FROM play_sessions WHERE id = ? AND user_id = ?').get(String(sessionId), userId);
    if (!s) throw new HttpError(404, '找不到這局遊戲');
    if (s.ended_at) throw new HttpError(400, '這局已經結束了');
    const game = GAMES[s.game_id];
    let score = Math.max(0, Math.floor(Number(rawScore) || 0));
    const elapsed = (now() - s.started_at) / 1000;
    let tickets = Math.min(game.maxTickets, Math.max(0, game.ticketsFor(score)));
    let flagged = false;
    if (elapsed < game.minSeconds && score > 0) {
      // 時間過短卻有分數 → 不給彩票
      tickets = 0;
      score = 0;
      flagged = true;
    }
    tx(db, () => {
      db.prepare('UPDATE play_sessions SET ended_at = ?, score = ?, tickets = ? WHERE id = ?').run(now(), score, tickets, s.id);
      if (tickets > 0) adjust(userId, 'tickets', tickets, `${game.name} 得分 ${score}`);
    });
    emitWallet(userId);
    const best = db.prepare('SELECT MAX(score) s FROM play_sessions WHERE user_id = ? AND game_id = ? AND id != ?').get(userId, s.game_id, s.id).s ?? 0;
    const achievements = checkAchievements(userId);
    return { score, tickets, newBest: score > best, flagged, achievements };
  }

  function history(userId, limit = 30) {
    return db.prepare('SELECT id, game_id gameId, cost, started_at startedAt, ended_at endedAt, score, tickets FROM play_sessions WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?').all(userId, limit);
  }

  // ---------- 兌換 ----------
  function redeem(userId, itemId) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, '沒有這個商品');
    const owned = ownedItems(userId).includes(item.id);
    if (owned && !item.repeatable) throw new HttpError(400, '你已經擁有這個商品了');
    tx(db, () => {
      adjust(userId, 'tickets', -item.price, `兌換 ${item.name}`);
      if (item.type === 'tokens') adjust(userId, 'tokens', item.grant, `兌換 ${item.name}`);
      else db.prepare('INSERT INTO user_items (user_id, item_id, acquired_at) VALUES (?,?,?)').run(userId, item.id, now());
      // 兌換帽子或顏色時自動換上
      if (item.type === 'hat') db.prepare('UPDATE users SET hat = ? WHERE id = ?').run(item.value, userId);
      if (item.type === 'color') db.prepare('UPDATE users SET color = ? WHERE id = ?').run(item.value, userId);
      if (item.type === 'badge') {
        const u = getUser(userId);
        const showcase = JSON.parse(u.showcase || '[]');
        if (showcase.length < 3) db.prepare('UPDATE users SET showcase = ? WHERE id = ?').run(JSON.stringify([...showcase, item.id]), userId);
      }
    });
    emitWallet(userId);
    const achievements = checkAchievements(userId);
    return { ok: true, item, achievements };
  }

  function updateProfile(userId, patch) {
    const u = getUser(userId);
    const owned = new Set(ownedItems(userId));
    const sets = {};
    if (patch.name !== undefined) {
      const name = cleanText(patch.name, 20);
      if (!name) throw new HttpError(400, '名稱不能空白');
      sets.name = name;
    }
    if (patch.bio !== undefined) sets.bio = cleanText(patch.bio, 120);
    if (patch.color !== undefined) {
      const item = SHOP_ITEMS.find((i) => i.type === 'color' && i.value === patch.color);
      if (patch.color !== DEFAULT_COLOR && !(item && owned.has(item.id))) throw new HttpError(400, '尚未擁有這個顏色');
      sets.color = patch.color;
    }
    if (patch.hat !== undefined) {
      if (patch.hat === null || patch.hat === '') sets.hat = null;
      else {
        const item = SHOP_ITEMS.find((i) => i.type === 'hat' && i.value === patch.hat);
        if (!(item && owned.has(item.id))) throw new HttpError(400, '尚未擁有這頂帽子');
        sets.hat = patch.hat;
      }
    }
    if (patch.showcase !== undefined) {
      if (!Array.isArray(patch.showcase) || patch.showcase.length > 3) throw new HttpError(400, '最多展示 3 枚徽章');
      const achievementBadges = new Set(unlockedAchievements(userId).map((a) => 'ach:' + a.achievement_id));
      for (const id of patch.showcase) {
        if (!owned.has(id) && !achievementBadges.has(id)) throw new HttpError(400, '尚未擁有這枚徽章');
      }
      sets.showcase = JSON.stringify([...new Set(patch.showcase)]);
    }
    const keys = Object.keys(sets);
    if (keys.length) {
      db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => sets[k]), u.id);
    }
    return getUser(userId);
  }

  // ---------- 好友 ----------
  function listFriends(userId) {
    const rows = db.prepare('SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ?').all(userId, userId);
    const friends = [], incoming = [], outgoing = [];
    for (const r of rows) {
      const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
      const other = publicUser(q.userById.get(otherId));
      if (!other) continue;
      if (r.status === 'accepted') friends.push(other);
      else if (r.addressee_id === userId) incoming.push(other);
      else outgoing.push(other);
    }
    friends.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return { friends, incoming, outgoing };
  }

  function requestFriend(userId, { userId: targetId, code }) {
    const target = targetId ? q.userById.get(Number(targetId)) : q.userByCode.get(String(code || '').toUpperCase().trim());
    if (!target) throw new HttpError(404, '找不到這位玩家，請確認好友代碼');
    if (target.id === userId) throw new HttpError(400, '不能加自己為好友');
    const existing = q.friendship.get(userId, target.id, target.id, userId);
    const me = getUser(userId);
    if (existing?.status === 'accepted') throw new HttpError(400, '你們已經是好友了');
    if (existing && existing.requester_id === userId) throw new HttpError(400, '已送出邀請，等待對方回覆');
    if (existing) {
      // 對方先邀請過我 → 直接成為好友
      return acceptFriend(userId, target.id);
    }
    db.prepare("INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?,?,'pending',?)").run(userId, target.id, now());
    notify(target.id, 'friend-request', `👋 ${me.name} 想加你為好友`, { fromId: userId });
    emitToUser(target.id, 'friends:changed', {});
    return { status: 'pending', user: publicUser(target) };
  }

  function acceptFriend(userId, requesterId) {
    const r = db.prepare("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'").run(requesterId, userId);
    if (!r.changes) throw new HttpError(404, '找不到好友邀請');
    const me = getUser(userId);
    notify(requesterId, 'friend-accepted', `🤝 ${me.name} 接受了你的好友邀請`, { userId });
    emitToUser(requesterId, 'friends:changed', {});
    emitToUser(userId, 'friends:changed', {});
    checkAchievements(userId);
    checkAchievements(requesterId);
    return { status: 'accepted', user: publicUser(getUser(requesterId)) };
  }

  function removeFriend(userId, otherId) {
    const r = db.prepare('DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)').run(userId, otherId, otherId, userId);
    if (!r.changes) throw new HttpError(404, '沒有這段好友關係');
    emitToUser(otherId, 'friends:changed', {});
    return { ok: true };
  }

  function searchUsers(userId, query) {
    const s = cleanText(query, 30);
    if (!s) return [];
    return db.prepare('SELECT * FROM users WHERE id != ? AND (friend_code = ? OR name LIKE ?) ORDER BY last_seen DESC LIMIT 20')
      .all(userId, s.toUpperCase(), `%${s.replace(/[%_]/g, '')}%`).map(publicUser);
  }

  // ---------- 群組 ----------
  function assertMember(groupId, userId) {
    if (!q.isMember.get(groupId, userId)) throw new HttpError(403, '你不是這個群組的成員');
  }

  function groupInfo(groupId, userId) {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!g) throw new HttpError(404, '找不到群組');
    const members = db.prepare('SELECT u.* FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at').all(groupId).map(publicUser);
    const last = db.prepare('SELECT m.*, u.name sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE group_id = ? ORDER BY m.id DESC LIMIT 1').get(groupId);
    let unread = 0;
    if (userId) {
      const lr = db.prepare('SELECT last_read_id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
      if (lr) unread = db.prepare('SELECT COUNT(*) c FROM messages WHERE group_id = ? AND id > ? AND sender_id != ?').get(groupId, lr.last_read_id, userId).c;
    }
    return {
      id: g.id, name: g.name, icon: g.icon, ownerId: g.owner_id, createdAt: g.created_at, members,
      lastMessage: last ? { body: last.body, senderName: last.sender_name, createdAt: last.created_at } : null,
      unread,
    };
  }

  function listGroups(userId) {
    return groupIds(userId).map((id) => groupInfo(id, userId))
      .sort((a, b) => (b.lastMessage?.createdAt || b.createdAt) - (a.lastMessage?.createdAt || a.createdAt));
  }

  function createGroup(userId, { name, icon, memberIds = [] }) {
    name = cleanText(name, 30);
    if (!name) throw new HttpError(400, '請輸入群組名稱');
    icon = cleanText(icon, 4) || '🎮';
    const ids = [...new Set(memberIds.map(Number))].filter((id) => id !== userId);
    for (const id of ids) if (!areFriends(userId, id)) throw new HttpError(403, '只能邀請好友加入群組');
    if (ids.length > 49) throw new HttpError(400, '群組最多 50 人');
    const gid = tx(db, () => {
      const r = db.prepare('INSERT INTO groups (name, icon, owner_id, created_at) VALUES (?,?,?,?)').run(name, icon, userId, now());
      const gid = Number(r.lastInsertRowid);
      const add = db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?,?,?)');
      add.run(gid, userId, now());
      for (const id of ids) add.run(gid, id, now());
      return gid;
    });
    const me = getUser(userId);
    for (const id of ids) {
      notify(id, 'group-invite', `👥 ${me.name} 把你加入群組「${name}」`, { groupId: gid });
      emitToUser(id, 'groups:changed', { groupId: gid, joined: true });
      checkAchievements(id);
    }
    emitToUser(userId, 'groups:changed', { groupId: gid, joined: true });
    checkAchievements(userId);
    return groupInfo(gid, userId);
  }

  function addGroupMember(userId, groupId, targetId) {
    assertMember(groupId, userId);
    if (!areFriends(userId, targetId)) throw new HttpError(403, '只能邀請好友加入群組');
    if (q.isMember.get(groupId, targetId)) throw new HttpError(400, '對方已經在群組裡了');
    const count = db.prepare('SELECT COUNT(*) c FROM group_members WHERE group_id = ?').get(groupId).c;
    if (count >= 50) throw new HttpError(400, '群組最多 50 人');
    db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?,?,?)').run(groupId, targetId, now());
    const g = groupInfo(groupId);
    const me = getUser(userId);
    notify(targetId, 'group-invite', `👥 ${me.name} 把你加入群組「${g.name}」`, { groupId });
    for (const m of g.members) emitToUser(m.id, 'groups:changed', { groupId, joined: m.id === targetId });
    checkAchievements(targetId);
    return g;
  }

  function removeGroupMember(userId, groupId, targetId) {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!g) throw new HttpError(404, '找不到群組');
    if (targetId !== userId && g.owner_id !== userId) throw new HttpError(403, '只有群主可以移除成員');
    assertMember(groupId, targetId);
    const before = groupInfo(groupId).members;
    tx(db, () => {
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, targetId);
      const left = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at LIMIT 1').get(groupId);
      if (!left) db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
      else if (g.owner_id === targetId) db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').run(left.user_id, groupId);
    });
    for (const m of before) emitToUser(m.id, 'groups:changed', { groupId, left: m.id === targetId });
    return { ok: true };
  }

  // ---------- 訊息 ----------
  function formatMessage(m) {
    return {
      id: m.id, senderId: m.sender_id, recipientId: m.recipient_id, groupId: m.group_id,
      body: m.body, createdAt: m.created_at, readAt: m.read_at,
    };
  }

  function sendMessage(userId, { to, groupId, body }) {
    body = cleanText(body, 500);
    if (!body) throw new HttpError(400, '訊息不能空白');
    let r;
    if (groupId) {
      groupId = Number(groupId);
      assertMember(groupId, userId);
      r = db.prepare('INSERT INTO messages (sender_id, group_id, body, created_at) VALUES (?,?,?,?)').run(userId, groupId, body, now());
    } else {
      to = Number(to);
      getUser(to);
      if (!areFriends(userId, to)) throw new HttpError(403, '只能傳訊息給好友');
      r = db.prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)').run(userId, to, body, now());
    }
    const msg = formatMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(r.lastInsertRowid)));
    const sender = publicUser(getUser(userId));
    const payload = { ...msg, sender: { id: sender.id, name: sender.name, color: sender.color, picture: sender.picture } };
    if (groupId) {
      db.prepare('UPDATE group_members SET last_read_id = ? WHERE group_id = ? AND user_id = ?').run(msg.id, groupId, userId);
      for (const m of db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId)) emitToUser(m.user_id, 'message', payload);
    } else {
      emitToUser(to, 'message', payload);
      emitToUser(userId, 'message', payload);
    }
    return payload;
  }

  function dmHistory(userId, otherId, before = Infinity, limit = 50) {
    const rows = db.prepare(`SELECT * FROM messages WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)) AND id < ?
      ORDER BY id DESC LIMIT ?`).all(userId, otherId, otherId, userId, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER, limit);
    return rows.reverse().map(formatMessage);
  }

  function groupHistory(userId, groupId, before = Infinity, limit = 50) {
    assertMember(groupId, userId);
    const rows = db.prepare(`SELECT m.*, u.name sender_name, u.color sender_color, u.picture sender_picture FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE group_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(groupId, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER, limit);
    return rows.reverse().map((m) => ({ ...formatMessage(m), sender: { id: m.sender_id, name: m.sender_name, color: m.sender_color, picture: m.sender_picture } }));
  }

  function markRead(userId, { userId: otherId, groupId }) {
    if (groupId) {
      assertMember(Number(groupId), userId);
      const last = db.prepare('SELECT MAX(id) m FROM messages WHERE group_id = ?').get(Number(groupId)).m || 0;
      db.prepare('UPDATE group_members SET last_read_id = ? WHERE group_id = ? AND user_id = ?').run(last, Number(groupId), userId);
    } else if (otherId) {
      db.prepare('UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL').run(now(), userId, Number(otherId));
      emitToUser(Number(otherId), 'message:read', { by: userId });
    }
    return { ok: true };
  }

  function conversations(userId) {
    const rows = db.prepare(`SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END other, MAX(id) last_id
      FROM messages WHERE group_id IS NULL AND (sender_id = ? OR recipient_id = ?) GROUP BY other`).all(userId, userId, userId);
    const dms = rows.map((r) => {
      const last = db.prepare('SELECT * FROM messages WHERE id = ?').get(r.last_id);
      const unread = db.prepare('SELECT COUNT(*) c FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').get(r.other, userId).c;
      return { type: 'dm', user: publicUser(q.userById.get(r.other)), lastMessage: formatMessage(last), unread };
    }).filter((c) => c.user);
    const groups = listGroups(userId).map((g) => ({ type: 'group', group: g, lastMessage: g.lastMessage, unread: g.unread }));
    return [...dms, ...groups].sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
  }

  function unreadCounts(userId) {
    const dm = db.prepare('SELECT COUNT(*) c FROM messages WHERE recipient_id = ? AND read_at IS NULL').get(userId).c;
    const group = db.prepare(`SELECT COUNT(*) c FROM messages m JOIN group_members gm ON gm.group_id = m.group_id
      WHERE gm.user_id = ? AND m.id > gm.last_read_id AND m.sender_id != ?`).get(userId, userId).c;
    const notifications = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(userId).c;
    const friendRequests = db.prepare("SELECT COUNT(*) c FROM friendships WHERE addressee_id = ? AND status = 'pending'").get(userId).c;
    return { messages: dm + group, notifications, friendRequests };
  }

  // ---------- 排行榜 ----------
  function leaderboard(userId, { game, scope = 'all', limit = 20 }) {
    const ids = scope === 'friends' ? [userId, ...friendIds(userId)] : null;
    const filter = ids ? `AND u.id IN (${ids.map(() => '?').join(',')})` : '';
    let rows;
    if (game && GAMES[game]) {
      rows = db.prepare(`SELECT u.*, MAX(p.score) value FROM play_sessions p JOIN users u ON u.id = p.user_id
        WHERE p.game_id = ? AND p.ended_at IS NOT NULL ${filter} GROUP BY u.id ORDER BY value DESC LIMIT ?`).all(game, ...(ids || []), limit);
    } else {
      rows = db.prepare(`SELECT u.*, COALESCE(SUM(p.tickets),0) value FROM play_sessions p JOIN users u ON u.id = p.user_id
        WHERE p.ended_at IS NOT NULL ${filter} GROUP BY u.id ORDER BY value DESC LIMIT ?`).all(...(ids || []), limit);
    }
    return rows.map((r, i) => ({ rank: i + 1, user: publicUser(r), value: r.value }));
  }

  function notifications(userId) {
    return db.prepare('SELECT id, type, text, data, read, created_at createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
      .all(userId).map((n) => ({ ...n, read: !!n.read, data: n.data ? JSON.parse(n.data) : null }));
  }

  function markNotificationsRead(userId) {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
    return { ok: true };
  }

  function me(userId) {
    const u = getUser(userId);
    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), userId);
    return {
      ...publicUser(u),
      email: u.email,
      isGuest: !!u.is_guest,
      tokens: u.tokens,
      tickets: u.tickets,
      checkedInToday: u.last_checkin === taipeiDate(),
      checkinStreak: u.checkin_streak,
      items: ownedItems(userId),
      achievements: unlockedAchievements(userId).map((a) => ({ id: a.achievement_id, unlockedAt: a.unlocked_at })),
      unread: unreadCounts(userId),
    };
  }

  function profile(viewerId, userId) {
    const u = getUser(userId);
    const s = stats(userId);
    const f = q.friendship.get(viewerId, userId, userId, viewerId);
    let relation = 'none';
    if (viewerId === userId) relation = 'self';
    else if (f?.status === 'accepted') relation = 'friend';
    else if (f) relation = f.requester_id === viewerId ? 'outgoing' : 'incoming';
    return {
      ...publicUser(u),
      relation,
      stats: { plays: s.plays, ticketsEarned: s.ticketsEarned, best: s.best, friends: s.friends },
      items: ownedItems(userId).filter((i) => SHOP_ITEMS.find((x) => x.id === i)?.type === 'badge'),
      achievements: unlockedAchievements(userId).map((a) => a.achievement_id),
    };
  }

  return {
    getUser, publicUser, notify, adjust, upsertGoogleUser, createUser, me, profile, updateProfile,
    checkin, gift, startGame, finishGame, history, redeem, stats, checkAchievements,
    listFriends, requestFriend, acceptFriend, removeFriend, searchUsers, friendIds, areFriends,
    groupIds, listGroups, groupInfo, createGroup, addGroupMember, removeGroupMember,
    sendMessage, dmHistory, groupHistory, markRead, conversations, unreadCounts,
    leaderboard, notifications, markNotificationsRead,
    transactions: (userId) => db.prepare('SELECT id, currency, amount, balance, reason, created_at createdAt FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId),
  };
}
