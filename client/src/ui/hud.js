import { store } from '../store.js';
import { el, esc, $, fmt, avatar } from './dom.js';
import { openFriends, openMessages, openGroups } from './social.js';
import { openShop, openWallet } from './shop.js';
import { openLeaderboard, openAchievements, openProfile, openNotifications, openSettings } from './profile.js';

export function mountHud(root, { logout }) {
  const hud = el(`
    <div class="hud">
      <div class="hud-top">
        <button class="hud-me" title="個人檔案"></button>
        <div class="wallet">
          <button class="pill tokens" title="代幣（玩遊戲用）"><span class="ico">🪙</span><b data-tokens>0</b></button>
          <button class="pill tickets" title="彩票（可兌換獎品）"><span class="ico">🎟️</span><b data-tickets>0</b></button>
          <button class="pill checkin" title="每日簽到">📅 <span>簽到</span></button>
        </div>
        <nav class="hud-nav">
          <button data-open="friends" title="好友"><span>👫</span><em>好友</em><i class="badge" data-badge="friends"></i></button>
          <button data-open="messages" title="訊息"><span>💬</span><em>訊息</em><i class="badge" data-badge="messages"></i></button>
          <button data-open="groups" title="群組"><span>👥</span><em>群組</em></button>
          <button data-open="shop" title="兌換"><span>🎁</span><em>兌換</em></button>
          <button data-open="leaderboard" title="排行榜"><span>🏆</span><em>排行</em></button>
          <button data-open="achievements" title="成就"><span>🏅</span><em>成就</em></button>
          <button data-open="notifications" title="通知"><span>🔔</span><em>通知</em><i class="badge" data-badge="notifications"></i></button>
          <button data-open="settings" title="設定"><span>⚙️</span><em>設定</em></button>
        </nav>
      </div>
    </div>`);
  root.appendChild(hud);

  const open = {
    friends: () => openFriends(),
    messages: () => openMessages(),
    groups: () => openGroups(),
    shop: () => openShop(),
    leaderboard: () => openLeaderboard(),
    achievements: () => openAchievements(),
    notifications: () => openNotifications(),
    settings: () => openSettings({ logout }),
  };
  hud.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) open[b.dataset.open]();
  });
  $('.hud-me', hud).onclick = () => openProfile(store.me.id);
  $('.tokens', hud).onclick = () => openWallet();
  $('.tickets', hud).onclick = () => openShop();
  $('.checkin', hud).onclick = () => openWallet();

  // 讓遊戲場內的互動物件可以開啟面板
  store.openPanel = (name, arg) => (name === 'profile' ? openProfile(arg) : open[name]?.(arg));

  let lastTokens = null, lastTickets = null;
  const bump = (node) => {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  };

  const render = (me) => {
    if (!me) return;
    $('.hud-me', hud).innerHTML = `${avatar(me, 34)}<span class="hud-name">${esc(me.name)}${me.isGuest ? '<small>訪客</small>' : ''}</span>`;
    const t = $('[data-tokens]', hud), k = $('[data-tickets]', hud);
    t.textContent = fmt(me.tokens);
    k.textContent = fmt(me.tickets);
    if (lastTokens !== null && lastTokens !== me.tokens) bump(t.parentElement);
    if (lastTickets !== null && lastTickets !== me.tickets) bump(k.parentElement);
    lastTokens = me.tokens;
    lastTickets = me.tickets;
    $('.checkin', hud).classList.toggle('hidden', me.checkedInToday);
    const setBadge = (name, n) => {
      const b = $(`[data-badge="${name}"]`, hud);
      b.textContent = n > 99 ? '99+' : n;
      b.classList.toggle('on', n > 0);
    };
    setBadge('friends', me.unread.friendRequests);
    setBadge('messages', me.unread.messages);
    setBadge('notifications', me.unread.notifications);
  };
  store.on('me', render);
  render(store.me);
  return hud;
}
