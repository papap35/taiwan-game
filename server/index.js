import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createArcadeServer } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(root, 'data', '.jwt-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

const db = openDb(process.env.DB_FILE || path.join(root, 'data', 'arcade.db'));
const { server } = createArcadeServer({
  db,
  jwtSecret: loadSecret(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  allowGuest: process.env.ALLOW_GUEST !== 'false',
  staticDir: path.join(root, 'client', 'dist'),
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : false,
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`🎪 懷舊遊樂場伺服器啟動：http://localhost:${port}`);
  if (!process.env.GOOGLE_CLIENT_ID) console.log('⚠️  未設定 GOOGLE_CLIENT_ID，僅能使用訪客登入。');
});
