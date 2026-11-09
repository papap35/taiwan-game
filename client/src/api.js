import { io } from 'socket.io-client';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `請求失敗 (${res.status})`);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};

let socket = null;
export function connectSocket() {
  if (socket) return socket;
  // 部署在 Vercel 時，API 走同網域 rewrite，socket 則直連後端（VITE_SOCKET_URL），用短期 token 驗證
  const url = import.meta.env.VITE_SOCKET_URL || undefined;
  socket = io(url, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      request('GET', '/auth/socket-token').then(({ token }) => cb({ token }), () => cb({}));
    },
  });
  return socket;
}
export function getSocket() {
  return socket;
}
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
