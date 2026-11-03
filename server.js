require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';

const menuFilePath = path.join(__dirname, 'menu.json');
const settingFilePath = path.join(__dirname, 'setting.json');
const ordersFilePath = path.join(__dirname, 'orders.json');
const uploadDir = path.join(__dirname, 'public', 'menu_images');

// 安全寫入 JSON 工具（先寫入暫存檔再重命名，避免併發時檔案損毀）
function safeWriteJsonSync(filePath, data) {
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

// 安全讀取 JSON 工具
function readJsonSafe(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`讀取檔案 ${filePath} 失敗:`, err);
  }
  return defaultValue;
}

// 初始化必要目錄與設定檔案
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(settingFilePath)) {
  safeWriteJsonSync(settingFilePath, { canSubmitOrder: true, maxTableOrderTotal: 0 });
}
if (!fs.existsSync(ordersFilePath)) {
  safeWriteJsonSync(ordersFilePath, []);
}

// HTTP Basic 認證中間件（保護廚房與管理端）
const authMiddleware = (req, res, next) => {
  if (DISABLE_AUTH) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Authentication required (Default: admin / admin123)');
  }

  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Basic' || !credentials) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Invalid authorization format');
  }

  const [user, pass] = Buffer.from(credentials, 'base64').toString().split(':');
  if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
  return res.status(401).send('Unauthorized: Invalid credentials');
};

// 配置圖片上傳 Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, 'menu_' + uniqueSuffix);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 限制 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error('只允許上傳圖片檔案 (jpg, png, webp, gif)'));
  }
});

// 解析中繼軟體
app.use(express.json());

// 保護管理與廚房相關頁面及 API
app.use(['/admin.html', '/kitchen.html', '/update-menu', '/chef', '/update-submit-status', '/kitchen-orders', '/api/upload-image'], authMiddleware);

// 靜態資源託管
app.use(express.static('public'));

// 動態路由：顧客端首頁（直接回應點餐頁面，不進行重導向）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 支援純數字桌號路徑（例如 http://localhost:3000/12）
app.get('/:tableNumber(\\d+)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 向下相容 /index.html 與 /index.html/:tableNumber
app.get(['/index.html', '/index.html/:tableNumber'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/user-order-status.html/:tableNumber', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-order-status.html'));
});

// API 端點：取得菜單
app.get('/menu', (req, res) => {
  try {
    if (!fs.existsSync(menuFilePath)) {
      const defaultMenu = [
        {
          category: "燒烤時蔬",
          items: [
            { name: "黃金泡菜", price: 80, status: "有" },
            { name: "秘料烤洋芋", price: 80, status: "有" }
          ]
        }
      ];
      safeWriteJsonSync(menuFilePath, defaultMenu);
    }

    const menu = readJsonSafe(menuFilePath, []);
    res.json(menu);
  } catch (error) {
    console.error('讀取菜單失敗：', error);
    res.status(500).json({ 
      message: '無法讀取菜單資料',
      error: error.message 
    });
  }
});

// API 端點：更新菜單（受認證保護）
app.post('/update-menu', (req, res) => {
  try {
    const updatedMenu = req.body;

    if (!Array.isArray(updatedMenu)) {
      return res.status(400).json({ message: '菜單資料格式不正確，應為陣列' });
    }

    for (const category of updatedMenu) {
      if (!category.category || !Array.isArray(category.items)) {
        return res.status(400).json({ message: '菜單類別格式不正確' });
      }

      for (const item of category.items) {
        if (!item.name || typeof item.price !== 'number' || item.price < 0) {
          return res.status(400).json({ message: `菜單項目格式不正確: ${item.name || '未命名'}` });
        }
        if (!['有', '無'].includes(item.status)) {
          item.status = '有';
        }
      }
    }

    safeWriteJsonSync(menuFilePath, updatedMenu);
    res.json({ 
      message: '菜單更新成功！', 
      menu: updatedMenu 
    });
  } catch (error) {
    console.error('更新菜單失敗：', error);
    res.status(500).json({ 
      message: '更新菜單失敗',
      error: error.message 
    });
  }
});

// API 端點：圖片上傳（受認證保護）
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '請選擇要上傳的圖片檔案' });
  }
  res.json({
    message: '圖片上傳成功',
    imageUrl: `/menu_images/${req.file.filename}`
  });
});

