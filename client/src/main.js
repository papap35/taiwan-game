import './style.css';
import { api, connectSocket, disconnectSocket } from './api.js';
import { store } from './store.js';
import { showLogin } from './ui/login.js';
import { mountHud } from './ui/hud.js';
import { Lobby } from './lobby/lobby.js';
import { toast } from './ui/dom.js';
import { sfx } from './games/audio.js';

const root = document.getElementById('app');

async function boot() {
  root.innerHTML = '<div class="boot">LOADING…</div>';
  try {
    const [config, catalog] = await Promise.all([api.get('/config'), api.get('/catalog')]);
    store.config = config;
    store.catalog = catalog;
  } catch {
    root.innerHTML = '<div class="boot">無法連線到伺服器 😢</div>';
    return;
  }
  try {
    store.setMe(await api.get('/me'));
    startApp();
  } catch {
    showLogin(root, startApp);
  }
}

let lobby = null;

function startApp() {
  root.innerHTML = '';
  const socket = connectSocket();

  socket.on('wallet', (w) => store.patchMe(w));
  socket.on('notify', (n) => {
    toast(n.text, n.type === 'achievement' ? 'success' : 'info', 4500);
    if (n.type === 'achievement') sfx.fanfare();
    else sfx.ding();
    const unread = { ...store.me.unread, notifications: store.me.unread.notifications + 1 };
    if (n.type === 'friend-request') unread.friendRequests += 1;
    store.patchMe({ unread });
    if (n.type === 'achievement') refreshMe();
  });
  socket.on('message', (m) => {
    store.emit('message', m);
    if (m.senderId !== store.me.id && !store.activeChatMatches?.(m)) {
      store.patchMe({ unread: { ...store.me.unread, messages: store.me.unread.messages + 1 } });
      sfx.ding();
    }
  });
  socket.on('friends:changed', () => {
    store.emit('friends:changed');
    refreshMe();
  });
  socket.on('groups:changed', (d) => store.emit('groups:changed', d));
  socket.on('presence', (p) => {
    store.presence.set(p.userId, p.online);
    store.emit('presence', p);
  });
  socket.on('typing', (t) => store.emit('typing', t));
  socket.on('message:read', (r) => store.emit('message:read', r));
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') logout();
  });

  mountHud(root, { logout });
  lobby = new Lobby(root, socket);
  store.lobby = lobby;
  // 自動化測試用：網址加上 ?debug=1 可從 console 操作
  if (new URLSearchParams(location.search).has('debug')) window.__arcade = { store, lobby };
}

export async function refreshMe() {
  try {
    store.setMe(await api.get('/me'));
  } catch {
    /* ignore */
  }
}
store.refreshMe = refreshMe;

async function logout() {
  await api.post('/auth/logout').catch(() => {});
  window.google?.accounts?.id?.disableAutoSelect?.();
  lobby?.destroy();
  lobby = null;
  disconnectSocket();
  store.me = null;
  showLogin(root, startApp);
}

boot();
