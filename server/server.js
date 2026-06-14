const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { GoogleGenAI } = require('@google/genai');
const pool = require('./db');

// Auto-migrate: add region column to game_action_logs (safe to re-run)
Promise.resolve(
  pool.execute(`ALTER TABLE game_action_logs ADD COLUMN region ENUM('north','central','south','east') NULL`)
).catch(e => {
  if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('[migrate] region column:', e.message);
});

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CLASSIFY_PROMPT = `你是一個廢棄物辨識 AI。請分析圖片中最明顯的廢棄物，以 JSON 格式回傳結果。

只能從以下 itemId 選一個：
- pet-bottle（PET 寶特瓶、任何塑膠瓶罐）
- aluminum-can（鋁罐、鐵罐）
- cardboard（紙板、紙箱、紙類）
- glass-bottle（玻璃瓶、玻璃罐）
- oily-lunchbox（有油污的餐盒、便當盒）
- general-waste（其他無法辨識或不可回收垃圾）

size 只能填：小型、中型、大型
cleanliness 只能填：乾淨、輕微殘留、嚴重油污、不適用
confidence 為 0.0～1.0 的小數

回傳純 JSON，不加任何說明文字：
{"itemId":"...","size":"...","cleanliness":"...","confidence":0.0}`;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are supported.'));
      return;
    }
    cb(null, true);
  }
});

// =================【 修正：CORS 與靜態檔案設定 】=================
// 本地開發時，直接使用 cors() 能完美相容 Live Server、npm run dev 或雙擊 HTML 檔案 (file:///)
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const SIZE_MULTIPLIERS = {
  '小型': 0.8,
  '中型': 1,
  '大型': 1.3
};

const CLEANLINESS_MULTIPLIERS = {
  '乾淨': 1,
  '輕微殘留': 0.7,
  '嚴重油污': 0,
  '不適用': 0
};

const GAME_ACTIONS = {
  water:     { cost: 10, exp: 15 },
  fertilize: { cost: 30, exp: 50 },
  harvest:   { cost: 0,  exp: 0  },
};
const VALID_REGIONS  = ['north', 'central', 'south', 'east'];
const REGION_NAMES   = { north: '北部', central: '中部', south: '南部', east: '東部' };
const LEVEL_EXP      = [0, 100, 300, 600]; // min EXP for Lv1/2/3/4
const TREE_MAX_LEVEL = 4;
const TREE_CO2_KG    = 21.7; // kg CO₂ absorbed per harvested tree (approximation)

