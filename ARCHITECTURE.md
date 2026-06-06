# reloop 系統架構文件

> 本文件供非開發組員閱讀，說明 reloop 智慧回收平台的整體架構、技術選型與功能設計。

---

## 一、專案簡介

**reloop** 是一個智慧回收獎勵平台。使用者用手機拍攝回收物，系統透過 AI 自動辨識材質，依據大小與清潔度計算點數（碳幣 CCN），累積後可兌換獎品。

### 核心功能

| 功能 | 說明 |
|------|------|
| 帳號系統 | 註冊 / 登入，資料儲存於資料庫 |
| AI 拍照辨識 | 拍攝回收物 → Gemini AI 判斷材質、大小、清潔度 |
| 清單模式掃描 | 一次拍多件，最後統一確認投入 |
| 點數計算 | 依公式自動計算碳幣：基礎分 × 大小倍率 × 清潔度倍率 |
| 回收統計 | 儀表板顯示本月回收量、碳足跡、最近紀錄 |
| 品項計量圖 | 掃描頁顯示各類別累積回收筆數 |
| 獎品兌換 | 用碳幣兌換合作廠商獎勵 |

---

## 二、系統架構總覽

```
┌─────────────────────────────────────────────────────────┐
│                       使用者手機 / 瀏覽器                   │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │               前端 (Vanilla JS + CSS)             │   │
│   │                                                   │   │
│   │   index.html  ──  js/main.js (初始化入口)          │   │
│   │       │                                           │   │
│   │   js/api.js ─────── 統一管理所有 API 請求           │   │
│   │       │                                           │   │
│   │   js/pages/                                       │   │
│   │   ├── dashboard.js  (儀表板)                       │   │
│   │   ├── scan.js       (AI 掃描 + 清單)               │   │
│   │   ├── stats.js      (統計分析)                     │   │
│   │   └── rewards.js    (獎品兌換)                     │   │
│   └─────────────────────────────────────────────────┘   │
│                          │  HTTP / HTTPS                  │
└──────────────────────────┼──────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │             │
                    │  Express.js │  ← server/server.js
                    │  API Server │
                    │  Port 3000  │
                    │             │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼──────┐         ┌───────▼────────┐
       │             │         │                 │
       │   MySQL     │         │  Google Gemini  │
       │  資料庫      │         │   Vision AI     │
       │             │         │  (影像辨識)      │
       └─────────────┘         └─────────────────┘
```

### 資料流：拍照辨識

```
手機相機
   │ 拍照
   ▼
前端 scan.js
   │ 上傳圖片 (multipart/form-data)
   ▼
POST /api/classify
   │ 轉成 Base64
   ▼
Google Gemini 2.5 Flash
   │ 回傳 JSON：{itemId, size, cleanliness, confidence}
   ▼
記錄寫入 classification_logs
   │
   ▼
前端顯示辨識結果，加入掃描清單
   │ 使用者按「確認全部投入」
   ▼
POST /api/records（每件各一次）
   │ 計算點數、更新碳幣、寫入 recycle_records
   ▼
跳回儀表板，顯示最新點數
```

---

## 三、技術選型

### 前端

| 項目 | 技術 | 原因 |
|------|------|------|
| 框架 | 原生 HTML + Vanilla JS | 無需打包工具，可直接用 Live Server 開啟 |
| 樣式 | 原生 CSS（CSS Variables） | 支援深色模式切換，不依賴外部 UI 框架 |
| API 溝通 | `fetch()` | 瀏覽器內建，不需額外套件 |
| 字型 | Google Fonts（Syne, DM Sans） | 現代感設計字型 |

### 後端

| 項目 | 技術 | 原因 |
|------|------|------|
| 執行環境 | Node.js | JavaScript 全端統一 |
| 框架 | Express.js | 輕量、彈性高 |
| 資料庫 | MySQL 8 | 關聯式資料，適合記錄型數據 |
| ORM | mysql2（named placeholder） | 原生 SQL，效能佳 |
| 認證 | JWT（JSON Web Token） | 無狀態認證，適合前後端分離 |
| 密碼加密 | bcryptjs | 業界標準，不可逆雜湊 |
| 圖片上傳 | multer（memory storage） | 圖片不落地，直接送 AI |
| AI 辨識 | @google/genai v2.8（Gemini 2.5 Flash） | 高準確率影像辨識，支援繁中輸出 |
| 環境變數 | dotenv | 分離敏感設定與程式碼 |

### 開發工具

| 項目 | 工具 |
|------|------|
| 本機測試 | ngrok（將本機 server 暴露為公開 HTTPS，供手機測試） |
| 自動重啟 | nodemon |
| 單元/整合測試 | Jest + Supertest（16 項測試） |

---

## 四、目錄結構

