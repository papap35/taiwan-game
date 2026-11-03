import { api, getSocket } from '../api.js';
import { store } from '../store.js';
import { el, esc, $, $$, toast, busy, avatar, openModal, confirmDialog, timeAgo, clockTime } from './dom.js';

// ============ 好友 ============
export function openFriends(tab = 'list') {
  openModal({
    title: '👫 好友',
    className: 'modal-md',
    render(body) {
      body.innerHTML = `
        <div class="tabs">
          <button data-tab="list">好友列表</button>
          <button data-tab="requests">邀請 <i class="badge" data-req></i></button>
          <button data-tab="add">加好友</button>
        </div>
        <div class="tab-body"></div>`;
      const tb = $('.tab-body', body);
      let current = tab;
      let data = { friends: [], incoming: [], outgoing: [] };

      const setTab = (t) => {
        current = t;
        $$('.tabs button', body).forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
        draw();
      };
      $$('.tabs button', body).forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

      const load = async () => {
        data = await api.get('/friends');
        const req = $('[data-req]', body);
        req.textContent = data.incoming.length;
        req.classList.toggle('on', data.incoming.length > 0);
        draw();
      };

      const userRow = (u, actions) => `
        <li class="user-row" data-id="${u.id}">
          <button class="user-main" data-act="profile">${avatar(u, 40)}
            <span><b>${esc(u.name)}</b><small>${u.online ? '<span class="on">● 線上</span>' : '離線'} · #${esc(u.friendCode)}</small></span>
          </button>
          <span class="row gap-s">${actions}</span>
        </li>`;

      function draw() {
        if (current === 'list') {
          tb.innerHTML = data.friends.length
            ? `<ul class="user-list">${data.friends.map((u) => userRow(u, `
                <button class="icon-btn" data-act="chat" title="傳訊息">💬</button>
                <button class="icon-btn" data-act="gift" title="送代幣">🎁</button>
                <button class="icon-btn danger" data-act="remove" title="移除好友">✕</button>`)).join('')}</ul>`
            : '<div class="empty">還沒有好友，到「加好友」輸入好友代碼吧！<br>也可以在遊戲場點其他玩家加好友。</div>';
        } else if (current === 'requests') {
          tb.innerHTML = `
            <h4 class="sub-h">收到的邀請</h4>
            ${data.incoming.length ? `<ul class="user-list">${data.incoming.map((u) => userRow(u, `
              <button class="btn small primary" data-act="accept">接受</button>
              <button class="btn small ghost" data-act="decline">拒絕</button>`)).join('')}</ul>` : '<div class="empty small">沒有新的邀請</div>'}
            <h4 class="sub-h">已送出的邀請</h4>
            ${data.outgoing.length ? `<ul class="user-list">${data.outgoing.map((u) => userRow(u, '<button class="btn small ghost" data-act="cancel">取消</button>')).join('')}</ul>` : '<div class="empty small">沒有待回覆的邀請</div>'}`;
        } else {
          tb.innerHTML = `
            <div class="my-code">
              <span>我的好友代碼</span>
              <b>${esc(store.me.friendCode)}</b>
              <button class="btn small ghost" data-copy>複製</button>
            </div>
            <form class="search-form row gap">
              <input name="q" placeholder="輸入好友代碼或暱稱搜尋" maxlength="30" required>
              <button class="btn primary">搜尋</button>
            </form>
            <ul class="user-list search-results"></ul>`;
          $('[data-copy]', tb).onclick = () => {
            navigator.clipboard?.writeText(store.me.friendCode);
            toast('已複製好友代碼', 'success');
          };
          const form = $('.search-form', tb);
          form.onsubmit = (e) => {
            e.preventDefault();
            busy($('button', form), async () => {
              const q = form.q.value.trim();
              const results = await api.get('/users/search?q=' + encodeURIComponent(q));
              const ids = new Set(data.friends.map((f) => f.id));
              const out = new Set(data.outgoing.map((f) => f.id));
              $('.search-results', tb).innerHTML = results.length
                ? results.map((u) => userRow(u, ids.has(u.id) ? '<span class="muted small">已是好友</span>'
                  : out.has(u.id) ? '<span class="muted small">已邀請</span>'
                    : '<button class="btn small primary" data-act="add">加好友</button>')).join('')
                : '<div class="empty small">找不到玩家</div>';
            });
          };
        }
      }

      tb.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = Number(btn.closest('[data-id]').dataset.id);
        const user = [...data.friends, ...data.incoming, ...data.outgoing].find((u) => u.id === id);
        const act = btn.dataset.act;
        if (act === 'profile') return store.openPanel('profile', id);
        if (act === 'chat') return openMessages({ type: 'dm', user });
        if (act === 'gift') return openGift(user);
        busy(btn, async () => {
          if (act === 'accept') {
            await api.post('/friends/accept', { userId: id });
            toast('已成為好友！', 'success');
          } else if (act === 'add') {
            const r = await api.post('/friends/request', { userId: id });
            toast(r.status === 'accepted' ? '已成為好友！' : '已送出好友邀請', 'success');
          } else if (act === 'remove') {
            if (!(await confirmDialog(`確定要移除好友 ${user.name}？`))) return;
            await api.del('/friends/' + id);
          } else if (act === 'decline' || act === 'cancel') {
            await api.del('/friends/' + id);
          }
          await load();
          store.refreshMe();
        });
      });

      const off = [store.on('friends:changed', load), store.on('presence', load)];
      setTab(tab);
      load();
      return () => off.forEach((f) => f());
    },
  });
}

