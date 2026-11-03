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
  socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  return socket;
}
export function getSocket() {
  return socket;
}
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
