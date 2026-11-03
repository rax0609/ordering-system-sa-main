# 🍽️ 輕量級內用掃碼點餐與廚房出餐系統 (Simple Table Ordering System)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)

一個輕量、無需外部資料庫、開箱即用的餐廳／活動內用桌號點餐與廚房管理系統。最初為學生會迎新聚餐活動設計，現已通用化並開源給餐飲店家、活動展覽、社團辦桌或校園專案使用。

---

## ✨ 功能特色

* 📱 **顧客手機掃碼點餐**：支援直接訪問首頁（`/`）或透過網址直接帶入桌號（例如 `/:桌號` 或 `?table=:桌號`），顧客免裝 App 即可瀏覽菜單並下單。
* 📋 **訂單狀態即時追蹤**：顧客可隨時查看目前桌號所有訂單的出餐進度（待出餐、已完成）。
* 👨‍🍳 **廚房出餐看板（KDS）**：
  * 待處理與已完成分欄展示，清晰掌握餐點出單順序。
  * 支援一鍵將訂單標記為「完成」或「刪除」。
  * 具備「全場暫停點餐 / 開放點餐」即時開關。
* 📝 **菜單管理後台**：管理者可快速將特定菜品標示為「上架」或「售完下架」，即時同步至顧客端。
* 🛡️ **安全價格防篡改**：所有訂單總金額均由後端依據官方菜單進行校驗重算，杜絕前端改價漏洞。
* 🔐 **後台權限保護**：廚房看板與菜單後台內建 HTTP Basic 認證，防止顧客誤入操作。
* ⚙️ **靈活金額上限設定**：支援自訂每桌累積點餐金額上限（設為 `0` 則不設限）。
* 🚀 **零資料庫安裝門檻**：基於 JSON 檔案持久化與原子寫入（Atomic Write）機制，克隆後即可立即運行。

---

## 🖥️ 系統頁面路由一覽

| 頁面角色 | 訪問路徑 | 說明 | 存取權限 |
| :--- | :--- | :--- | :--- |
| **顧客點餐** | `http://localhost:3000/` 或 `http://localhost:3000/:桌號` | 瀏覽菜單、選擇數量並提交訂單 | 公開 |
| **顧客訂單進度** | `http://localhost:3000/user-order-status.html/:桌號` | 查看該桌點餐歷史與廚房製作狀態 | 公開 |
| **廚房出餐看板** | `http://localhost:3000/kitchen.html` | 廚房接單、備餐、完成訂單與點餐開關 | 需管理者認證 |
| **菜單管理後台** | `http://localhost:3000/admin.html` | 菜品狀態切換（上架／下架） | 需管理者認證 |

> 預設管理者帳號：`admin`  
> 預設管理者密碼：`admin123`（可在 `.env` 中自訂）

---

## 🚀 快速開始

### 1. 環境需求
* [Node.js](https://nodejs.org/) v18.0.0 以上
* npm 或 yarn

### 2. 安裝步驟

```bash
# 1. 複製專案
git clone https://github.com/your-username/simple-ordering-system.git
cd simple-ordering-system

# 2. 安裝依賴
npm install

# 3. 複製環境變數設定檔（可依需求修改連接埠與管理者密碼）
cp .env.example .env

# 4. 啟動伺服器
npm start
```

若需支援熱重載（開發模式）：
```bash
npm run dev
```

伺服器啟動成功後，打開瀏覽器造訪 `http://localhost:3000` 即可開始使用！

---

## ⚙️ 環境變數設定 (`.env`)

複製 `.env.example` 為 `.env`，可設定以下參數：

```env
# 服務運行埠號
PORT=3000

# 後台與廚房看板登入驗證（HTTP Basic Auth）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 每桌累積點餐金額上限（單位：元，設為 0 代表無上限）
MAX_TABLE_ORDER_TOTAL=0

# 本地測試時若欲關閉後台密碼驗證可設為 true（生產環境請務必保持 false）
DISABLE_AUTH=false
```

---

## 📂 專案檔案架構

```text
simple-ordering-system/
├── public/
│   ├── index.html               # 顧客點餐前端主頁
│   ├── user-order-status.html   # 顧客端訂單狀態頁
│   ├── kitchen.html             # 廚房端即時看板
│   ├── admin.html               # 菜單管理員後台
│   ├── hero-banner.jpg          # 點餐頁首頁橫幅圖片
│   └── menu_images/             # 上傳圖片存放資料夾
├── menu.json                    # 菜單資料庫（包含分類、價格、上下架狀態）
├── setting.json                 # 系統開關與運行設定
├── orders.sample.json           # 訂單資料格式範例
├── orders.json                  # 即時訂單資料庫（已被 .gitignore 排除）
├── server.js                    # Express 後端核心伺服器
├── .env.example                 # 環境變數範本
├── .gitignore                   # Git 版本控制忽略清單
├── package.json                 # 專案套件配置
└── LICENSE                      # MIT 開源授權條款
```

---

## 💡 客製化指南

1. **更換首頁橫幅圖片**：直接將自訂的宣傳圖片覆蓋至 `public/hero-banner.jpg`。
2. **修改初始菜單**：編輯 `menu.json`，可新增分類與菜品（支援 `name`、`price`、`status`）。
3. **桌號 QR Code 生成**：可將 `http://你的網域名稱/<桌號>`（例如 `http://192.168.1.100:3000/5`）轉換為 QR Code 貼在對應餐桌上，客人掃碼即自動進入該桌點餐頁面。

---

## 📄 開源授權

本專案採用 [MIT License](LICENSE) 授權開放使用。歡迎 Fork、提交 Issue 或發起 Pull Request 共同改進！

