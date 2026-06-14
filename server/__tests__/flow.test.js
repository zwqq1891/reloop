// server/__tests__/flow.test.js — 完整流程測試：拍照 → 回收賺幣 → 種樹

let mockGenerateContent;
jest.mock('@google/genai', () => {
  mockGenerateContent = jest.fn();
  return {
    GoogleGenAI: jest.fn(() => ({ models: { generateContent: mockGenerateContent } })),
  };
});

const mockPoolExecute = jest.fn();
const mockConn = {
  execute:          jest.fn(),
  beginTransaction: jest.fn(),
  commit:           jest.fn(),
  rollback:         jest.fn(),
  release:          jest.fn(),
};
jest.mock('../db', () => ({
  execute:       mockPoolExecute,
  getConnection: jest.fn().mockResolvedValue(mockConn),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const { app } = require('../server');
const db      = require('../db');

beforeEach(() => {
  jest.resetAllMocks();
  // getConnection 被 resetAllMocks 清除實作，需重設
  db.getConnection.mockResolvedValue(mockConn);
  mockConn.beginTransaction.mockResolvedValue();
  mockConn.commit.mockResolvedValue();
  mockConn.rollback.mockResolvedValue();
  mockConn.release.mockResolvedValue();
});

// ═══════════════════════════════════════════════════════════════════════════
// 完整流程：帳號 → 拍照辨識 → 回收紀錄 → 遊戲狀態 → 澆水 → 種樹
// ═══════════════════════════════════════════════════════════════════════════
describe('完整流程：拍照 → 回收 → 種樹', () => {
  it('用戶可以從帳號注冊到拍照辨識、賺取碳幣，最後成功種樹', async () => {

    // ─── Step 1：帳號註冊 ──────────────────────────────────────────────────
    mockPoolExecute.mockResolvedValueOnce([{ insertId: 42 }]); // INSERT users

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ name: '測試用戶', email: 'flow@test.com', password: 'secret123' });

    expect(registerRes.status).toBe(201);
    const { token } = registerRes.body;
    expect(token).toBeTruthy();
    expect(registerRes.body.user.name).toBe('測試用戶');

    // ─── Step 2：上傳照片，AI 辨識廢棄物 ──────────────────────────────────
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"itemId":"pet-bottle","size":"中型","cleanliness":"乾淨","confidence":0.92}',
    });
    mockPoolExecute.mockResolvedValueOnce([{}]); // INSERT classification_logs

    const classifyRes = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake-image-bytes'), {
        filename: 'bottle.jpg',
        contentType: 'image/jpeg',
      });

    expect(classifyRes.status).toBe(200);
    expect(classifyRes.body.itemId).toBe('pet-bottle');
    expect(classifyRes.body.size).toBe('中型');
    expect(classifyRes.body.cleanliness).toBe('乾淨');

    const { itemId, size, cleanliness, confidence } = classifyRes.body;

    // ─── Step 3：提交回收紀錄，賺取碳幣 ───────────────────────────────────
    const wasteType = {
      id: 1, item_id: 'pet-bottle', name: 'PET 寶特瓶',
      material: '塑膠', default_bin: '資源回收桶',
      base_points: 50, carbon_reduction_per_kg: 1.5,
      default_weight_kg: 0.03, is_recyclable: 1,
    };
    mockConn.execute
      .mockResolvedValueOnce([[wasteType]])       // SELECT waste_types
      .mockResolvedValueOnce([{ insertId: 100 }]) // INSERT recycle_records
      .mockResolvedValueOnce([{}])                // INSERT coin_transactions
      .mockResolvedValueOnce([{}]);               // UPDATE users carbon_coins

    const recordRes = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId, size, cleanliness, confidence });

    expect(recordRes.status).toBe(201);
    expect(recordRes.body.points).toBe(50); // 50 * 1 (中型) * 1 (乾淨)
    expect(recordRes.body.itemId).toBe('pet-bottle');
    expect(mockConn.commit).toHaveBeenCalled();

    // ─── Step 4：查看遊戲狀態（確認有碳幣，且樹在 Lv.1）─────────────────
    mockPoolExecute
      .mockResolvedValueOnce([{}]) // INSERT IGNORE user_game_status
      .mockResolvedValueOnce([[{
        current_tree_name: '我的小樹', tree_level: 1, current_exp: 0,
        total_watered: 0, total_fertilized: 0, harvested_trees_count: 0,
        carbon_coins: 50,
      }]])
      .mockResolvedValueOnce([[{ total_mature_trees: 5, total_players: 10 }]]);

    const statusRes = await request(app)
      .get('/api/game/status')
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.wallet.carbonCoins).toBe(50);
    expect(statusRes.body.tree.level).toBe(1);
    expect(statusRes.body.tree.canHarvest).toBe(false);
    expect(statusRes.body.globalStats.totalMatureTrees).toBe(5);

    // ─── Step 5：花 10 碳幣澆水，讓樹獲得 15 EXP ─────────────────────────
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 50 }]])  // SELECT users FOR UPDATE
      .mockResolvedValueOnce([{}])                      // INSERT IGNORE game_status
      .mockResolvedValueOnce([[{
        current_tree_name: '我的小樹', tree_level: 1, current_exp: 0,
        total_watered: 0, total_fertilized: 0, harvested_trees_count: 0,
      }]])                                              // SELECT game_status FOR UPDATE
      .mockResolvedValueOnce([{}])                      // UPDATE user_game_status
      .mockResolvedValueOnce([{}])                      // UPDATE users carbon_coins
      .mockResolvedValueOnce([{}])                      // INSERT coin_transactions
      .mockResolvedValueOnce([{}]);                     // INSERT game_action_logs
    mockPoolExecute
      .mockResolvedValueOnce([[{ carbon_coins: 40 }]])
      .mockResolvedValueOnce([[{ tree_level: 1, current_exp: 15, harvested_trees_count: 0 }]]);

    const waterRes = await request(app)
      .post('/api/game/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'water' });

    expect(waterRes.status).toBe(200);
    expect(waterRes.body.coinSpent).toBe(10);
    expect(waterRes.body.expGained).toBe(15);
    expect(waterRes.body.harvested).toBe(false);
    expect(waterRes.body.wallet.carbonCoins).toBe(40);
    expect(mockConn.commit).toHaveBeenCalled();

    // ─── Step 6：樹已達 Lv.4，移栽到北部 ────────────────────────────────
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 300 }]]) // SELECT users FOR UPDATE
      .mockResolvedValueOnce([{}])                      // INSERT IGNORE game_status
      .mockResolvedValueOnce([[{
        current_tree_name: '我的小樹', tree_level: 4, current_exp: 600,
        total_watered: 20, total_fertilized: 5, harvested_trees_count: 0,
      }]])                                              // SELECT game_status FOR UPDATE (Lv.4)
      .mockResolvedValueOnce([{}])                      // UPDATE game_status (reset)
      .mockResolvedValueOnce([{}]);                     // INSERT game_action_logs
    mockPoolExecute
      .mockResolvedValueOnce([[{ carbon_coins: 300 }]])
      .mockResolvedValueOnce([[{ tree_level: 1, current_exp: 0, harvested_trees_count: 1 }]]);

    const harvestRes = await request(app)
      .post('/api/game/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'harvest', region: 'north' });

    expect(harvestRes.status).toBe(200);
    expect(harvestRes.body.harvested).toBe(true);
    expect(harvestRes.body.region).toBe('north');
    expect(harvestRes.body.regionName).toBe('北部');
    expect(harvestRes.body.coinSpent).toBe(0);         // 種樹不扣碳幣
    expect(harvestRes.body.tree.level).toBe(1);         // 樹重置為 Lv.1
    expect(harvestRes.body.tree.currentExp).toBe(0);
    expect(harvestRes.body.tree.harvestedCount).toBe(1);
    expect(harvestRes.body.tree.canHarvest).toBe(false);
    expect(harvestRes.body.wallet.carbonCoins).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 邊界案例
// ═══════════════════════════════════════════════════════════════════════════
describe('碳幣不足時無法進行遊戲動作', () => {
  it('碳幣少於 10 時，澆水回傳 400', async () => {
    // 先拿一個有效 token
    const token = jwt.sign(
      { id: 99, email: 'poor@test.com', name: 'PoorUser' },
      process.env.JWT_SECRET || 'dev_secret_change_me',
      { expiresIn: '1h' }
    );

    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 5 }]])   // SELECT users (只有 5 CCN)
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{
        current_tree_name: '我的小樹', tree_level: 1, current_exp: 0,
        total_watered: 0, total_fertilized: 0, harvested_trees_count: 0,
      }]]);

    const res = await request(app)
      .post('/api/game/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'water' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/碳幣不足/);
    expect(mockConn.rollback).toHaveBeenCalled();
  });
});