// API 端點：顧客提交訂單（嚴格校驗價格防篡改）
app.post('/submit-order', (req, res) => {
  try {
    // 1. 檢查是否允許提交訂單
    const settings = readJsonSafe(settingFilePath, { canSubmitOrder: true, maxTableOrderTotal: 0 });
    if (!settings.canSubmitOrder) {
      return res.status(403).json({ message: '目前店家已暫停點餐，請稍後或聯繫現場服務人員。' });
    }

    const tableNumber = parseInt(req.body.tableNumber, 10);
    const { orders } = req.body;

    if (!tableNumber || isNaN(tableNumber) || tableNumber <= 0) {
      return res.status(400).json({ message: '無效的桌號' });
    }

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ message: '訂單內容不可為空' });
    }

    // 2. 建立菜單對照表校驗價格與上架狀態，防止客戶端自行修改價格
    const menuData = readJsonSafe(menuFilePath, []);
    const menuMap = new Map();
    for (const cat of menuData) {
      for (const item of (cat.items || [])) {
        menuMap.set(item.name, item);
      }
    }

    const validatedOrders = [];
    for (const item of orders) {
      const quantity = parseInt(item.quantity, 10);
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ message: `品項 "${item.name}" 的數量必須大於 0` });
      }

      const menuItem = menuMap.get(item.name);
      if (!menuItem) {
        return res.status(400).json({ message: `品項 "${item.name}" 不存在於菜單中` });
      }

      if (menuItem.status === '無') {
        return res.status(400).json({ message: `品項 "${item.name}" 目前已售完下架` });
      }

      // 強制使用伺服器端定義的菜單價格
      validatedOrders.push({
        name: menuItem.name,
        quantity: quantity,
        price: menuItem.price
      });
    }

    // 伺服器端計算真實總金額
    const newOrderTotal = validatedOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // 3. 檢查每桌金額上限（若設定大於 0 則啟用）
    const maxLimit = settings.maxTableOrderTotal || parseInt(process.env.MAX_TABLE_ORDER_TOTAL || '0', 10);
    const ordersData = readJsonSafe(ordersFilePath, []);

    if (maxLimit > 0) {
      // 僅計算尚未取消的訂單
      const currentTableTotal = ordersData
        .filter(order => parseInt(order.tableNumber, 10) === tableNumber && order.status !== 'cancelled')
        .reduce((sum, order) => sum + (order.total || 0), 0);

      if (currentTableTotal + newOrderTotal > maxLimit) {
        return res.status(400).json({
          message: `超過桌號 ${tableNumber} 的點餐上限 ${maxLimit} 元。當前累積 ${currentTableTotal} 元，本次新增 ${newOrderTotal} 元。`
        });
      }
    }

    // 4. 生成唯一訂單 ID 並儲存
    const orderId = ordersData.length > 0 ? Math.max(...ordersData.map(o => o.id || 0)) + 1 : 1;
    const newOrder = {
      id: orderId,
      tableNumber,
      orders: validatedOrders,
      total: newOrderTotal,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    ordersData.push(newOrder);
    safeWriteJsonSync(ordersFilePath, ordersData);

    res.json({ message: '訂單提交成功', orderId, total: newOrderTotal });
  } catch (error) {
    console.error('訂單提交失敗：', error);
    res.status(500).json({ message: '訂單提交失敗，請稍後再試', error: error.message });
  }
});

// API 端點：取得所有訂單（廚房看板，受認證保護）
app.get('/kitchen-orders', (req, res) => {
  const ordersData = readJsonSafe(ordersFilePath, []);
  res.json(ordersData);
});

// API 端點：廚房完成訂單（受認證保護）
app.post('/chef/complete-order/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ordersData = readJsonSafe(ordersFilePath, []);
  const orderIndex = ordersData.findIndex(order => parseInt(order.id, 10) === id);

  if (orderIndex === -1) {
    return res.status(404).json({ message: '找不到該訂單' });
  }

  ordersData[orderIndex].status = 'completed';
  safeWriteJsonSync(ordersFilePath, ordersData);
  res.json({ message: '訂單已標示為完成' });
});

// API 端點：廚房刪除訂單（受認證保護）
app.delete('/chef/delete-order/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ordersData = readJsonSafe(ordersFilePath, []);
  const orderIndex = ordersData.findIndex(order => parseInt(order.id, 10) === id);

  if (orderIndex === -1) {
    return res.status(404).json({ message: '找不到該訂單' });
  }

  ordersData.splice(orderIndex, 1);
  safeWriteJsonSync(ordersFilePath, ordersData);
  res.json({ message: '訂單已刪除' });
});

// API 端點：顧客查看自身桌號訂單狀態
app.get('/user/orders/:tableNumber', (req, res) => {
  const tableNumber = parseInt(req.params.tableNumber, 10);
  const ordersData = readJsonSafe(ordersFilePath, []);
  const userOrders = ordersData.filter(order => parseInt(order.tableNumber, 10) === tableNumber);
  res.json(userOrders);
});

// API 端點：更新系統設定（受認證保護）
app.post('/update-submit-status', (req, res) => {
  const { canSubmitOrder, maxTableOrderTotal } = req.body;
  const settings = readJsonSafe(settingFilePath, { canSubmitOrder: true, maxTableOrderTotal: 0 });

  if (typeof canSubmitOrder === 'boolean') {
    settings.canSubmitOrder = canSubmitOrder;
  }
  if (typeof maxTableOrderTotal === 'number') {
    settings.maxTableOrderTotal = maxTableOrderTotal;
  }

  safeWriteJsonSync(settingFilePath, settings);
  res.json({ message: '系統設定已更新', settings });
});

// API 端點：取得目前系統設定（公開供前端判斷點餐按鈕狀態）
app.get('/get-submit-status', (req, res) => {
  const settings = readJsonSafe(settingFilePath, { canSubmitOrder: true, maxTableOrderTotal: 0 });
  res.json(settings);
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` 🍽️  點餐系統伺服器已啟動`);
  console.log(` 顧客點餐頁面: http://localhost:${PORT}`);
  console.log(` 廚房出餐看板: http://localhost:${PORT}/kitchen.html`);
  console.log(` 菜單管理後台: http://localhost:${PORT}/admin.html`);
  if (!DISABLE_AUTH) {
    console.log(` 預設後台帳號: ${ADMIN_USERNAME} / 密碼: ${ADMIN_PASSWORD}`);
  } else {
    console.log(` ⚠️ 後台身份認證目前處於停用狀態 (DISABLE_AUTH=true)`);
  }
  console.log(`===============================================`);
});