```
reloop/
│
├── index.html                  # 主頁面（單頁應用入口）
│
├── css/
│   └── style.css               # 全站樣式，含深色模式、RWD
│
├── js/
│   ├── api.js                  # API 請求封裝、Session 管理
│   ├── app.js                  # 頁面路由、設定面板、主題切換
│   ├── auth.js                 # 登入/註冊切換邏輯
│   ├── main.js                 # DOM 初始化入口
│   └── pages/
│       ├── dashboard.js        # 儀表板：碳幣、本月統計、活動日誌
│       ├── scan.js             # AI 掃描：拍照、清單模式、品項計量圖
│       ├── stats.js            # 統計分析頁
│       └── rewards.js          # 獎品清單與兌換
│
├── server/
│   ├── server.js               # Express API Server（所有路由定義於此）
│   ├── db.js                   # MySQL 連線池設定
│   ├── .env                    # 環境變數（不進版控）
│   ├── .env.example            # 環境變數範本（新成員複製此檔）
│   ├── package.json            # Node.js 套件清單
│   └── __tests__/
│       └── server.test.js      # 自動化測試（Jest + Supertest）
│
├── sql/
│   └── schema.sql              # 資料庫建立腳本（首次部署執行一次）
│
├── .gitignore                  # 排除 node_modules、.env 等
├── ARCHITECTURE.md             # 本文件
└── README.md                   # 快速啟動說明
```

---

## 五、資料庫設計

### 資料表關係

```
users
  │
  ├── recycle_records (一對多)    ← 每筆回收紀錄
  ├── coin_transactions (一對多)  ← 碳幣異動明細（earn / redeem）
  └── classification_logs (一對多) ← AI 辨識紀錄（audit 用途）

waste_types                       ← 廢棄物主檔（6 種固定類型）
  └── recycle_records (一對多)

rewards                           ← 獎品主檔
```

### 各資料表說明

| 資料表 | 用途 |
|--------|------|
| `users` | 帳號資料、碳幣餘額 |
| `waste_types` | 廢棄物類型主檔（PET 寶特瓶、鋁罐…等 6 種） |
| `recycle_records` | 每筆回收紀錄，含材質、大小、清潔度、獲得點數 |
| `coin_transactions` | 碳幣所有異動（賺取 / 兌換）的流水帳 |
| `classification_logs` | AI 辨識的原始結果，供日後分析準確率 |
| `rewards` | 可兌換獎品清單，含庫存管理 |

### 點數計算公式

```
點數 = 基礎分 × 大小倍率 × 清潔度倍率

大小倍率：  小型 0.8 ／ 中型 1.0 ／ 大型 1.3
清潔度倍率：乾淨 1.0 ／ 輕微殘留 0.7 ／ 嚴重油污 0 ／ 不適用 0

範例：鋁罐（基礎分 60）× 小型（0.8）× 乾淨（1.0）= 48 CCN
```

---

## 六、API 端點一覽

> 所有 `/api/*` 路由需在 Header 帶入 `Authorization: Bearer <token>`（除 `/api/auth/*` 外）

### 認證

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/register` | 註冊新帳號 |
| POST | `/api/auth/login` | 登入取得 JWT |
| GET  | `/api/me` | 取得目前登入使用者資料 |

### 回收功能

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/classify` | 上傳圖片，AI 辨識回傳結果（不寫紀錄） |
| POST | `/api/records` | 確認投入，正式寫入回收紀錄並計算點數 |
| GET  | `/api/records` | 取得最近 50 筆回收紀錄 |
| GET  | `/api/waste-types` | 取得所有廢棄物類型 |

### 統計

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/summary` | 碳幣餘額、本月統計、最近紀錄（儀表板用） |
| GET | `/api/stats/items` | 各品項累積回收筆數（掃描頁計量圖用） |

### 獎品

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/api/rewards` | 取得可兌換獎品清單 |
| POST | `/api/rewards/:id/redeem` | 兌換指定獎品（含庫存與餘額檢查） |

---

## 七、環境建置流程（給開發組員）

### 需要安裝

- Node.js 18+
- MySQL 8.0+

### 步驟

```bash
# 1. 複製設定檔
cp server/.env.example server/.env
# 然後編輯 server/.env，填入資料庫密碼與 Gemini API Key

# 2. 建立資料庫
mysql -u root -p < sql/schema.sql

# 3. 安裝套件
cd server && npm install

# 4. 啟動伺服器
npm run dev        # 開發模式（nodemon 自動重啟）
# 或
npm start          # 正式模式

# 5. 執行測試
npm test
```

### 取得 Gemini API Key

1. 前往 https://aistudio.google.com/app/apikey
2. 點「Create API key」
3. 複製後貼到 `server/.env` 的 `GEMINI_API_KEY=` 後面

### 手機測試（ngrok）

```bash
# 終端機 1：啟動 server
cd server && node server.js

# 終端機 2：開 ngrok
ngrok http 3000
# → 複製顯示的 https://xxxx.ngrok-free.app 網址，手機開啟即可
```

---

## 八、安全性設計

| 項目 | 做法 |
|------|------|
| 密碼儲存 | bcrypt 單向雜湊，資料庫不存明文 |
| API 認證 | JWT，有效期 7 天，前端每次請求帶入 |
| SQL 注入防護 | mysql2 named placeholder，不拼接字串 |
| 圖片限制 | 僅接受 image/* MIME type，最大 5MB |
| 敏感設定 | .env 不進版控（已加入 .gitignore） |
| 兌換防競爭 | 使用 `FOR UPDATE` 鎖定資料列，交易內處理 |

---

## 九、目前已知限制

| 項目 | 說明 |
|------|------|
| AI 計數 | 辨識品項類別可靠，但無法可靠偵測數量 |
| 離線使用 | 需要網路連線（AI 辨識與資料同步） |
| ngrok 網址 | free plan 每次重啟網址會更換 |
| Gemini 配額 | 免費額度有限，大量使用需升級方案 |