export function openGift(user) {
  const limit = store.catalog.economy.giftDailyLimit;
  const m = openModal({
    title: `🎁 送代幣給 ${esc(user.name)}`,
    className: 'modal-sm',
    stack: true,
    render(body) {
      body.innerHTML = `
        <p class="muted small">你目前有 🪙 ${store.me.tokens} 代幣，每天最多可送 ${limit} 枚。</p>
        <div class="chips">${[10, 20, 50, 100].map((n) => `<button class="chip" data-n="${n}">${n}</button>`).join('')}</div>
        <form class="row gap">
          <input type="number" name="amount" min="1" max="${limit}" value="20" required>
          <button class="btn primary">送出</button>
        </form>`;
      const form = $('form', body);
      $$('[data-n]', body).forEach((c) => (c.onclick = () => (form.amount.value = c.dataset.n)));
      form.onsubmit = (e) => {
        e.preventDefault();
        busy($('button', form), async () => {
          await api.post('/wallet/gift', { toUserId: user.id, amount: Number(form.amount.value) });
          toast(`已送出 ${form.amount.value} 代幣給 ${user.name}`, 'success');
          m.close();
        });
      };
    },
  });
}

// ============ 訊息 ============
const convKey = (c) => (c.type === 'dm' ? `dm:${c.user.id}` : `group:${c.group.id}`);

