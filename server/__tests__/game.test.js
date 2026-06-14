// server/__tests__/game.test.js — Eco-Tree Game API tests

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: jest.fn() }
  }))
}));

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

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function auth() {
  return `Bearer ${jwt.sign({ id: 1, email: 't@t.com', name: 'Tester' }, JWT_SECRET, { expiresIn: '1h' })}`;
}

// Shared row shapes
const statusLv2 = { current_tree_name: '我的小樹', tree_level: 2, current_exp: 150, total_watered: 5, total_fertilized: 2, harvested_trees_count: 1 };
const statusLv4 = { ...statusLv2, tree_level: 4, current_exp: 600 };
const globalRow = { total_mature_trees: 42, total_players: 18 };

beforeEach(() => {
  // resetAllMocks also flushes the mockResolvedValueOnce queue — critical to avoid bleed
  jest.resetAllMocks();
  // getConnection loses its implementation after resetAllMocks — must re-set
  db.getConnection.mockResolvedValue(mockConn);
  mockConn.beginTransaction.mockResolvedValue();
  mockConn.commit.mockResolvedValue();
  mockConn.rollback.mockResolvedValue();
  mockConn.release.mockResolvedValue();
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/game/map
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/game/map', () => {
  it('200 — returns all 4 region keys', async () => {
    mockPoolExecute.mockResolvedValueOnce([[
      { region: 'north', count: 18 },
      { region: 'south', count: 12 },
    ]]);
    const res = await request(app).get('/api/game/map');
    expect(res.status).toBe(200);
    expect(res.body.regions).toMatchObject({ north: 18, central: 0, south: 12, east: 0 });
  });

  it('200 — regions absent from DB default to 0', async () => {
    mockPoolExecute.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/api/game/map');
    expect(res.status).toBe(200);
    expect(res.body.regions).toEqual({ north: 0, central: 0, south: 0, east: 0 });
  });

  it('200 — all four regions reported when all present', async () => {
    mockPoolExecute.mockResolvedValueOnce([[
      { region: 'north', count: 10 },
      { region: 'central', count: 5 },
      { region: 'south', count: 8 },
      { region: 'east', count: 3 },
    ]]);
    const res = await request(app).get('/api/game/map');
    expect(res.body.regions).toEqual({ north: 10, central: 5, south: 8, east: 3 });
  });

  it('200 — ignores unknown region values from DB', async () => {
    mockPoolExecute.mockResolvedValueOnce([[
      { region: 'north', count: 5 },
      { region: 'west', count: 99 },  // invalid, should be ignored
    ]]);
    const res = await request(app).get('/api/game/map');
    expect(res.body.regions.north).toBe(5);
    expect(res.body.regions).not.toHaveProperty('west');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/game/status
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/game/status', () => {
  it('401 without auth token', async () => {
    const res = await request(app).get('/api/game/status');
    expect(res.status).toBe(401);
  });

  it('200 — returns tree / wallet / globalStats shape', async () => {
    mockPoolExecute
      .mockResolvedValueOnce([{}])                                     // INSERT IGNORE
      .mockResolvedValueOnce([[{ ...statusLv2, carbon_coins: 500 }]]) // SELECT status
      .mockResolvedValueOnce([[globalRow]]);                           // SELECT global

    const res = await request(app).get('/api/game/status').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body.tree).toMatchObject({ level: 2, canHarvest: false });
    expect(res.body.wallet.carbonCoins).toBe(500);
    expect(res.body.globalStats.totalMatureTrees).toBe(42);
    expect(res.body.globalStats.co2AbsorbedKg).toBeCloseTo(42 * 21.7, 0);
  });

  it('200 — canHarvest true at Lv.4', async () => {
    mockPoolExecute
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv4, carbon_coins: 200 }]])
      .mockResolvedValueOnce([[globalRow]]);

    const res = await request(app).get('/api/game/status').set('Authorization', auth());

    expect(res.body.tree.canHarvest).toBe(true);
    expect(res.body.tree.expForNextLevel).toBeNull();
  });

  it('200 — expForNextLevel is set for intermediate levels', async () => {
    mockPoolExecute
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv2, carbon_coins: 200 }]])
      .mockResolvedValueOnce([[globalRow]]);

    const res = await request(app).get('/api/game/status').set('Authorization', auth());

    expect(res.body.tree.expForNextLevel).toBe(300); // Lv.2→Lv.3 threshold
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/game/action — input validation (no DB needed)
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/game/action — validation', () => {
  it('401 without auth token', async () => {
    const res = await request(app).post('/api/game/action').send({ action: 'water' });
    expect(res.status).toBe(401);
  });

  it('400 on invalid action name', async () => {
    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'fly' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid action/i);
  });

  it('400 harvest without region', async () => {
    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/區域/);
  });

  it('400 harvest with invalid region', async () => {
    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest', region: 'west' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/區域/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/game/action — water
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/game/action — water', () => {
  it('400 when carbon coins < 10', async () => {
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 5 }]])            // SELECT users
      .mockResolvedValueOnce([{}])                               // INSERT IGNORE
      .mockResolvedValueOnce([[{ ...statusLv2 }]]);              // SELECT status

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'water' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/碳幣不足/);
    expect(mockConn.rollback).toHaveBeenCalled();
  });

  it('200 — deducts 10 CCN and gains 15 EXP', async () => {
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 200 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv2 }]])
      .mockResolvedValueOnce([{}])                               // UPDATE status
      .mockResolvedValueOnce([{}])                               // UPDATE users coins
      .mockResolvedValueOnce([{}])                               // INSERT coin_transactions
      .mockResolvedValueOnce([{}]);                              // INSERT game_action_logs
    mockPoolExecute
      .mockResolvedValueOnce([[{ carbon_coins: 190 }]])
      .mockResolvedValueOnce([[{ tree_level: 2, current_exp: 165, harvested_trees_count: 1 }]]);

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'water' });

    expect(res.status).toBe(200);
    expect(res.body.coinSpent).toBe(10);
    expect(res.body.expGained).toBe(15);
    expect(res.body.harvested).toBe(false);
    expect(res.body.wallet.carbonCoins).toBe(190);
    expect(mockConn.commit).toHaveBeenCalled();
  });

  it('200 — leveledUp true when EXP crosses Lv.3 threshold', async () => {
    // 290 + 15 = 305 → crosses threshold of 300
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 200 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv2, current_exp: 290 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    mockPoolExecute
      .mockResolvedValueOnce([[{ carbon_coins: 190 }]])
      .mockResolvedValueOnce([[{ tree_level: 3, current_exp: 305, harvested_trees_count: 1 }]]);

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'water' });

    expect(res.status).toBe(200);
    expect(res.body.leveledUp).toBe(true);
    expect(res.body.tree.level).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/game/action — fertilize
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/game/action — fertilize', () => {
  it('400 when carbon coins < 30', async () => {
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 20 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv2 }]]);

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'fertilize' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/碳幣不足/);
  });

  it('200 — deducts 30 CCN and gains 50 EXP', async () => {
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 300 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv2, tree_level: 1, current_exp: 0 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    mockPoolExecute
      .mockResolvedValueOnce([[{ carbon_coins: 270 }]])
      .mockResolvedValueOnce([[{ tree_level: 1, current_exp: 50, harvested_trees_count: 0 }]]);

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'fertilize' });

    expect(res.status).toBe(200);
    expect(res.body.coinSpent).toBe(30);
    expect(res.body.expGained).toBe(50);
    expect(res.body.wallet.carbonCoins).toBe(270);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/game/action — harvest
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/game/action — harvest', () => {
  function harvestMocks() {
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 300 }]])           // SELECT users
      .mockResolvedValueOnce([{}])                               // INSERT IGNORE
      .mockResolvedValueOnce([[{ ...statusLv4 }]])               // SELECT status (Lv.4)
      .mockResolvedValueOnce([{}])                               // UPDATE status (reset)
      .mockResolvedValueOnce([{}]);                              // INSERT game_action_logs
    mockPoolExecute
      .mockResolvedValueOnce([[{ carbon_coins: 300 }]])          // post-commit SELECT users
      .mockResolvedValueOnce([[{ tree_level: 1, current_exp: 0, harvested_trees_count: 2 }]]); // post-commit status
  }

  it('400 when tree level < 4', async () => {
    mockConn.execute
      .mockResolvedValueOnce([[{ carbon_coins: 300 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ ...statusLv2 }]]);             // Lv.2 → denied

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest', region: 'north' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Lv\.4/);
    expect(mockConn.rollback).toHaveBeenCalled();
  });

  it.each(['north', 'central', 'south', 'east'])(
    '200 — harvest into "%s" returns correct regionName',
    async (region) => {
      harvestMocks();
      const NAMES = { north: '北部', central: '中部', south: '南部', east: '東部' };

      const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest', region });

      expect(res.status).toBe(200);
      expect(res.body.harvested).toBe(true);
      expect(res.body.region).toBe(region);
      expect(res.body.regionName).toBe(NAMES[region]);
    }
  );

  it('200 — tree resets to Lv.1 / 0 EXP after harvest', async () => {
    harvestMocks();

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest', region: 'south' });

    expect(res.status).toBe(200);
    expect(res.body.tree.level).toBe(1);
    expect(res.body.tree.currentExp).toBe(0);
    expect(res.body.tree.canHarvest).toBe(false);
    expect(res.body.tree.harvestedCount).toBe(2);
  });

  it('200 — harvest does not deduct carbon coins', async () => {
    harvestMocks();

    const res = await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest', region: 'east' });

    expect(res.body.coinSpent).toBe(0);
    expect(res.body.wallet.carbonCoins).toBe(300);
  });

  it('200 — game_action_logs INSERT receives the chosen region', async () => {
    harvestMocks();

    await request(app).post('/api/game/action').set('Authorization', auth()).send({ action: 'harvest', region: 'central' });

    // 5th call to connection.execute is INSERT game_action_logs
    const [, params] = mockConn.execute.mock.calls[4];
    expect(params.region).toBe('central');
    expect(params.actionType).toBe('harvest');
  });
});
