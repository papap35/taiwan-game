import { api } from '../api.js';
import { store } from '../store.js';
import { el, esc, $, toast, openModal, closeAllModals, fmt, confirmDialog } from '../ui/dom.js';
import { sfx } from './audio.js';

const MODULES = {
  'coin-pusher': () => import('./coinPusher.js'),
  pinball: () => import('./pinball.js'),
  claw: () => import('./claw.js'),
  whack: () => import('./whack.js'),
  basketball: () => import('./basketball.js'),
  marie: () => import('./marie.js'),
};

const CONTROLS = {
  'coin-pusher': '滑鼠移動 / 方向鍵 調整位置，點擊或空白鍵投幣。',
  pinball: '左擋板：← 或 Z 或點左半邊；右擋板：→ 或 M 或點右半邊。按住空白鍵（或下方按鈕）蓄力發射。',
  claw: '方向鍵 / WASD 或螢幕按鈕移動夾子，空白鍵或「夾！」按鈕下爪。限時 20 秒。',
  whack: '點擊地鼠，或用數字鍵 1–9 對應九個洞。金地鼠 +30，炸彈 −20。',
  basketball: '按住球往上甩出去（滑鼠或手指）！越快越遠。',
  marie: '點水果押注（每次 1 點），按「開始」轉燈。按「結算」把點數換成彩票。',
};

const ICONS = { 'coin-pusher': '🪙', pinball: '⚪', claw: '🧸', whack: '🔨', basketball: '🏀', marie: '🍒' };

let running = false;

export function launchGame(gameId, { onEnter, onExit }) {
  if (running) return;
  const game = store.game(gameId);
  openModal({
    title: `${ICONS[gameId]} ${esc(game.name)}`,
    className: 'modal-sm game-intro',
    render(body, modal) {
      body.innerHTML = `
        <p>${esc(game.desc)}</p>
        <div class="intro-box"><b>操作方式</b><p>${esc(CONTROLS[gameId])}</p></div>
        <div class="intro-stats">
          <div><small>每局</small><b>🪙 ${game.cost}</b></div>
          <div><small>單局最高</small><b>🎟️ ${game.maxTickets}</b></div>
          <div><small>持有代幣</small><b>🪙 ${fmt(store.me.tokens)}</b></div>
        </div>
        <button class="btn primary wide big" data-start ${store.me.tokens < game.cost ? 'disabled' : ''}>
          ${store.me.tokens < game.cost ? '代幣不足' : `投幣開始（🪙 ${game.cost}）`}
        </button>
        ${store.me.tokens < game.cost ? '<button class="btn ghost wide" data-wallet>去簽到領代幣 / 兌換代幣</button>' : ''}`;
      $('[data-wallet]', body)?.addEventListener('click', () => store.openPanel('wallet'));
      $('[data-start]', body).onclick = () => {
        sfx.unlock();
        modal.close();
        startSession(gameId, { onEnter, onExit });
      };
    },
  });
}

async function startSession(gameId, { onEnter, onExit }) {
  const game = store.game(gameId);
  running = true;
  let session;
  try {
    session = await api.post(`/games/${gameId}/start`);
  } catch (err) {
    toast(err.message, 'error');
    running = false;
    return;
  }
  sfx.coin();
  onEnter?.();
  closeAllModals();

  const overlay = el(`
    <div class="game-overlay">
      <div class="game-stage"></div>
      <div class="game-topbar">
        <span class="game-title">${ICONS[gameId]} ${esc(game.name)}</span>
        <button class="btn small ghost" data-exit>離開</button>
      </div>
      <div class="game-loading">載入中…</div>
    </div>`);
  document.body.appendChild(overlay);
  const stage = $('.game-stage', overlay);
  let instance = null;
  let finished = false;

  const close = () => {
    instance?.dispose();
    overlay.remove();
    running = false;
    onExit?.();
  };

  const finish = async (score) => {
    if (finished) return;
    finished = true;
    let result;
    try {
      result = await api.post('/games/finish', { sessionId: session.sessionId, score });
    } catch (err) {
      toast(err.message, 'error');
      result = { score, tickets: 0, achievements: [] };
    }
    if (result.tickets > 0) sfx.win();
    else sfx.lose();
    showResult(result);
  };

  const showResult = (r) => {
    const box = el(`
      <div class="game-result">
        <div class="result-card">
          <h2>${r.flagged ? '⏱️ 遊戲時間太短' : r.newBest ? '🎉 新紀錄！' : '遊戲結束'}</h2>
          <div class="result-score"><small>分數</small><b>${fmt(r.score)}</b></div>
          <div class="result-tickets">🎟️ <b class="count">0</b> 張彩票</div>
          ${r.flagged ? '<p class="muted small">太早離開了，這局不計彩票。</p>' : ''}
          ${(r.achievements || []).map((a) => `<div class="result-ach">${a.icon} 解鎖成就「${esc(a.name)}」 +🪙${a.reward}</div>`).join('')}
          <div class="row gap center">
            <button class="btn ghost" data-leave>回遊戲場</button>
            <button class="btn primary" data-again>再玩一次（🪙 ${game.cost}）</button>
          </div>
        </div>
      </div>`);
    overlay.appendChild(box);
    // 彩票數字跑動
    const cnt = $('.count', box);
    const target = r.tickets;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 900);
      cnt.textContent = Math.round(target * p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    $('[data-leave]', box).onclick = close;
    $('[data-again]', box).onclick = async () => {
      if (store.me.tokens < game.cost) return toast('代幣不足', 'error');
      close();
      startSession(gameId, { onEnter, onExit });
    };
  };

  $('[data-exit]', overlay).onclick = async () => {
    if (finished) return close();
    if (!instance) return;
    if (!(await confirmDialog('現在離開會以目前分數結算，確定嗎？'))) return;
    instance.finish(instance.currentScore());
  };

  try {
    const mod = await MODULES[gameId]();
    $('.game-loading', overlay).remove();
    instance = new mod.default(stage, { onEnd: finish, sfx });
    if (window.__arcade) window.__arcade.game = instance;
  } catch (err) {
    console.error(err);
    toast('遊戲載入失敗：' + err.message, 'error');
    finish(0);
  }
}
