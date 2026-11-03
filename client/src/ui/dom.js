export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** 由 HTML 字串建立單一元素 */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}
export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function toast(text, type = 'info', ms = 3200) {
  const box = document.getElementById('toasts');
  const t = el(`<div class="toast toast-${type}">${esc(text)}</div>`);
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function fmt(n) {
  return Number(n || 0).toLocaleString('zh-TW');
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return new Date(ts).toLocaleDateString('zh-TW');
}

export function clockTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 頭像：有 Google 大頭照用照片，否則用名字首字 + 顏色 */
export function avatar(user, size = 36) {
  if (!user) return '';
  const online = user.online ? '<i class="dot-online"></i>' : '';
  if (user.picture) {
    return `<span class="avatar" style="width:${size}px;height:${size}px"><img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">${online}</span>`;
  }
  const ch = esc([...(user.name || '?')][0]);
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:${esc(user.color || '#555')};font-size:${size * 0.45}px">${ch}${online}</span>`;
}

const modalStack = [];

/**
 * 開啟面板。render(body, ctx) 負責填入內容，可回傳清理函式。
 * 回傳 { close, body }
 */
export function openModal({ title, className = '', render, onClose, stack = false }) {
  if (!stack) closeAllModals();
  const root = el(`
    <div class="modal-backdrop">
      <div class="modal ${className}" role="dialog" aria-modal="true">
        <header class="modal-head">
          <h2>${title}</h2>
          <button class="icon-btn modal-close" aria-label="關閉">✕</button>
        </header>
        <div class="modal-body"></div>
      </div>
    </div>`);
  document.body.appendChild(root);
  const body = $('.modal-body', root);
  let cleanup = null;
  const modal = {
    body,
    root,
    setTitle: (t) => ($('.modal-head h2', root).innerHTML = t),
    close() {
      const i = modalStack.indexOf(modal);
      if (i < 0) return;
      modalStack.splice(i, 1);
      cleanup?.();
      onClose?.();
      root.classList.remove('show');
      setTimeout(() => root.remove(), 200);
    },
  };
  modalStack.push(modal);
  root.style.zIndex = 100 + modalStack.length;
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) modal.close();
  });
  $('.modal-close', root).onclick = () => modal.close();
  requestAnimationFrame(() => root.classList.add('show'));
  cleanup = render(body, modal) || null;
  return modal;
}

export function closeModal() {
  modalStack[modalStack.length - 1]?.close();
}

export function closeAllModals() {
  while (modalStack.length) modalStack[modalStack.length - 1].close();
}

export function isModalOpen() {
  return modalStack.length > 0;
}

export function confirmDialog(text) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: '確認',
      className: 'modal-sm',
      stack: true,
      onClose: () => !done && resolve(false),
      render(body) {
        body.innerHTML = `<p class="confirm-text">${esc(text)}</p>
          <div class="row end gap"><button class="btn ghost" data-no>取消</button><button class="btn primary" data-yes>確定</button></div>`;
        $('[data-no]', body).onclick = () => m.close();
        $('[data-yes]', body).onclick = () => {
          done = true;
          resolve(true);
          m.close();
        };
      },
    });
  });
}

/** 包裝 async 按鈕動作：執行中停用按鈕、錯誤時跳 toast */
export async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toast(err.message || '發生錯誤', 'error');
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
  }
}