export function openMessages(target = null) {
  openModal({
    title: '💬 訊息',
    className: 'modal-lg chat-modal',
    render(body) {
      body.innerHTML = `
        <div class="chat-layout ${target ? 'show-chat' : ''}">
          <aside class="conv-list"><div class="empty small">載入中…</div></aside>
          <section class="chat-pane"><div class="empty">選一個聊天室開始聊天 💬</div></section>
        </div>`;
      const layout = $('.chat-layout', body);
      const list = $('.conv-list', body);
      const pane = $('.chat-pane', body);
      let convs = [];
      let active = null;
      let typingTimer = null;

      const loadConvs = async () => {
        convs = await api.get('/messages/conversations');
        // 好友中還沒聊過的也列出來
        const { friends } = await api.get('/friends');
        for (const f of friends) if (!convs.some((c) => c.type === 'dm' && c.user.id === f.id)) convs.push({ type: 'dm', user: f, lastMessage: null, unread: 0 });
        drawList();
      };

      function drawList() {
        list.innerHTML = convs.length ? convs.map((c) => {
          const name = c.type === 'dm' ? c.user.name : c.group.name;
          const pic = c.type === 'dm' ? avatar(c.user, 40) : `<span class="avatar group-ava" style="width:40px;height:40px">${esc(c.group.icon)}</span>`;
          const last = c.lastMessage ? `${c.type === 'group' && c.lastMessage.senderName ? esc(c.lastMessage.senderName) + '：' : ''}${esc(c.lastMessage.body)}` : '<i>打聲招呼吧</i>';
          return `<button class="conv ${active && convKey(active) === convKey(c) ? 'active' : ''}" data-key="${convKey(c)}">
            ${pic}<span class="conv-text"><b>${esc(name)}</b><small>${last}</small></span>
            ${c.unread ? `<i class="badge on">${c.unread}</i>` : ''}</button>`;
        }).join('') : '<div class="empty small">加好友或建立群組就能聊天囉！</div>';
      }

      list.addEventListener('click', (e) => {
        const b = e.target.closest('.conv');
        if (b) openConv(convs.find((c) => convKey(c) === b.dataset.key));
      });

      const bubble = (m, prev) => {
        const mine = m.senderId === store.me.id;
        const showName = active.type === 'group' && !mine && prev?.senderId !== m.senderId;
        const sender = m.sender || (mine ? store.me : active.user);
        return `<div class="msg ${mine ? 'mine' : ''}" data-mid="${m.id}">
          ${!mine && (prev?.senderId !== m.senderId) ? avatar(sender, 30) : '<span class="ava-space"></span>'}
          <div class="msg-col">${showName ? `<span class="msg-name">${esc(sender.name)}</span>` : ''}
            <div class="msg-bubble">${esc(m.body)}</div></div>
          <time>${clockTime(m.createdAt)}${mine && active.type === 'dm' && m.readAt ? '<br>已讀' : ''}</time>
        </div>`;
      };

      async function openConv(c) {
        if (!c) return;
        active = c;
        layout.classList.add('show-chat');
        const title = c.type === 'dm' ? esc(c.user.name) : `${esc(c.group.icon)} ${esc(c.group.name)} <small>(${c.group.members.length})</small>`;
        pane.innerHTML = `
          <header class="chat-head">
            <button class="icon-btn back" title="返回">←</button>
            <b>${title}</b>
            <span class="typing"></span>
            ${c.type === 'dm' ? '<button class="icon-btn" data-gift title="送代幣">🎁</button>' : '<button class="icon-btn" data-ginfo title="群組資訊">ℹ️</button>'}
          </header>
          <div class="chat-msgs"><div class="empty small">載入中…</div></div>
          <form class="chat-input">
            <input name="body" maxlength="500" placeholder="輸入訊息…" autocomplete="off">
            <button class="btn primary">送出</button>
          </form>`;
        $('.back', pane).onclick = () => layout.classList.remove('show-chat');
        $('[data-gift]', pane)?.addEventListener('click', () => openGift(c.user));
        $('[data-ginfo]', pane)?.addEventListener('click', () => openGroupDetail(c.group.id));
        const msgsBox = $('.chat-msgs', pane);
        const history = c.type === 'dm' ? await api.get(`/messages/dm/${c.user.id}`) : await api.get(`/messages/group/${c.group.id}`);
        if (active !== c) return;
        c.messages = history;
        msgsBox.innerHTML = history.length ? history.map((m, i) => bubble(m, history[i - 1])).join('') : '<div class="empty small">還沒有訊息，說聲嗨吧 👋</div>';
        msgsBox.scrollTop = msgsBox.scrollHeight;
        markRead(c);
        drawList();

        const form = $('.chat-input', pane);
        const input = form.body;
        input.focus();
        let lastTyping = 0;
        input.oninput = () => {
          if (Date.now() - lastTyping > 2000) {
            lastTyping = Date.now();
            getSocket()?.emit('typing', c.type === 'dm' ? { to: c.user.id } : { groupId: c.group.id });
          }
        };
        form.onsubmit = (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          input.value = '';
          api.post('/messages', c.type === 'dm' ? { to: c.user.id, body: text } : { groupId: c.group.id, body: text })
            .catch((err) => toast(err.message, 'error'));
        };
      }

      function markRead(c) {
        if (!c.unread && c.type === 'group') return;
        api.post('/messages/read', c.type === 'dm' ? { userId: c.user.id } : { groupId: c.group.id }).then(() => store.refreshMe());
        c.unread = 0;
      }

      const matches = (m) => active && (active.type === 'group'
        ? m.groupId === active.group.id
        : !m.groupId && (m.senderId === active.user.id || m.recipientId === active.user.id));
      store.activeChatMatches = matches;

      const onMessage = (m) => {
        if (matches(m) && active.messages) {
          const box = $('.chat-msgs', pane);
          if (!active.messages.length) box.innerHTML = '';
          box.insertAdjacentHTML('beforeend', bubble(m, active.messages[active.messages.length - 1]));
          active.messages.push(m);
          box.scrollTop = box.scrollHeight;
          $('.typing', pane).textContent = '';
          if (m.senderId !== store.me.id) {
            api.post('/messages/read', active.type === 'dm' ? { userId: active.user.id } : { groupId: active.group.id });
          }
        }
        // 更新列表
        const key = m.groupId ? `group:${m.groupId}` : `dm:${m.senderId === store.me.id ? m.recipientId : m.senderId}`;
        const c = convs.find((x) => convKey(x) === key);
        if (c) {
          c.lastMessage = { ...m, senderName: m.sender?.name };
          if (!matches(m) && m.senderId !== store.me.id) c.unread = (c.unread || 0) + 1;
          convs = [c, ...convs.filter((x) => x !== c)];
          drawList();
        } else loadConvs();
      };
      const onTyping = (t) => {
        if (!active) return;
        const ok = active.type === 'dm' ? !t.groupId && t.from === active.user.id : t.groupId === active.group.id;
        if (!ok) return;
        const who = active.type === 'dm' ? active.user.name : active.group.members.find((x) => x.id === t.from)?.name || '有人';
        const box = $('.typing', pane);
        if (box) box.textContent = `${who} 正在輸入…`;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => box && (box.textContent = ''), 3000);
      };
      const onRead = (r) => {
        if (active?.type === 'dm' && r.by === active.user.id && active.messages) {
          active.messages.forEach((m) => m.senderId === store.me.id && !m.readAt && (m.readAt = Date.now()));
          const box = $('.chat-msgs', pane);
          box.innerHTML = active.messages.map((m, i) => bubble(m, active.messages[i - 1])).join('');
          box.scrollTop = box.scrollHeight;
        }
      };
      const offs = [store.on('message', onMessage), store.on('typing', onTyping), store.on('message:read', onRead), store.on('groups:changed', loadConvs)];

      loadConvs().then(() => {
        if (target) {
          let c = convs.find((x) => convKey(x) === convKey(target));
          if (!c) {
            c = { ...target, lastMessage: null, unread: 0 };
            convs.unshift(c);
          }
          openConv(c);
        }
      });

      return () => {
        offs.forEach((f) => f());
        store.activeChatMatches = null;
        clearTimeout(typingTimer);
      };
    },
  });
}