describe('樹未成熟時無法種樹', () => {
  it('樹在 Lv.2 時 harvest 回傳 400', async () => {
    const token = jwt.sign(
      { id: 99, email: 'lv2@test.com', name: 'Lv2User' },
      process.env.JWT_SECRET || 'dev_secret_change_me',
      { expiresIn: '1h' }
    );

    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 500 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{
        current_tree_name: '我的小樹', tree_level: 2, current_exp: 150,
        total_watered: 5, total_fertilized: 0, harvested_trees_count: 0,
      }]]);

    const res = await request(app)
      .post('/api/game/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'harvest', region: 'south' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Lv\.4/);
    expect(mockConn.rollback).toHaveBeenCalled();
  });
});

describe('AI 辨識失敗的處理', () => {
  it('AI 回傳非 JSON 時，classify 回傳 502', async () => {
    const token = jwt.sign(
      { id: 1, email: 't@t.com', name: 'T' },
      process.env.JWT_SECRET || 'dev_secret_change_me',
      { expiresIn: '1h' }
    );

    mockGenerateContent.mockResolvedValueOnce({ text: '我無法辨識此圖片' });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('bad-image'), {
        filename: 'bad.jpg', contentType: 'image/jpeg',
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/invalid JSON/i);
  });

  it('AI 回傳不支援的 itemId 時，classify 回傳 502', async () => {
    const token = jwt.sign(
      { id: 1, email: 't@t.com', name: 'T' },
      process.env.JWT_SECRET || 'dev_secret_change_me',
      { expiresIn: '1h' }
    );

    mockGenerateContent.mockResolvedValueOnce({
      text: '{"itemId":"nuclear-waste","size":"大型","cleanliness":"乾淨","confidence":0.99}',
    });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('weird-image'), {
        filename: 'weird.jpg', contentType: 'image/jpeg',
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/unknown itemId/i);
  });
});
