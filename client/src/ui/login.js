import { api } from '../api.js';
import { store } from '../store.js';
import { el, esc, $, toast, busy } from './dom.js';

function waitForGoogle(timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (window.google?.accounts?.id) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

export function showLogin(root, onLogin) {
  const { googleClientId, allowGuest } = store.config;
  const page = el(`
    <div class="login-page">
      <div class="login-stars"></div>
      <div class="login-card">
        <div class="marquee">
          ${Array.from({ length: 14 }, (_, i) => `<i style="animation-delay:${i * 0.1}s"></i>`).join('')}
        </div>
        <h1 class="login-title"><span>懷舊</span><span>遊樂場</span></h1>
        <p class="login-sub">TAIWAN ARCADE</p>
        <p class="login-desc">推金幣、彈珠台、夾娃娃、打地鼠、投籃機、小瑪莉<br>童年的遊樂場，現在線上開張！</p>
        <div class="login-actions">
          ${googleClientId ? '<div id="gsi-btn" class="gsi-btn"></div>' : '<p class="muted small">（伺服器尚未設定 Google 登入）</p>'}
          ${allowGuest ? `
            <div class="divider"><span>或</span></div>
            <form class="guest-form">
              <input name="name" maxlength="20" placeholder="輸入暱稱，以訪客身分進場" autocomplete="nickname">
              <button class="btn primary">訪客進場</button>
            </form>` : ''}
        </div>
        <p class="login-foot">新玩家贈送 <b>${store.catalog.economy.startingTokens}</b> 枚代幣 🪙</p>
      </div>
    </div>`);
  root.replaceChildren(page);

  const finish = (user, created) => {
    store.setMe(user);
    if (created) toast(`歡迎 ${user.name}！送你 ${store.catalog.economy.startingTokens} 代幣`, 'success');
    onLogin(user);
  };

  if (googleClientId) {
    waitForGoogle().then((ok) => {
      const box = $('#gsi-btn', page);
      if (!box) return;
      if (!ok) {
        box.innerHTML = '<p class="muted small">Google 登入載入失敗，請檢查網路或廣告攔截器。</p>';
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          try {
            const r = await api.post('/auth/google', { credential });
            finish(r.user, r.created);
          } catch (err) {
            toast(err.message, 'error');
          }
        },
        ux_mode: 'popup',
      });
      window.google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh-TW', width: 280 });
    });
  }

  const form = $('.guest-form', page);
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      busy($('button', form), async () => {
        const r = await api.post('/auth/guest', { name });
        finish(r.user, r.created);
      });
    };
  }
  void esc;
}