// ============ 群組 ============
const GROUP_ICONS = ['🎮', '🕹️', '🎰', '🧸', '🏀', '🍢', '🧋', '🐉', '🌙', '🔥', '⭐', '🎉'];

export function openGroups() {
  openModal({
    title: '👥 群組',
    className: 'modal-md',
    render(body) {
      body.innerHTML = `
        <div class="row between"><p class="muted small">和好友組隊聊天、一起逛遊樂場！</p><button class="btn primary small" data-create>＋ 建立群組</button></div>
        <ul class="group-list"><div class="empty small">載入中…</div></ul>`;
      const listEl = $('.group-list', body);
      const load = async () => {
        const groups = await api.get('/groups');
        listEl.innerHTML = groups.length ? groups.map((g) => `
          <li class="group-row" data-id="${g.id}">
            <span class="avatar group-ava" style="width:44px;height:44px">${esc(g.icon)}</span>
            <span class="grow"><b>${esc(g.name)}</b><small>${g.members.length} 位成員 · ${g.members.filter((m) => m.online).length} 人線上${g.lastMessage ? ' · ' + timeAgo(g.lastMessage.createdAt) : ''}</small></span>
            ${g.unread ? `<i class="badge on">${g.unread}</i>` : ''}
            <button class="icon-btn" data-chat title="聊天">💬</button>
            <button class="icon-btn" data-info title="詳細">ℹ️</button>
          </li>`).join('') : '<div class="empty">還沒有加入任何群組</div>';
        listEl.querySelectorAll('.group-row').forEach((row) => {
          const g = groups.find((x) => x.id === Number(row.dataset.id));
          $('[data-chat]', row).onclick = () => openMessages({ type: 'group', group: g });
          $('[data-info]', row).onclick = () => openGroupDetail(g.id);
        });
      };
      $('[data-create]', body).onclick = () => openCreateGroup();
      const off = store.on('groups:changed', load);
      load();
      return off;
    },
  });
}

async function pickFriends(container, excludeIds = []) {
  const { friends } = await api.get('/friends');
  const avail = friends.filter((f) => !excludeIds.includes(f.id));
  container.innerHTML = avail.length
    ? avail.map((f) => `<label class="pick-row"><input type="checkbox" value="${f.id}">${avatar(f, 30)}<span>${esc(f.name)}</span></label>`).join('')
    : '<div class="empty small">沒有可以邀請的好友</div>';
  return () => $$('input:checked', container).map((i) => Number(i.value));
}

