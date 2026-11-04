// 產生 vercel.json：前端靜態檔放 Vercel，/api 透過 rewrite 轉到後端（Render）。
// 用法：BACKEND_URL=https://xxx.onrender.com node scripts/vercel-config.mjs
import fs from 'node:fs';

const backend = (process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(backend)) {
  console.error('請設定 BACKEND_URL，例如 https://taiwan-arcade-api.onrender.com（https、不含路徑）');
  process.exit(1);
}

const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'client/dist',
  rewrites: [
    // API 走同網域 rewrite，登入 cookie 才是第一方 cookie
    { source: '/api/:path*', destination: `${backend}/api/:path*` },
    // SPA：其他路徑都回 index.html
    { source: '/(.*)', destination: '/index.html' },
  ],
  headers: [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ],
};

fs.writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log(`vercel.json 已產生，/api → ${backend}`);
