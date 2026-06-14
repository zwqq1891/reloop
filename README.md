# ♻ reloop — 智慧回收平台

> 利用 AI 影像辨識與碳幣激勵系統，讓回收變成一種無限循環的美學。

---

## 目錄

- [功能總覽](#功能總覽)
- [技術架構](#技術架構)
- [專案結構](#專案結構)
- [環境需求](#環境需求)
- [本地端完整安裝步驟](#本地端完整安裝步驟)
  - [1. 取得專案](#1-取得專案)
  - [2. 安裝 MySQL](#2-安裝-mysql)
  - [3. 建立資料庫](#3-建立資料庫)
  - [4. 設定環境變數](#4-設定環境變數)
  - [5. 安裝後端依賴並啟動](#5-安裝後端依賴並啟動)
  - [6. 啟動前端](#6-啟動前端)
- [手機 / 行動端使用（ngrok）](#手機--行動端使用ngrok)
- [API 文件](#api-文件)
- [碳幣點數計算規則](#碳幣點數計算規則)
- [常見問題排除](#常見問題排除)

---

## 功能總覽

| 功能 | 說明 |
|---|---|
| **帳號系統** | 註冊 / 登入，JWT 無狀態驗證，7 天有效期 |
| **AI 掃描辨識** | 開啟相機辨識廢棄物品項，Gemini 2.5 Flash 自動判斷材質、大小、清潔度 |
| **清單掃描模式** | 多張照片批次辨識，一次提交多筆回收紀錄 |
| **自動辨識模式** | 每 3 秒自動掃描一次，適合高頻回收場景 |
| **碳幣獎勵** | 每次回收依公式計算碳幣（CCN），累積後可兌換獎品 |
| **回收統計** | 本月回收重量、碳足跡減少量、各品項累積計量圖 |
| **獎勵中心** | 用碳幣兌換星巴克券、環保袋、共享單車月票等 |
| **虛擬植樹遊戲** | 以碳幣澆水、施肥養成虛擬樹木（種子→幼苗→小樹→成樹） |
| **台灣碳匯地圖** | 成樹後可選擇移栽至北部／中部／南部／東部，純 SVG 地圖呈現各區綠化成果 |
| **深色模式** | 支援淺色 / 深色主題切換 |
| **行動端支援** | RWD 響應式設計，底部導覽列，適配手機操作 |

---

## 技術架構

```
前端                    後端                    資料庫
─────────────────       ─────────────────       ─────────────
HTML + CSS + JS         Node.js + Express       MySQL 8.x
原生 Vanilla JS         JWT 驗證                8 張資料表
響應式 RWD 設計          bcryptjs 加密            完整外鍵約束
純 SVG 台灣地圖          multer 圖片上傳
無任何前端框架           Gemini 2.5 Flash AI
```

**後端依賴套件**：`express` `cors` `bcryptjs` `jsonwebtoken` `multer` `mysql2` `dotenv` `@google/genai`

---

## 專案結構

```
reloop/
├── index.html              # 前端入口
├── css/
│   └── style.css           # 全部樣式（含 RWD、深色模式）
├── js/
│   ├── api.js              # fetch 封裝、session 管理
│   ├── auth.js             # 登入/註冊表單切換
│   ├── app.js              # 路由、主題、設定面板
│   ├── main.js             # DOMContentLoaded 初始化
│   └── pages/
│       ├── dashboard.js    # 控制主頁
│       ├── scan.js         # AI 掃描辨識頁
│       ├── stats.js        # 回收統計趨勢頁
│       ├── rewards.js      # 獎勵中心頁
│       └── game.js         # 虛擬植樹遊戲（含台灣 SVG 地圖）
├── server/
│   ├── server.js           # Express 主程式，所有 API 路由
│   ├── db.js               # MySQL 連線池
│   ├── .env                # 環境變數（自行建立，不進 git）
│   ├── .env.example        # 環境變數範本
│   └── package.json
└── sql/
    ├── schema.sql          # 資料庫基礎結構 + 初始資料
    └── eco_tree_game.sql   # 虛擬植樹遊戲擴充資料表
```

---

## 環境需求

| 工具 | 最低版本 | 用途 |
|---|---|---|
| Node.js | 18+ | 執行後端 |
| MySQL | 8.0+ | 資料儲存 |
| ngrok（選用） | 3.x | 手機 / 外部存取 |

---

## 本地端完整安裝步驟

### 1. 取得專案

```bash
git clone https://github.com/zwqq1891/reloop.git
cd reloop
```

---

### 2. 安裝 MySQL

#### Windows（使用 winget）

以**系統管理員身分**開啟 PowerShell，執行：

```powershell
# 安裝 MySQL 8.4
winget install Oracle.MySQL --accept-package-agreements --accept-source-agreements

# 初始化資料目錄（會在輸出中顯示臨時密碼，請複製保存）
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --initialize --console

# 安裝並啟動 Windows 服務
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --install MySQL84
Start-Service MySQL84
```

輸出中找到這一行，複製臨時密碼：
```
A temporary password is generated for root@localhost: xxxxxxxx
```

接著修改 root 密碼（將 `臨時密碼` 和 `你的新密碼` 替換為實際值）：

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p"臨時密碼" --connect-expired-password -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密碼';"
```

#### macOS（使用 Homebrew）

```bash
brew install mysql
brew services start mysql
mysql_secure_installation   # 依提示設定 root 密碼
```

#### Linux（Ubuntu / Debian）

```bash
sudo apt update && sudo apt install mysql-server -y
sudo systemctl start mysql
sudo mysql_secure_installation
```

---

### 3. 建立資料庫

依序匯入兩個 SQL 檔案：

#### Windows

```powershell
$env:PATH += ";C:\Program Files\MySQL\MySQL Server 8.4\bin"

# 建立資料庫
mysql -u root -p"你的密碼" -e "CREATE DATABASE IF NOT EXISTS reloop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 匯入基礎結構
Get-Content "sql\schema.sql" | mysql -u root -p"你的密碼" reloop

# 匯入虛擬植樹遊戲擴充資料表
Get-Content "sql\eco_tree_game.sql" | mysql -u root -p"你的密碼" reloop
```

#### macOS / Linux

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS reloop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p reloop < sql/schema.sql
mysql -u root -p reloop < sql/eco_tree_game.sql
```

匯入完成後會建立以下資料表：

| 資料表 | 說明 |
|---|---|
| `users` | 使用者帳號與碳幣餘額 |
| `waste_types` | 6 種廢棄物標準 |
| `recycle_records` | 回收紀錄 |
| `coin_transactions` | 碳幣交易明細 |
| `rewards` | 6 項兌換獎品 |
| `classification_logs` | AI 辨識日誌 |
| `user_game_status` | 玩家樹木養成狀態 |
| `game_action_logs` | 遊戲動作紀錄（含種植區域） |

> **注意**：`eco_tree_game.sql` 必須在 `schema.sql` 之後執行。伺服器啟動時會自動對 `game_action_logs` 執行安全的 schema 遷移，無需手動維護欄位版本。

---

### 4. 設定環境變數

複製範本並填入你的設定：

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server\.env.example server\.env
```

用編輯器打開 `server/.env`，修改以下欄位：

```env
PORT=3000
JWT_SECRET=請替換成一組長的隨機字串

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的MySQL密碼
MYSQL_DATABASE=reloop

GEMINI_API_KEY=你的Gemini_API_Key
```

> `JWT_SECRET` 建議使用 32 字元以上的隨機字串，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 產生。
>
> `GEMINI_API_KEY` 至 [Google AI Studio](https://aistudio.google.com/app/apikey) 免費取得。

---

### 5. 安裝後端依賴並啟動

```bash
cd server
npm install
npm start
```

啟動成功後會看到：
```
reloop API server running on http://localhost:3000
```

驗證後端是否正常：

```bash
curl http://localhost:3000/health
# 回傳：{"ok":true,"service":"reloop-api"}
```

---

### 6. 啟動前端

後端已內建靜態檔案服務，直接瀏覽 **http://localhost:3000** 即可同時使用前端與 API。

> 請勿直接雙擊 `index.html` 開啟（`file://` 協定會被瀏覽器 CORS 政策封鎖）。

---

## 手機 / 行動端使用（ngrok）

ngrok 可以將本機後端暴露到公開 HTTPS URL，讓同一網路或任何設備都能連線。

### 安裝 ngrok

前往 [ngrok.com](https://ngrok.com) 註冊免費帳號並下載，或：

```bash
# macOS
brew install ngrok

# Windows（winget）
winget install ngrok.ngrok
```

登入並設定 authtoken（一次性，從 ngrok dashboard 取得）：

```bash
ngrok config add-authtoken 你的authtoken
```

### 啟動 ngrok 隧道

確保後端已在 `localhost:3000` 運行，然後：

```bash
ngrok http 3000
```

畫面會顯示類似：
```
Forwarding   https://xxxx-xxxx.ngrok-free.app -> http://localhost:3000
```

### 手機操作步驟

1. 用手機瀏覽器開啟 ngrok 給的 `https://xxxx.ngrok-free.app`
2. 首次進入會看到 **ngrok 警告頁** — 點選 **「Visit Site」** 繼續
3. 看到 reloop 登入畫面即成功
4. 在手機上**註冊帳號**或**登入**後即可使用所有功能

> **注意**：ngrok free tier 每次重啟都會產生新的 URL，需重新分享給設備。如需固定網址，可升級 ngrok 付費方案或使用 Railway / Render 部署後端。

---

## API 文件

所有需要登入的 API 須在 Header 帶上：
```
Authorization: Bearer <token>
```
`token` 在登入或註冊成功後的回應中取得。

---

### 認證

#### `POST /api/auth/register` — 註冊

```json
// Request Body
{ "name": "Ricky Chen", "email": "ricky@example.com", "password": "mypassword" }

// Response 201
{ "user": { "id": 1, "name": "Ricky Chen", "email": "...", "carbon_coins": 0 }, "token": "eyJ..." }
```

#### `POST /api/auth/login` — 登入

```json
// Request Body
{ "email": "ricky@example.com", "password": "mypassword" }

// Response 200
{ "user": { "id": 1, "name": "Ricky Chen", "carbon_coins": 120 }, "token": "eyJ..." }
```

#### `GET /api/me` — 取得目前使用者資料 🔒

```json
// Response 200
{ "user": { "id": 1, "name": "Ricky Chen", "email": "...", "carbon_coins": 120, "created_at": "..." } }
```

---

### 回收紀錄

#### `GET /api/summary` — 本月回收摘要 🔒

```json
// Response 200
{
  "carbonCoins": 120,
  "monthlyRecycledKg": 0.45,
  "monthlyCarbonReducedKg": 0.84,
  "monthlyRecords": 3,
  "recentRecords": [
    { "item_name": "PET 寶特瓶", "material": "塑膠類", "points_earned": 40, "carbon_reduced_kg": 0.05, "created_at": "..." }
  ]
}
```

#### `GET /api/records` — 歷史回收紀錄（最近 50 筆）🔒

```json
// Response 200
{
  "records": [
    { "id": 1, "item_name": "鋁罐", "size": "小型", "cleanliness": "乾淨",
      "weight_kg": 0.015, "points_earned": 48, "carbon_reduced_kg": 0.14, "created_at": "..." }
  ]
}
```

#### `POST /api/records` — 新增回收紀錄 🔒

```json
// Request Body
{
  "itemId": "pet-bottle",   // pet-bottle | aluminum-can | cardboard | glass-bottle | oily-lunchbox | general-waste
  "size": "中型",            // 小型 | 中型 | 大型（預設中型）
  "cleanliness": "乾淨",     // 乾淨 | 輕微殘留 | 嚴重油污 | 不適用（預設乾淨）
  "weightKg": 0.03,         // 選填，未填則使用品項預設重量
  "confidence": 0.94        // 選填，AI 辨識信心分數
}

// Response 201
{
  "recordId": 5, "name": "PET 寶特瓶", "bin": "塑膠回收桶",
  "points": 40, "carbonReducedKg": 0.05,
  "formula": { "basePoints": 40, "sizeMultiplier": 1, "cleanlinessMultiplier": 1 }
}
```

---

### AI 辨識

#### `POST /api/classify` — 上傳圖片進行 Gemini AI 辨識 🔒

```
Content-Type: multipart/form-data
欄位名稱: image（圖片檔，最大 5MB）
```

```json
// Response 200
{ "itemId": "aluminum-can", "size": "小型", "cleanliness": "乾淨", "confidence": 0.95 }
```

辨識完成後，將結果帶入 `POST /api/records` 即可寫入回收紀錄並獲得碳幣。

---

### 獎勵兌換

#### `GET /api/rewards` — 取得所有獎勵商品

```json
// Response 200
{ "rewards": [{ "id": 1, "name": "星巴克咖啡折抵券", "cost": 500, "stock": 50 }] }
```

#### `POST /api/rewards/:id/redeem` — 兌換獎品 🔒

```json
// Response 200
{ "ok": true, "reward": "星巴克咖啡折抵券", "cost": 500 }
// 400: Not enough carbon coins. | 409: Reward is out of stock.
```

---

### 虛擬植樹遊戲

#### `GET /api/game/status` — 取得玩家樹木狀態 🔒

```json
// Response 200
{
  "tree": {
    "name": "我的小樹", "level": 2,
    "currentExp": 145, "expForCurrentLevel": 100, "expForNextLevel": 300,
    "harvestedCount": 1, "canHarvest": false
  },
  "wallet": { "carbonCoins": 280 },
  "globalStats": { "totalMatureTrees": 42, "totalPlayers": 18, "co2AbsorbedKg": 911.4 }
}
```

#### `POST /api/game/action` — 執行遊戲動作 🔒

| 動作 | 費用 | EXP | 說明 |
|---|---|---|---|
| `water` | 10 CCN | +15 | 澆水 |
| `fertilize` | 30 CCN | +50 | 施肥 |
| `harvest` | 0 CCN | — | 成樹（Lv.4）移栽，需指定 `region` |

```json
// Request Body（澆水 / 施肥）
{ "action": "water" }

// Request Body（移栽，必填 region）
{ "action": "harvest", "region": "north" }
// region 可選：north（北部）| central（中部）| south（南部）| east（東部）

// Response 200
{
  "ok": true, "action": "harvest",
  "harvested": true, "region": "north", "regionName": "北部",
  "tree": { "level": 1, "currentExp": 0, "harvestedCount": 2, "canHarvest": false },
  "wallet": { "carbonCoins": 280 }
}
```

**EXP 升級門檻**：Lv.1 = 0 EXP｜Lv.2 = 100 EXP｜Lv.3 = 300 EXP｜Lv.4（成樹）= 600 EXP

#### `GET /api/game/map` — 取得台灣各區種植數量

```json
// Response 200（無需登入）
{ "regions": { "north": 18, "central": 7, "south": 12, "east": 5 } }
```

前端據此渲染純 SVG 台灣地圖，各區顏色深淺反映累積種植量。

---

### 統計

#### `GET /api/stats/items` — 各品項回收次數 🔒

```json
// Response 200
{ "items": [{ "item_id": "pet-bottle", "name": "PET 寶特瓶", "count": 12 }] }
```

---

## 碳幣點數計算規則

```
點數 = 基礎分 × 大小倍率 × 清潔度倍率
```

**大小倍率**

| 大小 | 倍率 |
|---|---|
| 小型 | 0.8 |
| 中型 | 1.0 |
| 大型 | 1.3 |

**清潔度倍率**

| 清潔度 | 倍率 |
|---|---|
| 乾淨 | 1.0 |
| 輕微殘留 | 0.7 |
| 嚴重油污 | 0（不計分） |
| 不適用 | 0（不計分） |

**各品項基礎分**

| 品項 | 基礎分 | 每公斤減碳量 |
|---|---|---|
| PET 寶特瓶 | 40 | 1.700 kg CO₂ |
| 鋁罐 | 60 | 9.100 kg CO₂ |
| 紙板 | 25 | 0.900 kg CO₂ |
| 玻璃瓶 | 45 | 0.300 kg CO₂ |
| 有油污餐盒 | 25 | 0（不計分） |
| 一般垃圾 | 0 | 0（不計分） |

**範例**：鋁罐（小型 × 乾淨）→ `60 × 0.8 × 1.0 = 48 CCN`

---

## 常見問題排除

**Q：啟動後端出現 `Error: Access denied for user 'root'@'localhost'`**

MySQL 密碼不正確，請確認 `server/.env` 中的 `MYSQL_PASSWORD` 與安裝時設定的密碼相符。

---

**Q：前端顯示「讀取後端失敗」或「fail to fetch」**

1. 確認後端已在 `localhost:3000` 運行（`curl http://localhost:3000/health`）
2. 確認前端不是用 `file://` 開啟（請使用 http server）
3. 若透過 ngrok 存取，請確認已點過警告頁的「Visit Site」

---

**Q：AI 掃描回傳錯誤**

確認 `server/.env` 中的 `GEMINI_API_KEY` 已正確設定，並確保帳號有足夠的 API 配額。

---

**Q：手機連線後所有 API 回傳錯誤**

ngrok free tier 首次存取有攔截頁，需在手機瀏覽器先點「Visit Site」通過後，再重新整理頁面即可。

---

**Q：ngrok URL 每次都不一樣**

這是 ngrok 免費方案的限制，每次重啟 ngrok 都會換網址。固定網址需升級付費方案，或改用 [Railway](https://railway.app) / [Render](https://render.com) 部署後端。

---

**Q：MySQL 服務重開機後沒有自動啟動**

Windows PowerShell（管理員）：
```powershell
Set-Service -Name MySQL84 -StartupType Automatic
```

---

**Q：忘記 MySQL root 密碼**

停止服務後以 `--skip-grant-tables` 模式啟動，重設密碼後再正常啟動。詳見 [MySQL 官方文件](https://dev.mysql.com/doc/refman/8.4/en/resetting-permissions.html)。