function openCreateGroup() {
  const m = openModal({
    title: '＋ 建立群組',
    className: 'modal-sm',
    stack: true,
    render(body) {
      body.innerHTML = `
        <form class="stack">
          <label class="field"><span>群組名稱</span><input name="name" maxlength="30" required placeholder="例如：夜市遊樂團"></label>
          <div class="field"><span>圖示</span><div class="chips icons">${GROUP_ICONS.map((i, n) => `<button type="button" class="chip ${n === 0 ? 'active' : ''}" data-icon="${i}">${i}</button>`).join('')}</div></div>
          <div class="field"><span>邀請好友</span><div class="pick-list"></div></div>
          <button class="btn primary">建立</button>
        </form>`;
      let icon = GROUP_ICONS[0];
      $$('[data-icon]', body).forEach((c) => (c.onclick = () => {
        icon = c.dataset.icon;
        $$('[data-icon]', body).forEach((x) => x.classList.toggle('active', x === c));
      }));
      let getSelected = () => [];
      pickFriends($('.pick-list', body)).then((fn) => (getSelected = fn));
      const form = $('form', body);
      form.onsubmit = (e) => {
        e.preventDefault();
        busy($('button.primary', form), async () => {
          const g = await api.post('/groups', { name: form.name.value, icon, memberIds: getSelected() });
          toast(`群組「${g.name}」建立成功！`, 'success');
          m.close();
          openMessages({ type: 'group', group: g });
        });
      };
    },
  });
}

export function openGroupDetail(groupId) {
  const m = openModal({
    title: '群組資訊',
    className: 'modal-sm',
    stack: true,
    render(body) {
      const load = async () => {
        const g = await api.get('/groups/' + groupId);
        const isOwner = g.ownerId === store.me.id;
        m.setTitle(`${esc(g.icon)} ${esc(g.name)}`);
        body.innerHTML = `
          <h4 class="sub-h">成員 (${g.members.length})</h4>
          <ul class="user-list">${g.members.map((u) => `
            <li class="user-row" data-id="${u.id}">
              <button class="user-main" data-profile>${avatar(u, 34)}<span><b>${esc(u.name)}${u.id === g.ownerId ? ' 👑' : ''}</b><small>${u.online ? '<span class="on">● 線上</span>' : '離線'}</small></span></button>
              ${isOwner && u.id !== store.me.id ? '<button class="btn small ghost" data-kick>移除</button>' : ''}
            </li>`).join('')}</ul>
          <h4 class="sub-h">邀請好友</h4>
          <div class="pick-list"></div>
          <div class="row gap end">
            <button class="btn small primary" data-add>加入選取的好友</button>
          </div>
          <hr>
          <div class="row gap between">
            <button class="btn ghost" data-chat>💬 群組聊天</button>
            <button class="btn danger" data-leave>退出群組</button>
          </div>`;
        let getSelected = () => [];
        pickFriends($('.pick-list', body), g.members.map((x) => x.id)).then((fn) => (getSelected = fn));
        $$('[data-profile]', body).forEach((b) => (b.onclick = () => store.openPanel('profile', Number(b.closest('[data-id]').dataset.id))));
        $$('[data-kick]', body).forEach((b) => (b.onclick = () => busy(b, async () => {
          await api.del(`/groups/${groupId}/members/${b.closest('[data-id]').dataset.id}`);
          load();
        })));
        $('[data-add]', body).onclick = (e) => busy(e.target, async () => {
          const ids = getSelected();
          if (!ids.length) return toast('請先勾選好友');
          for (const id of ids) await api.post(`/groups/${groupId}/members`, { userId: id });
          toast('已加入群組', 'success');
          load();
        });
        $('[data-chat]', body).onclick = () => openMessages({ type: 'group', group: g });
        $('[data-leave]', body).onclick = async (e) => {
          if (!(await confirmDialog(`確定退出「${g.name}」？`))) return;
          busy(e.target, async () => {
            await api.del(`/groups/${groupId}/members/${store.me.id}`);
            toast('已退出群組');
          });
        };
      };
      body.innerHTML = '<div class="empty small">載入中…</div>';
      load().catch((err) => {
        toast(err.message, 'error');
        m.close();
      });
    },
  });
}

void el;
