import { api } from '../api.js';
import { store } from '../store.js';
import { esc, $, $$, toast, busy, openModal, fmt, timeAgo, avatar, confirmDialog } from './dom.js';
import { openMessages, openGift } from './social.js';
import { sfx } from '../games/audio.js';
import { drawCharacterPreview } from '../lobby/sprites.js';

const DEFAULT_COLOR = '#3d7bfd';

export function openProfile(userId) {
  const m = openModal({
    title: '個人檔案',
    className: 'modal-md',
    stack: true,
    render(body) {
      body.innerHTML = '<div class="empty small">載入中…</div>';
      const load = async () => {
        const p = await api.get('/users/' + userId);
        const self = p.relation === 'self';
        m.setTitle(self ? '👤 我的檔案' : `👤 ${esc(p.name)}`);
        const badges = p.showcase.map((id) => store.badge(id)).filter(Boolean);
        const rarity = store.catalog.rarity;
        body.innerHTML = `
          <div class="profile-head">
            <canvas class="char-preview" width="64" height="80"></canvas>
            <div class="grow">
              <h3>${avatar(p, 28)} ${esc(p.name)}</h3>
              <p class="muted small">好友代碼 <b class="code">${esc(p.friendCode)}</b> · 加入於 ${new Date(p.createdAt).toLocaleDateString('zh-TW')}</p>
              <p class="bio">${p.bio ? esc(p.bio) : '<span class="muted">這個人很懶，什麼都沒寫。</span>'}</p>
            </div>
          </div>
          <div class="showcase">${badges.length ? badges.map((b) => `<div class="sc-badge" style="--rar:${rarity[b.rarity]?.color}" title="${esc(b.desc || '')}"><span>${b.icon}</span><small>${esc(b.name)}</small></div>`).join('') : '<span class="muted small">尚未展示徽章</span>'}</div>
          ${self ? '' : `<div class="row gap profile-actions">
            ${p.relation === 'friend' ? '<button class="btn primary" data-chat>💬 傳訊息</button><button class="btn ghost" data-gift>🎁 送代幣</button>'
              : p.relation === 'outgoing' ? '<button class="btn ghost" disabled>已送出邀請</button>'
                : p.relation === 'incoming' ? '<button class="btn primary" data-accept>接受好友邀請</button>'
                  : '<button class="btn primary" data-add>＋ 加好友</button>'}
          </div>`}
          <div class="stat-grid">
            <div><b>${fmt(p.stats.plays)}</b><small>遊玩場數</small></div>
            <div><b>${fmt(p.stats.ticketsEarned)}</b><small>累積彩票</small></div>
            <div><b>${p.achievements.length}/${store.catalog.achievements.length}</b><small>成就</small></div>
            <div><b>${p.stats.friends}</b><small>好友</small></div>
          </div>
          <h4 class="sub-h">最佳紀錄</h4>
          <div class="best-grid">${store.catalog.games.map((g) => `<div><small>${esc(g.name)}</small><b>${p.stats.best[g.id] != null ? fmt(p.stats.best[g.id]) : '—'}</b></div>`).join('')}</div>
          ${self ? `
          <h4 class="sub-h">編輯檔案</h4>
          <form class="stack profile-form">
            <label class="field"><span>暱稱</span><input name="name" maxlength="20" value="${esc(p.name)}" required></label>
            <label class="field"><span>自我介紹</span><input name="bio" maxlength="120" value="${esc(p.bio)}" placeholder="說點什麼吧"></label>
            <div class="field"><span>衣服顏色</span><div class="chips" data-colors></div></div>
            <div class="field"><span>帽子</span><div class="chips" data-hats></div></div>
            <div class="field"><span>展示徽章（最多 3 枚）</span><div class="chips badges" data-badges></div></div>
            <button class="btn primary">儲存</button>
          </form>` : ''}`;

        const me = store.me;
        const preview = { color: p.color, hat: p.hat };
        const cv = $('.char-preview', body);
        drawCharacterPreview(cv, preview);

        if (!self) {
          $('[data-chat]', body)?.addEventListener('click', () => openMessages({ type: 'dm', user: p }));
          $('[data-gift]', body)?.addEventListener('click', () => openGift(p));
          $('[data-add]', body)?.addEventListener('click', (e) => busy(e.target, async () => {
            const r = await api.post('/friends/request', { userId: p.id });
            toast(r.status === 'accepted' ? '已成為好友！' : '已送出好友邀請', 'success');
            load();
          }));
          $('[data-accept]', body)?.addEventListener('click', (e) => busy(e.target, async () => {
            await api.post('/friends/accept', { userId: p.id });
            toast('已成為好友！', 'success');
            load();
          }));
          return;
        }

        const owned = new Set(me.items);
        const colors = [{ value: DEFAULT_COLOR, icon: '🟦', name: '預設藍' }, ...store.catalog.shop.filter((i) => i.type === 'color' && owned.has(i.id))];
        const hats = [{ value: '', icon: '🚫', name: '不戴' }, ...store.catalog.shop.filter((i) => i.type === 'hat' && owned.has(i.id))];
        const badgeOptions = [
          ...store.catalog.shop.filter((i) => i.type === 'badge' && owned.has(i.id)).map((i) => i.id),
          ...me.achievements.map((a) => 'ach:' + a.id),
        ];
        let showcase = [...p.showcase];

        const chipGroup = (sel, list, current, onPick) => {
          const box = $(sel, body);
          box.innerHTML = list.map((c) => `<button type="button" class="chip ${c.value === current ? 'active' : ''}" data-v="${esc(c.value)}" title="${esc(c.name)}">${c.icon}</button>`).join('');
          box.onclick = (e) => {
            const b = e.target.closest('[data-v]');
            if (!b) return;
            $$('.chip', box).forEach((x) => x.classList.toggle('active', x === b));
            onPick(b.dataset.v);
          };
        };
        chipGroup('[data-colors]', colors, p.color, (v) => {
          preview.color = v;
          drawCharacterPreview(cv, preview);
        });
        chipGroup('[data-hats]', hats, p.hat || '', (v) => {
          preview.hat = v || null;
          drawCharacterPreview(cv, preview);
        });
        const drawBadges = () => {
          const box = $('[data-badges]', body);
          box.innerHTML = badgeOptions.length ? badgeOptions.map((id) => {
            const b = store.badge(id);
            return `<button type="button" class="chip ${showcase.includes(id) ? 'active' : ''}" data-b="${id}" title="${esc(b.name)}">${b.icon}</button>`;
          }).join('') : '<span class="muted small">到兌換中心換徽章，或解鎖成就獲得徽章！</span>';
          box.onclick = (e) => {
            const b = e.target.closest('[data-b]');
            if (!b) return;
            const id = b.dataset.b;
            if (showcase.includes(id)) showcase = showcase.filter((x) => x !== id);
            else if (showcase.length < 3) showcase.push(id);
            else return toast('最多展示 3 枚徽章');
            drawBadges();
          };
        };
        drawBadges();

        const form = $('.profile-form', body);
        form.onsubmit = (e) => {
          e.preventDefault();
          busy($('button.primary', form), async () => {
            const updated = await api.patch('/me', { name: form.name.value, bio: form.bio.value, color: preview.color, hat: preview.hat, showcase });
            store.setMe(updated);
            toast('已儲存', 'success');
            load();
          });
        };
      };
      load().catch((err) => {
        toast(err.message, 'error');
        m.close();
      });
    },
  });
}

