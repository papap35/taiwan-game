# 🕹️ 懷舊遊樂場 Taiwan Arcade

台灣傳統遊樂場風格的線上遊戲平台。玩家在 **2D 像素風遊戲場** 裡走動、和其他玩家互動，走到機台前就能玩 **3D 街機遊戲**，賺彩票換獎品。

![stack](https://img.shields.io/badge/Node-22-green) ![three](https://img.shields.io/badge/Three.js-3D-black) ![socket](https://img.shields.io/badge/Socket.io-realtime-blue)

## 功能

| 類別 | 內容 |
| --- | --- |
| 🎮 遊戲場 | 2D 像素風大廳、方向鍵/WASD 或手機搖桿移動、**多人同步**（看得到其他線上玩家）、頭上對話泡泡、點其他玩家看檔案/加好友、顯示誰正在玩什麼 |
| 🕹️ 3D 遊戲 | **推金幣**（物理推台）、**彈珠台**（擋板、彈跳柱、倍率）、**夾娃娃機**（三爪、會滑落）、**打地鼠**（金地鼠/炸彈/連擊）、**投籃機**（甩動投籃、最後 10 秒加倍、移動籃框）、**小瑪莉**（經典水果盤、LUCKY 送燈） |
| 🔐 登入 | **Google 登入**（Google Identity Services + 伺服器端驗證 ID token）、可選的訪客登入 |
| 👫 社交 | 好友代碼 / 暱稱搜尋、好友邀請（接受/拒絕/取消）、線上狀態、**群組**（建立、邀請、踢人、退出、群主轉移）、**私訊與群組聊天**（即時、未讀數、已讀、正在輸入…） |
| 🪙 代幣 | 新手禮、**每日簽到**（連續簽到加碼）、送代幣給好友（每日上限）、完整交易紀錄 |
| 🎁 兌換 | 用彩票兌換 **數位徽章**（稀有度分級）、**角色帽子**、**衣服顏色**、或換回 **代幣** |
| 🏅 其他 | 成就系統（解鎖送代幣、可當徽章展示）、排行榜（全服/好友、各遊戲）、個人檔案（展示 3 枚徽章）、通知中心、遊玩紀錄、WebAudio 合成音效 |

## 快速開始

需要 **Node.js 22.13+**（使用內建 `node:sqlite`，不需要另外裝資料庫）。

```bash
npm install
```

```bash
cp .env.example .env   # 填入 GOOGLE_CLIENT_ID（不填則只能訪客登入）
```

開發模式（前端 http://localhost:5173 ，API 在 3000）：

```bash
npm run dev
```

正式環境：

```bash
npm run build
```

```bash
npm start   # http://localhost:3000
```

測試：

```bash
npm test
```

## 設定 Google 登入

1. 到 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → 建立憑證 → **OAuth 用戶端 ID** → 類型「網頁應用程式」。
2. 「已授權的 JavaScript 來源」加入 `http://localhost:5173`、`http://localhost:3000` 與你的正式網域。
3. 把用戶端 ID 填到 `.env` 的 `GOOGLE_CLIENT_ID`。
4. 正式環境建議設 `ALLOW_GUEST=false` 並設定固定的 `JWT_SECRET`。

前端使用 Google 的登入按鈕取得 ID token，伺服器用 `google-auth-library` 驗證簽章與 audience 後才建立帳號，並以 httpOnly cookie 保存 JWT session。

## 遊戲經濟

- **代幣 🪙**：玩遊戲的花費（每局 5–10 枚）。新手 100 枚，每日簽到 30 枚起（連續 7 天最高 60）。
- **彩票 🎟️**：遊戲成績換算而來，到兌換中心換獎品。300 彩票可換回 50 代幣。
- **防作弊**：開局時伺服器先扣代幣並建立 session；結算時伺服器依遊戲規則換算彩票、套用**單局上限**，並檢查**最短遊戲時間**；同時只能有一局進行中。遊戲在瀏覽器執行，所以分數仍是由前端回報 —— 上限設計確保就算被竄改，影響也有限。

各遊戲的花費、上限與換算公式都在 [`server/catalog.js`](server/catalog.js)，兌換商品與成就也在同一個檔案，修改即可調整。

## 部署（CI/CD：前端 Vercel + 後端 Render）

Vercel 是 serverless 平台，不支援長時間的 WebSocket，也沒有永久磁碟，所以拆成兩部分：

```
瀏覽器 ──► Vercel（前端靜態檔）──/api rewrite──► Render（Node 後端 + SQLite 磁碟）
   └──────────── Socket.io 直連（短期 token 驗證）────────────┘
```

- `/api` 走 Vercel 同網域 rewrite，登入 cookie 是第一方 cookie。
- Socket.io 直連 Render（`VITE_SOCKET_URL`），連線前先向 `/api/auth/socket-token` 取得 10 分鐘有效的 token。
- GitHub Actions（`.github/workflows/ci.yml`）：每個 PR 與 main 推送都會跑測試與建置；測試通過後，**main → 正式部署**（Render + Vercel），**PR → Vercel 預覽網址**。

### 一次性設定

**1. Render（後端）**

1. Render Dashboard → **New → Blueprint**，選這個 repo，會讀取 `render.yaml` 建立 `taiwan-arcade-api`。
2. 填入環境變數：`GOOGLE_CLIENT_ID`、`CORS_ORIGIN`（Vercel 網址，第 2 步建立後再回來填）。`JWT_SECRET` 會自動產生。
3. 服務的 **Settings → Deploy Hook** 複製網址。
4. 記下服務網址，例如 `https://taiwan-arcade-api.onrender.com`。

> `render.yaml` 使用 `starter` 方案，因為 SQLite 需要永久磁碟（免費方案沒有磁碟，重新部署或休眠後資料會消失）。`autoDeploy: false` 讓部署只由 CI 在測試通過後觸發。

**2. Vercel（前端）**

1. 在本機連結專案（只做一次，會產生 `.vercel/project.json`）：

```bash
npx vercel@64.3.1 link
```

2. 從 `.vercel/project.json` 取得 `orgId` 與 `projectId`；到 Vercel → Account Settings → **Tokens** 建立 token。
3. 關掉 Vercel 專案的 Git 自動部署（Settings → Git），改由 GitHub Actions 部署，避免重複。

**3. GitHub（repo → Settings → Secrets and variables → Actions）**

| 類型 | 名稱 | 內容 |
| --- | --- | --- |
| Secret | `VERCEL_TOKEN` | Vercel token |
| Secret | `VERCEL_ORG_ID` | `.vercel/project.json` 的 `orgId` |
| Secret | `VERCEL_PROJECT_ID` | `.vercel/project.json` 的 `projectId` |
| Secret | `RENDER_DEPLOY_HOOK_URL` | Render deploy hook 網址 |
| Variable | `BACKEND_URL` | Render 服務網址（https、不含結尾斜線） |

缺少設定時，部署步驟會顯示警告並略過，不會讓 CI 失敗。

**4. Google 登入**：在 Google Cloud Console 的 OAuth 用戶端，把 Vercel 網址加入「已授權的 JavaScript 來源」。

手動產生 `vercel.json`（例如想在本機用 Vercel CLI 部署）：

```bash
BACKEND_URL=https://taiwan-arcade-api.onrender.com node scripts/vercel-config.mjs
```

## 專案結構

```
server/
  index.js       啟動、讀 .env
  app.js         Express 路由 + Socket.io（聊天、線上狀態、多人遊戲場）
  services.js    商業邏輯（錢包、遊戲結算、好友、群組、訊息、成就…）
  catalog.js     遊戲 / 商品 / 成就設定
  db.js          SQLite schema
scripts/
  vercel-config.mjs  產生 vercel.json（/api rewrite 到後端）
client/
  src/lobby/     2D 像素遊戲場（地圖、角色 sprite、移動與碰撞）
  src/games/     3D 遊戲（Three.js + cannon-es 物理）
  src/ui/        HUD 與各種面板（好友、聊天、群組、兌換、檔案…）
test/            API 整合測試
```

## 操作

- 遊戲場：方向鍵 / WASD 移動，靠近機台按 **E** 或 **空白鍵**，**Enter** 說話。手機有搖桿和 A 鍵。
- 走到右上角的 **兌換中心**、**代幣機**、**排行榜** 或休息區的 **佈告欄** 也可以互動。
