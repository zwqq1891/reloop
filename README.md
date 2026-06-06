# ♻ reloop — 智慧回收平台

> 利用 AI 影像辨識與碳幣激勵系統，讓回收變成一種無限循環的美學。

---

## 目錄

- [功能總覽](#功能總覽)
- [技術架構](#技術架構)
- [專案結構](#專案結構)
- [環境需求](#環境需求)
- [安裝與啟動](#安裝與啟動)
- [手機測試（ngrok）](#手機測試ngrok)
- [API 文件](#api-文件)
- [碳幣點數計算規則](#碳幣點數計算規則)
- [執行測試](#執行測試)
- [常見問題排除](#常見問題排除)

---

## 功能總覽

| 功能 | 說明 |
|------|------|
| **帳號系統** | 註冊 / 登入，JWT 無狀態驗證，7 天有效期 |
| **AI 拍照辨識** | 拍攝回收物，Gemini 2.5 Flash 自動判斷材質、大小、清潔度 |
| **清單模式掃描** | 連續拍多件自動加入清單，最後一次確認全部投入 |
| **自動辨識模式** | 每 3 秒自動掃描，適合高頻回收場景 |
| **品項計量圖** | 掃描頁即時顯示各類別累積回收筆數 |
| **碳幣獎勵** | 每次回收依公式計算碳幣（CCN），累積後可兌換獎品 |
| **回收統計** | 本月回收重量、碳足跡減少量、歷史紀錄明細 |
| **獎勵中心** | 用碳幣兌換星巴克券、環保袋、共享單車月票等 |
| **深色模式** | 支援淺色 / 深色主題切換 |
| **行動端支援** | RWD 響應式設計，底部導覽列，適配手機操作 |

---

## 技術架構

```
前端（Vanilla JS）        後端（Node.js）           外部服務
─────────────────        ────────────────          ─────────────────
HTML + CSS               Express.js                Google Gemini 2.5 Flash
原生 JavaScript           JWT 驗證                  影像辨識 AI
RWD 響應式設計             bcryptjs 密碼加密
無前端框架                 multer 圖片處理            MySQL 8.x
                         mysql2 資料庫連線           6 張資料表
                         Jest + Supertest 測試       完整外鍵約束
```

> 詳細系統架構、資料庫設計與 API 設計說明請參考 [ARCHITECTURE.md](./ARCHITECTURE.md)。

---

## 專案結構

```
reloop/
├── index.html                  # 前端入口（單頁應用）
├── css/
│   └── style.css               # 全站樣式（含 RWD、深色模式）
├── js/
│   ├── api.js                  # fetch 封裝、Session 管理
│   ├── app.js                  # 頁面路由、主題切換、設定面板
│   ├── auth.js                 # 登入／註冊表單切換
│   ├── main.js                 # DOMContentLoaded 初始化
│   └── pages/
│       ├── dashboard.js        # 儀表板：碳幣、本月統計、活動日誌
│       ├── scan.js             # AI 掃描：清單模式、品項計量圖
│       ├── stats.js            # 回收統計趨勢頁
│       └── rewards.js          # 獎勵中心頁
├── server/
│   ├── server.js               # Express 主程式（所有 API 路由）
│   ├── db.js                   # MySQL 連線池
│   ├── .env                    # 環境變數（不進 git）
│   ├── .env.example            # 環境變數範本
│   ├── package.json
│   └── __tests__/
│       └── server.test.js      # 自動化測試（16 項）
├── sql/
│   └── schema.sql              # 資料庫建立腳本 + 初始資料
├── ARCHITECTURE.md             # 系統架構說明文件
└── README.md                   # 本文件
```

---

## 環境需求

| 工具 | 最低版本 | 用途 |
|------|----------|------|
| Node.js | 18+ | 執行後端 |
| MySQL | 8.0+ | 資料儲存 |
| ngrok（選用） | 3.x | 手機 / 外部裝置測試 |

---

## 安裝與啟動

### 1. 取得專案

```bash
git clone https://github.com/zwqq1891/reloop.git
cd reloop
```

---

### 2. 安裝 MySQL

#### Windows（PowerShell 管理員）

```powershell
winget install Oracle.MySQL --accept-package-agreements --accept-source-agreements
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --initialize --console
# ↑ 複製輸出中的臨時密碼

& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --install MySQL84
Start-Service MySQL84

# 修改 root 密碼
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p"臨時密碼" --connect-expired-password -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密碼';"
```

#### macOS

```bash
brew install mysql && brew services start mysql
mysql_secure_installation
```

#### Linux（Ubuntu / Debian）

```bash
sudo apt update && sudo apt install mysql-server -y
sudo systemctl start mysql && sudo mysql_secure_installation
```

---

### 3. 建立資料庫

#### Windows

```powershell
$env:PATH += ";C:\Program Files\MySQL\MySQL Server 8.4\bin"
mysql -u root -p"你的密碼" -e "CREATE DATABASE IF NOT EXISTS reloop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Get-Content "sql\schema.sql" | mysql -u root -p"你的密碼" reloop
```

#### macOS / Linux

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS reloop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p reloop < sql/schema.sql
```

建立完成後包含：`users`、`waste_types`（6 種）、`recycle_records`、`coin_transactions`、`classification_logs`、`rewards`（6 項）。

---

### 4. 設定環境變數

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server\.env.example server\.env
```

編輯 `server/.env`：

```env
PORT=3000
JWT_SECRET=請換成長隨機字串

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的MySQL密碼
MYSQL_DATABASE=reloop

# 從 https://aistudio.google.com/app/apikey 取得
GEMINI_API_KEY=你的GeminiAPIKey
```

> `JWT_SECRET` 可用以下指令產生：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

### 5. 安裝套件並啟動

```bash
cd server
npm install
npm start          # 正式模式
# 或
npm run dev        # 開發模式（nodemon 自動重啟）
```

啟動成功：
```
reloop API server running on http://localhost:3000
```

驗證：
```bash
curl http://localhost:3000/health
# {"ok":true,"service":"reloop-api"}
```

前端與後端共用同一個 port，直接開啟 **http://localhost:3000** 即可。

---

## 手機測試（ngrok）

### 安裝 ngrok

```bash
# macOS
brew install ngrok

# Windows
winget install ngrok.ngrok
```

登入 [ngrok.com](https://ngrok.com) 取得 authtoken 後執行一次：

```bash
ngrok config add-authtoken 你的authtoken
```

### 啟動

確認後端已在 `localhost:3000` 運行，再開另一個終端機：

```bash
ngrok http 3000
```

複製顯示的 `https://xxxx.ngrok-free.app`，手機開啟即可。

> **注意**：ngrok free plan 每次重啟網址會更換；首次進入手機瀏覽器可能出現警告頁，點「Visit Site」繼續即可。

---

## API 文件

所有 🔒 標記的路由需在 Header 帶入：

```
Authorization: Bearer <token>
```

`token` 在登入或註冊回應中取得。

---

### 認證

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/register` | 註冊新帳號 |
| POST | `/api/auth/login` | 登入取得 JWT |
| GET  | `/api/me` 🔒 | 取得目前登入使用者 |

**註冊 Request Body**
```json
{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }
```

**登入 Response**
```json
{
  "user": { "id": 1, "name": "Alice", "carbon_coins": 120 },
  "token": "eyJhbGci..."
}
```

---

### 廢棄物品項

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/waste-types` | 取得所有可辨識品項 |

---

### 回收功能

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/classify` 🔒 | 上傳圖片，AI 辨識（不寫紀錄） |
| POST | `/api/records` 🔒 | 確認投入，寫入紀錄並計算點數 |
| GET  | `/api/records` 🔒 | 最近 50 筆回收紀錄 |

**`POST /api/classify`** — `multipart/form-data`，欄位名 `image`（最大 5MB）

```json
// Response 200
{ "itemId": "glass-bottle", "size": "中型", "cleanliness": "乾淨", "confidence": 0.95 }

// 錯誤
// 400: No image uploaded.
// 502: AI returned no text content. / AI returned invalid JSON. / AI returned unknown itemId.
```

**`POST /api/records` Request Body**
```json
{
  "itemId": "pet-bottle",
  "size": "中型",
  "cleanliness": "乾淨",
  "confidence": 0.94
}
```

**`POST /api/records` Response 201**
```json
{
  "recordId": 5,
  "name": "PET 寶特瓶",
  "bin": "塑膠回收桶",
  "points": 40,
  "carbonReducedKg": 0.05,
  "formula": { "basePoints": 40, "sizeMultiplier": 1, "cleanlinessMultiplier": 1 }
}
```

---

### 統計

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/summary` 🔒 | 碳幣、本月統計、最近紀錄（儀表板用） |
| GET | `/api/stats/items` 🔒 | 各品項累積回收筆數（掃描頁計量圖用） |

**`GET /api/stats/items` Response**
```json
{
  "items": [
    { "item_id": "pet-bottle",   "name": "PET 寶特瓶", "count": 5 },
    { "item_id": "aluminum-can", "name": "鋁罐",        "count": 3 }
  ]
}
```

---

### 獎品兌換

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/rewards` | 取得可兌換獎品清單 |
| POST | `/api/rewards/:id/redeem` 🔒 | 兌換指定獎品 |

```json
// POST /api/rewards/1/redeem — Response 200
{ "ok": true, "reward": "星巴克咖啡折抵券", "cost": 500 }

// 錯誤
// 400: Not enough carbon coins.
// 409: Reward is out of stock.
// 404: Reward not found.
```

---

## 碳幣點數計算規則

```
點數 = 基礎分 × 大小倍率 × 清潔度倍率
```

| 大小 | 倍率 |   | 清潔度 | 倍率 |
|------|------|---|--------|------|
| 小型 | 0.8  |   | 乾淨 | 1.0 |
| 中型 | 1.0  |   | 輕微殘留 | 0.7 |
| 大型 | 1.3  |   | 嚴重油污 | 0（不計分） |
|      |      |   | 不適用 | 0（不計分） |

| 品項 | 基礎分 | 每公斤減碳 |
|------|--------|-----------|
| PET 寶特瓶 | 40 | 1.700 kg CO₂ |
| 鋁罐 | 60 | 9.100 kg CO₂ |
| 紙板 | 25 | 0.900 kg CO₂ |
| 玻璃瓶 | 45 | 0.300 kg CO₂ |
| 有油污餐盒 | 25 | 0（不計分） |
| 一般垃圾 | 0 | 0（不計分） |

**範例**：鋁罐（小型 × 乾淨）→ `60 × 0.8 × 1.0 = 48 CCN`

---

## 執行測試

```bash
cd server
npm test
```

```
Tests: 16 passed, 16 total
```

涵蓋範圍：`/health`、`/api/auth/register`、`/api/auth/login`、`/api/classify`（含各錯誤路徑）、`/api/records`。

---

## 常見問題排除

**Q：啟動後端出現 `Access denied for user 'root'@'localhost'`**

`server/.env` 的 `MYSQL_PASSWORD` 與 MySQL 安裝時設定的密碼不符，請確認後重啟。

---

**Q：前端顯示「讀取後端失敗」或 `Failed to fetch`**

1. 確認後端正在 `localhost:3000` 執行
2. 不要用 `file://` 直接開啟 HTML，請透過 `http://localhost:3000`
3. 若使用 ngrok，手機需先點「Visit Site」通過警告頁

---

**Q：AI 辨識一直回傳 Server error**

檢查 `server/.env` 是否有正確填入 `GEMINI_API_KEY`。Key 從 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得。

---

**Q：ngrok URL 每次都不一樣**

ngrok 免費方案限制，每次重啟都會換網址。如需固定網址可升級 ngrok 付費方案，或使用 [Railway](https://railway.app) / [Render](https://render.com) 部署後端。

---

**Q：MySQL 重開機後服務沒自動啟動（Windows）**

```powershell
Set-Service -Name MySQL84 -StartupType Automatic
```