export function openLeaderboard() {
  openModal({
    title: '🏆 排行榜',
    className: 'modal-md',
    render(body) {
      const games = store.catalog.games;
      body.innerHTML = `
        <div class="row between wrap gap">
          <div class="chips lb-games"><button class="chip active" data-g="">總彩票</button>${games.map((g) => `<button class="chip" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
          <div class="seg"><button class="active" data-s="all">全服</button><button data-s="friends">好友</button></div>
        </div>
        <ol class="lb-list"></ol>`;
      let game = '', scope = 'all';
      const list = $('.lb-list', body);
      const load = async () => {
        list.innerHTML = '<div class="empty small">載入中…</div>';
        const rows = await api.get(`/leaderboard?scope=${scope}${game ? '&game=' + game : ''}`);
        list.innerHTML = rows.length ? rows.map((r) => `
          <li class="${r.user.id === store.me.id ? 'me' : ''}" data-id="${r.user.id}">
            <span class="rank r${r.rank}">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            ${avatar(r.user, 32)}<span class="grow">${esc(r.user.name)}</span>
            <b>${fmt(r.value)}</b><small>${game ? '分' : '張'}</small>
          </li>`).join('') : '<div class="empty small">還沒有紀錄，快去搶第一！</div>';
      };
      list.onclick = (e) => {
        const li = e.target.closest('[data-id]');
        if (li) openProfile(Number(li.dataset.id));
      };
      $('.lb-games', body).onclick = (e) => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        game = b.dataset.g;
        $$('.lb-games .chip', body).forEach((x) => x.classList.toggle('active', x === b));
        load();
      };
      $('.seg', body).onclick = (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        scope = b.dataset.s;
        $$('.seg button', body).forEach((x) => x.classList.toggle('active', x === b));
        load();
      };
      load();
    },
  });
}

export function openAchievements() {
  openModal({
    title: '🏅 成就',
    className: 'modal-md',
    render(body) {
      const unlocked = new Map(store.me.achievements.map((a) => [a.id, a.unlockedAt]));
      const all = store.catalog.achievements;
      body.innerHTML = `
        <p class="muted small">已解鎖 ${unlocked.size} / ${all.length}。解鎖的成就會變成徽章，可以展示在個人檔案！</p>
        <ul class="ach-list">${all.map((a) => {
          const t = unlocked.get(a.id);
          return `<li class="${t ? 'done' : ''}">
            <span class="ach-ico">${a.icon}</span>
            <span class="grow"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>
            <span class="ach-reward">${t ? `✓ ${timeAgo(t)}` : `🪙 +${a.reward}`}</span>
          </li>`;
        }).join('')}</ul>`;
    },
  });
}

export function openNotifications() {
  openModal({
    title: '🔔 通知',
    className: 'modal-md',
    render(body) {
      body.innerHTML = '<div class="empty small">載入中…</div>';
      (async () => {
        const list = await api.get('/notifications');
        body.innerHTML = list.length ? `<ul class="notif-list">${list.map((n) => `
          <li class="${n.read ? '' : 'unread'}" data-type="${n.type}" data-json='${esc(JSON.stringify(n.data || {}))}'>
            <span class="grow">${esc(n.text)}</span><small>${timeAgo(n.createdAt)}</small>
          </li>`).join('')}</ul>` : '<div class="empty">沒有通知</div>';
        await api.post('/notifications/read');
        store.patchMe({ unread: { ...store.me.unread, notifications: 0 } });
        body.onclick = (e) => {
          const li = e.target.closest('li[data-type]');
          if (!li) return;
          const data = JSON.parse(li.dataset.json);
          if (li.dataset.type === 'friend-request') store.openPanel('friends', 'requests');
          else if (li.dataset.type === 'group-invite') store.openPanel('groups');
          else if (li.dataset.type === 'achievement') store.openPanel('achievements');
          else if (data.fromId || data.userId) openProfile(data.fromId || data.userId);
        };
      })();
    },
  });
}

export function openSettings({ logout }) {
  openModal({
    title: '⚙️ 設定',
    className: 'modal-sm',
    render(body) {
      body.innerHTML = `
        <div class="stack">
          <label class="row between"><span>🔊 音效</span><input type="checkbox" data-sound ${sfx.enabled ? 'checked' : ''}></label>
          <label class="row between"><span>音量</span><input type="range" min="0" max="1" step="0.05" value="${sfx.volume}" data-vol></label>
          <hr>
          <h4 class="sub-h">最近遊玩</h4>
          <ul class="tx-list history"><div class="empty small">載入中…</div></ul>
          <hr>
          <div class="help small muted">
            <p><b>操作說明</b></p>
            <p>方向鍵 / WASD 移動 · 靠近機台按 <kbd>E</kbd> 或 <kbd>空白鍵</kbd> 互動 · <kbd>Enter</kbd> 在遊戲場說話</p>
            <p>手機：左下方向盤移動，右下按鈕互動。</p>
          </div>
          ${store.me.isGuest ? '<p class="warn small">⚠️ 你目前是訪客身分，登出後將無法再登入這個帳號。</p>' : ''}
          <button class="btn danger" data-logout>登出</button>
        </div>`;
      $('[data-sound]', body).onchange = (e) => sfx.setEnabled(e.target.checked);
      $('[data-vol]', body).oninput = (e) => sfx.setVolume(Number(e.target.value));
      $('[data-logout]', body).onclick = async () => {
        if (store.me.isGuest && !(await confirmDialog('訪客帳號登出後就無法找回，確定登出？'))) return;
        logout();
      };
      api.get('/games/history').then((h) => {
        $('.history', body).innerHTML = h.length ? h.slice(0, 10).map((x) => `
          <li><span class="grow">${esc(store.game(x.gameId)?.name || x.gameId)}<small>${timeAgo(x.startedAt)} · 分數 ${fmt(x.score)}</small></span>
          <b class="plus">+${x.tickets} 🎟️</b></li>`).join('') : '<div class="empty small">還沒玩過遊戲</div>';
      });
    },
  });
}