function calcTreeLevel(exp) {
  for (let lv = TREE_MAX_LEVEL; lv >= 1; lv--) {
    if (exp >= LEVEL_EXP[lv - 1]) return lv;
  }
  return 1;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token.' });
    return;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function toNumber(value) {
  return Number.parseFloat(value || 0);
}

function calculateRecord(wasteType, size, cleanliness, weightKg) {
  const sizeMultiplier = SIZE_MULTIPLIERS[size] ?? 1;
  const cleanlinessMultiplier = CLEANLINESS_MULTIPLIERS[cleanliness] ?? 0;
  const points = Math.round(
    toNumber(wasteType.base_points) * sizeMultiplier * cleanlinessMultiplier
  );
  const carbonReducedKg = Number(
    (toNumber(weightKg) * toNumber(wasteType.carbon_reduction_per_kg) * cleanlinessMultiplier).toFixed(2)
  );

  return {
    sizeMultiplier,
    cleanlinessMultiplier,
    points,
    carbonReducedKg
  };
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'reloop-api' });
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email and password are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash)
       VALUES (:name, :email, :passwordHash)`,
      { name, email, passwordHash }
    );

    const user = { id: result.insertId, name, email, carbon_coins: 0 };
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash, carbon_coins FROM users WHERE email = :email',
      { email }
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    delete user.password_hash;
    res.json({ user, token: createToken(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, carbon_coins, created_at FROM users WHERE id = :id',
      { id: req.user.id }
    );
    res.json({ user: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/waste-types', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT item_id, name, material, default_bin, base_points,
              carbon_reduction_per_kg, default_weight_kg, is_recyclable
       FROM waste_types
       WHERE is_active = 1
       ORDER BY id`
    );
    res.json({ wasteTypes: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/summary', requireAuth, async (req, res, next) => {
  try {
    const [[user]] = await pool.execute(
      'SELECT carbon_coins FROM users WHERE id = :userId',
      { userId: req.user.id }
    );
    const [[monthly]] = await pool.execute(
      `SELECT
         COALESCE(SUM(weight_kg), 0) AS monthly_recycled_kg,
         COALESCE(SUM(carbon_reduced_kg), 0) AS monthly_carbon_reduced_kg,
         COUNT(*) AS monthly_records
       FROM recycle_records
       WHERE user_id = :userId
         AND created_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`,
      { userId: req.user.id }
    );
    const [recentRecords] = await pool.execute(
      `SELECT item_name, material, points_earned, carbon_reduced_kg, created_at
       FROM recycle_records
       WHERE user_id = :userId
       ORDER BY created_at DESC
       LIMIT 5`,
      { userId: req.user.id }
    );

    res.json({
      carbonCoins: user?.carbon_coins || 0,
      monthlyRecycledKg: Number(monthly.monthly_recycled_kg),
      monthlyCarbonReducedKg: Number(monthly.monthly_carbon_reduced_kg),
      monthlyRecords: Number(monthly.monthly_records),
      recentRecords
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/stats/items', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT wt.item_id, wt.name, COUNT(rr.id) AS count
       FROM waste_types wt
       LEFT JOIN recycle_records rr ON rr.waste_type_id = wt.id AND rr.user_id = :userId
       WHERE wt.is_active = 1
       GROUP BY wt.item_id, wt.name
       ORDER BY wt.id`,
      { userId: req.user.id }
    );
    res.json({ items: rows.map(r => ({ ...r, count: Number(r.count) })) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/records', requireAuth, async (req, res, next) => {
  try {
    const [records] = await pool.execute(
      `SELECT id, item_name, material, size, cleanliness, weight_kg,
              points_earned, carbon_reduced_kg, confidence, created_at
       FROM recycle_records
       WHERE user_id = :userId
       ORDER BY created_at DESC
       LIMIT 50`,
      { userId: req.user.id }
    );
    res.json({ records });
  } catch (error) {
    next(error);
  }
});

app.post('/api/records', requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const {
      itemId,
      size = '中型',
      cleanliness = '乾淨',
      weightKg,
      confidence = null
    } = req.body;

    const [wasteRows] = await connection.execute(
      'SELECT * FROM waste_types WHERE item_id = :itemId AND is_active = 1',
      { itemId }
    );
    const wasteType = wasteRows[0];

    if (!wasteType) {
      res.status(404).json({ error: 'Unsupported waste item.' });
      return;
    }

    const finalWeightKg = weightKg ?? wasteType.default_weight_kg;
    const calculation = calculateRecord(wasteType, size, cleanliness, finalWeightKg);

    await connection.beginTransaction();
    const [recordResult] = await connection.execute(
      `INSERT INTO recycle_records
       (user_id, waste_type_id, item_name, material, size, cleanliness, weight_kg,
        points_earned, carbon_reduced_kg, confidence)
       VALUES
       (:userId, :wasteTypeId, :itemName, :material, :size, :cleanliness, :weightKg,
        :pointsEarned, :carbonReducedKg, :confidence)`,
      {
        userId: req.user.id,
        wasteTypeId: wasteType.id,
        itemName: wasteType.name,
        material: wasteType.material,
        size,
        cleanliness,
        weightKg: finalWeightKg,
        pointsEarned: calculation.points,
        carbonReducedKg: calculation.carbonReducedKg,
        confidence
      }
    );

    if (calculation.points > 0) {
      await connection.execute(
        `INSERT INTO coin_transactions (user_id, type, amount, description)
         VALUES (:userId, 'earn', :amount, :description)`,
        {
          userId: req.user.id,
          amount: calculation.points,
          description: `${wasteType.name} 回收`
        }
      );
      await connection.execute(
        'UPDATE users SET carbon_coins = carbon_coins + :points WHERE id = :userId',
        { points: calculation.points, userId: req.user.id }
      );
    }

    await connection.commit();
    res.status(201).json({
      recordId: recordResult.insertId,
      itemId: wasteType.item_id,
      name: wasteType.name,
      material: wasteType.material,
      bin: wasteType.default_bin,
      size,
      cleanliness,
      weightKg: Number(finalWeightKg),
      points: calculation.points,
      carbonReducedKg: calculation.carbonReducedKg,
      confidence,
      formula: {
        basePoints: Number(wasteType.base_points),
        sizeMultiplier: calculation.sizeMultiplier,
        cleanlinessMultiplier: calculation.cleanlinessMultiplier
      }
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/classify', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image uploaded.' });
      return;
    }

    const result = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [
          { text: CLASSIFY_PROMPT },
          { inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } }
        ]}
      ]
    });

    const textContent = result.text;
    if (!textContent) {
      res.status(502).json({ error: 'AI returned no text content.' });
      return;
    }
    const raw = textContent.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'AI returned invalid JSON.', raw });
      return;
    }

    const { itemId, size, cleanliness, confidence } = parsed;
    const validIds = ['pet-bottle', 'aluminum-can', 'cardboard', 'glass-bottle', 'oily-lunchbox', 'general-waste'];
    if (!validIds.includes(itemId)) {
      res.status(502).json({ error: 'AI returned unknown itemId.', parsed });
      return;
    }

    await pool.execute(
      `INSERT INTO classification_logs (user_id, image_mime, ai_provider, raw_result, normalized_item_id, confidence)
       VALUES (:userId, :mime, 'gemini', :raw, :itemId, :confidence)`,
      { userId: req.user.id, mime: req.file.mimetype, raw: JSON.stringify(parsed), itemId, confidence: confidence ?? null }
    );

    res.json({ itemId, size, cleanliness, confidence });
  } catch (error) {
    next(error);
  }
});

app.get('/api/rewards', async (req, res, next) => {
  try {
    const [rewards] = await pool.execute(
      'SELECT id, name, description, cost, stock FROM rewards WHERE is_active = 1 ORDER BY cost'
    );
    res.json({ rewards });
  } catch (error) {
    next(error);
  }
});

app.post('/api/rewards/:id/redeem', requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[reward]] = await connection.execute(
      'SELECT id, name, cost, stock FROM rewards WHERE id = :id AND is_active = 1 FOR UPDATE',
      { id: req.params.id }
    );
    const [[user]] = await connection.execute(
      'SELECT carbon_coins FROM users WHERE id = :userId FOR UPDATE',
      { userId: req.user.id }
    );

    if (!reward) {
      await connection.rollback();
      res.status(404).json({ error: 'Reward not found.' });
      return;
    }
    if (reward.stock !== null && reward.stock <= 0) {
      await connection.rollback();
      res.status(409).json({ error: 'Reward is out of stock.' });
      return;
    }
    if (Number(user.carbon_coins) < Number(reward.cost)) {
      await connection.rollback();
      res.status(400).json({ error: 'Not enough carbon coins.' });
      return;
    }

    await connection.execute(
      'UPDATE users SET carbon_coins = carbon_coins - :cost WHERE id = :userId',
      { cost: reward.cost, userId: req.user.id }
    );
    if (reward.stock !== null) {
      await connection.execute(
        'UPDATE rewards SET stock = stock - 1 WHERE id = :id',
        { id: reward.id }
      );
    }
    await connection.execute(
      `INSERT INTO coin_transactions (user_id, type, amount, description)
       VALUES (:userId, 'redeem', :amount, :description)`,
      {
        userId: req.user.id,
        amount: -Number(reward.cost),
        description: `兌換 ${reward.name}`
      }
    );
    await connection.commit();
    res.json({ ok: true, reward: reward.name, cost: Number(reward.cost) });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ──────────────────────────────────────────────
// ECO-TREE GAME ROUTES
// ──────────────────────────────────────────────

app.get('/api/game/status', requireAuth, async (req, res, next) => {
  try {
    await pool.execute(
      'INSERT IGNORE INTO user_game_status (user_id) VALUES (:userId)',
      { userId: req.user.id }
    );

    const [[status]] = await pool.execute(
      `SELECT ugs.*, u.carbon_coins
       FROM user_game_status ugs
       JOIN users u ON u.id = ugs.user_id
       WHERE ugs.user_id = :userId`,
      { userId: req.user.id }
    );

    const [[globalStats]] = await pool.execute(
      `SELECT
         COALESCE(SUM(harvested_trees_count), 0) AS total_mature_trees,
         COUNT(*) AS total_players
       FROM user_game_status`
    );

    const level    = Number(status.tree_level);
    const exp      = Number(status.current_exp);
    const expFloor = LEVEL_EXP[level - 1];
    const expNext  = level < TREE_MAX_LEVEL ? LEVEL_EXP[level] : null;
    const totalMature = Number(globalStats.total_mature_trees);

    res.json({
      tree: {
        name:               status.current_tree_name,
        level,
        currentExp:         exp,
        expForCurrentLevel: expFloor,
        expForNextLevel:    expNext,
        totalWatered:       Number(status.total_watered),
        totalFertilized:    Number(status.total_fertilized),
        harvestedCount:     Number(status.harvested_trees_count),
        canHarvest:         level >= TREE_MAX_LEVEL,
      },
      wallet: { carbonCoins: Number(status.carbon_coins) },
      globalStats: {
        totalMatureTrees: totalMature,
        totalPlayers:     Number(globalStats.total_players),
        co2AbsorbedKg:    Number((totalMature * TREE_CO2_KG).toFixed(1)),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/game/action', requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { action, region } = req.body;

    if (!Object.prototype.hasOwnProperty.call(GAME_ACTIONS, action)) {
      res.status(400).json({ error: `Invalid action. Valid: ${Object.keys(GAME_ACTIONS).join(', ')}.` });
      return;
    }

    if (action === 'harvest' && !VALID_REGIONS.includes(region)) {
      res.status(400).json({ error: '請選擇有效的種植區域（北部/中部/南部/東部）。' });
      return;
    }

    const { cost, exp: expGain } = GAME_ACTIONS[action];

    await connection.beginTransaction();

    const [[user]] = await connection.execute(
      'SELECT carbon_coins FROM users WHERE id = :userId FOR UPDATE',
      { userId: req.user.id }
    );

    await connection.execute(
      'INSERT IGNORE INTO user_game_status (user_id) VALUES (:userId)',
      { userId: req.user.id }
    );
    const [[status]] = await connection.execute(
      'SELECT * FROM user_game_status WHERE user_id = :userId FOR UPDATE',
      { userId: req.user.id }
    );

    const levelBefore = Number(status.tree_level);
    const expBefore   = Number(status.current_exp);

    if (Number(user.carbon_coins) < cost) {
      await connection.rollback();
      res.status(400).json({
        error: `碳幣不足。此動作需要 ${cost} CCN，目前餘額：${Number(user.carbon_coins)} CCN。`
      });
      return;
    }

    if (action === 'harvest' && levelBefore < TREE_MAX_LEVEL) {
      await connection.rollback();
      res.status(400).json({ error: '樹木尚未成熟，需達到 Lv.4 方可移栽。' });
      return;
    }

    let newExp     = expBefore + expGain;
    let levelAfter = calcTreeLevel(newExp);

    if (action === 'harvest') {
      newExp     = 0;
      levelAfter = 1;
      await connection.execute(
        `UPDATE user_game_status
         SET current_exp = 0, tree_level = 1,
             harvested_trees_count = harvested_trees_count + 1
         WHERE user_id = :userId`,
        { userId: req.user.id }
      );
    } else {
      const countCol = action === 'water' ? 'total_watered' : 'total_fertilized';
      await connection.execute(
        `UPDATE user_game_status
         SET current_exp = :newExp, tree_level = :levelAfter,
             ${countCol} = ${countCol} + 1
         WHERE user_id = :userId`,
        { newExp, levelAfter, userId: req.user.id }
      );
      await connection.execute(
        'UPDATE users SET carbon_coins = carbon_coins - :cost WHERE id = :userId',
        { cost, userId: req.user.id }
      );
      await connection.execute(
        `INSERT INTO coin_transactions (user_id, type, amount, description)
         VALUES (:userId, 'redeem', :amount, :description)`,
        {
          userId: req.user.id,
          amount: -cost,
          description: `Eco-Tree：${action === 'water' ? '澆水' : '施肥'}`,
        }
      );
    }

    await connection.execute(
      `INSERT INTO game_action_logs
         (user_id, action_type, coin_spent, exp_gained, level_before, level_after, region)
       VALUES (:userId, :actionType, :coinSpent, :expGained, :levelBefore, :levelAfter, :region)`,
      {
        userId:      req.user.id,
        actionType:  action,
        coinSpent:   cost,
        expGained:   expGain,
        levelBefore,
        levelAfter,
        region:      action === 'harvest' ? region : null,
      }
    );

    await connection.commit();

    const [[updatedUser]]   = await pool.execute(
      'SELECT carbon_coins FROM users WHERE id = :userId',
      { userId: req.user.id }
    );
    const [[updatedStatus]] = await pool.execute(
      'SELECT * FROM user_game_status WHERE user_id = :userId',
      { userId: req.user.id }
    );

    const finalLevel = Number(updatedStatus.tree_level);
    const finalExp   = Number(updatedStatus.current_exp);

    res.json({
      ok:         true,
      action,
      coinSpent:  cost,
      expGained:  expGain,
      leveledUp:  action !== 'harvest' && levelAfter > levelBefore,
      harvested:  action === 'harvest',
      region:     action === 'harvest' ? region : undefined,
      regionName: action === 'harvest' ? REGION_NAMES[region] : undefined,
      tree: {
        level:               finalLevel,
        currentExp:          finalExp,
        expForCurrentLevel:  LEVEL_EXP[finalLevel - 1],
        expForNextLevel:     finalLevel < TREE_MAX_LEVEL ? LEVEL_EXP[finalLevel] : null,
        harvestedCount:      Number(updatedStatus.harvested_trees_count),
        canHarvest:          finalLevel >= TREE_MAX_LEVEL,
      },
      wallet: { carbonCoins: Number(updatedUser.carbon_coins) },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/game/plant-log', async (req, res, next) => {
  try {
    const [logs] = await pool.execute(
      `SELECT u.name, gal.region, gal.created_at
       FROM game_action_logs gal
       JOIN users u ON u.id = gal.user_id
       WHERE gal.action_type = 'harvest' AND gal.region IS NOT NULL
       ORDER BY gal.created_at DESC
       LIMIT 20`
    );
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

app.get('/api/game/map', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT region, COUNT(*) AS count
       FROM game_action_logs
       WHERE action_type = 'harvest' AND region IS NOT NULL
       GROUP BY region`
    );
    const regions = { north: 0, central: 0, south: 0, east: 0 };
    for (const row of rows) {
      if (Object.prototype.hasOwnProperty.call(regions, row.region)) {
        regions[row.region] = Number(row.count);
      }
    }
    res.json({ regions });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: 'Server error.',
    message: process.env.NODE_ENV === 'production' ? undefined : error.message
  });
});

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(port, () => {
    console.log(`reloop API server running on http://localhost:${port}`);
  });
}

module.exports = { app };