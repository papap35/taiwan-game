import { api } from '../api.js';
import { store } from '../store.js';
import { esc, $, $$, toast, busy, openModal, fmt, timeAgo, confirmDialog } from './dom.js';
import { sfx } from '../games/audio.js';

const TABS = [
  ['all', '全部'],
  ['tokens', '代幣'],
  ['badge', '徽章'],
  ['hat', '帽子'],
  ['color', '服裝'],
];

export function openShop(tab = 'all') {
  openModal({
    title: '🎁 彩票兌換中心',
    className: 'modal-lg',
    render(body) {
      body.innerHTML = `
        <div class="shop-banner">
          <div><small>持有彩票</small><b class="tk">🎟️ <span data-tk></span></b></div>
          <p>玩遊戲賺彩票，來這裡換徽章、帽子、衣服，或換回代幣繼續玩！</p>
        </div>
        <div class="tabs">${TABS.map(([k, v]) => `<button data-tab="${k}">${v}</button>`).join('')}</div>
        <div class="shop-grid"></div>`;
      const grid = $('.shop-grid', body);
      let current = tab;
      const rarity = store.catalog.rarity;

      const draw = () => {
        $('[data-tk]', body).textContent = fmt(store.me.tickets);
        $$('.tabs button', body).forEach((b) => b.classList.toggle('active', b.dataset.tab === current));
        const owned = new Set(store.me.items);
        const items = store.catalog.shop.filter((i) => current === 'all' || i.type === current);
        grid.innerHTML = items.map((i) => {
          const has = owned.has(i.id) && !i.repeatable;
          const r = rarity[i.rarity];
          const afford = store.me.tickets >= i.price;
          return `<div class="shop-item ${has ? 'owned' : ''}" style="--rar:${r.color}">
            <span class="rar-tag">${r.name}</span>
            <div class="shop-icon">${i.icon}</div>
            <b>${esc(i.name)}</b>
            <small>${esc(i.desc)}</small>
            <button class="btn small ${has ? 'ghost' : afford ? 'primary' : 'ghost'}" data-id="${i.id}" ${has ? 'disabled' : ''}>
              ${has ? '✓ 已擁有' : `🎟️ ${fmt(i.price)}`}
            </button>
          </div>`;
        }).join('');
      };

      $$('.tabs button', body).forEach((b) => (b.onclick = () => {
        current = b.dataset.tab;
        draw();
      }));

      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-id]');
        if (!btn) return;
        const item = store.item(btn.dataset.id);
        if (store.me.tickets < item.price) {
          toast(`彩票不足，還差 ${fmt(item.price - store.me.tickets)} 張`, 'error');
          return;
        }
        busy(btn, async () => {
          if (!(await confirmDialog(`用 ${fmt(item.price)} 張彩票兌換「${item.name}」？`))) return;
          await api.post('/shop/redeem', { itemId: item.id });
          sfx.fanfare();
          toast(`${item.icon} 兌換成功：${item.name}！`, 'success');
          await store.refreshMe();
        });
      });

      const off = store.on('me', draw);
      draw();
      return off;
    },
  });
}

export function openWallet() {
  openModal({
    title: '🪙 我的錢包',
    className: 'modal-md',
    render(body) {
      const { dailyBase, dailyStreakBonus } = store.catalog.economy;
      const draw = async () => {
        const me = store.me;
        const streak = me.checkedInToday ? me.checkinStreak : 0;
        body.innerHTML = `
          <div class="wallet-cards">
            <div class="wcard tokens"><small>代幣</small><b>🪙 ${fmt(me.tokens)}</b><span>用來玩遊戲</span></div>
            <div class="wcard tickets"><small>彩票</small><b>🎟️ ${fmt(me.tickets)}</b><span>用來兌換獎品</span></div>
          </div>
          <div class="checkin-card">
            <div class="row between"><h4>📅 每日簽到</h4><span class="muted small">連續簽到獎勵越來越多！</span></div>
            <div class="streak">${Array.from({ length: 7 }, (_, i) => {
              const day = i + 1;
              const done = me.checkedInToday ? day <= Math.min(me.checkinStreak, 7) : false;
              return `<div class="sday ${done ? 'done' : ''}"><small>第${day}天</small><b>${dailyBase + dailyStreakBonus * i}</b></div>`;
            }).join('')}</div>
            <button class="btn primary wide" data-checkin ${me.checkedInToday ? 'disabled' : ''}>${me.checkedInToday ? `✓ 今天已簽到（連續 ${me.checkinStreak} 天）` : '立即簽到領代幣'}</button>
          </div>
          <div class="row between"><h4 class="sub-h">交易紀錄</h4><button class="btn small ghost" data-shop>前往兌換 →</button></div>
          <ul class="tx-list"><div class="empty small">載入中…</div></ul>`;
        void streak;
        $('[data-shop]', body).onclick = () => openShop();
        const cbtn = $('[data-checkin]', body);
        cbtn.onclick = () => busy(cbtn, async () => {
          const r = await api.post('/wallet/checkin');
          sfx.coin();
          toast(`簽到成功！獲得 ${r.reward} 代幣（連續 ${r.streak} 天）`, 'success');
          await store.refreshMe();
          draw();
        });
        const txs = await api.get('/wallet/transactions');
        $('.tx-list', body).innerHTML = txs.length ? txs.map((t) => `
          <li><span class="tx-ico">${t.currency === 'tokens' ? '🪙' : '🎟️'}</span>
            <span class="grow">${esc(t.reason)}<small>${timeAgo(t.createdAt)}</small></span>
            <b class="${t.amount > 0 ? 'plus' : 'minus'}">${t.amount > 0 ? '+' : ''}${fmt(t.amount)}</b></li>`).join('') : '<div class="empty small">尚無紀錄</div>';
      };
      draw();
    },
  });
}
