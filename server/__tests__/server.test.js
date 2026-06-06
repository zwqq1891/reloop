// server/__tests__/server.test.js

// ── mock @google/genai ─────────────────────────────────────────────────────
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent }
  }))
}));

// ── mock DB pool ───────────────────────────────────────────────────────────
const mockPoolExecute = jest.fn();
const mockConn = {
  execute:          jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(),
  commit:           jest.fn().mockResolvedValue(),
  rollback:         jest.fn().mockResolvedValue(),
  release:          jest.fn()
};
jest.mock('../db', () => ({
  execute:       mockPoolExecute,
  getConnection: jest.fn().mockResolvedValue(mockConn)
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const { app } = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function makeToken(payload = { id: 1, email: 'test@test.com', name: 'Tester' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
  jest.clearAllMocks();
  // transaction mock 需要每次重設
  mockConn.beginTransaction.mockResolvedValue();
  mockConn.commit.mockResolvedValue();
  mockConn.rollback.mockResolvedValue();
});

// ═══════════════════════════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /health', () => {
  it('returns 200 with ok:true', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth — register
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/auth/register', () => {
  it('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@a.com', password: 'abcdef' });
    expect(res.status).toBe(400);
  });

  it('400 when password shorter than 6 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'a@a.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('201 on success — returns user + token', async () => {
    mockPoolExecute.mockResolvedValueOnce([{ insertId: 42 }]);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'secret1' });
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(42);
    expect(typeof res.body.token).toBe('string');
  });

  it('409 on duplicate email', async () => {
    const err = new Error('Duplicate');
    err.code = 'ER_DUP_ENTRY';
    mockPoolExecute.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'dup@test.com', password: 'secret1' });
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth — login
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/auth/login', () => {
  it('401 when user not found', async () => {
    mockPoolExecute.mockResolvedValueOnce([[]]); // no rows
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Classify
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/classify', () => {
  it('401 without auth token', async () => {
    const res = await request(app).post('/api/classify');
    expect(res.status).toBe(401);
  });

  it('400 when no image attached', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No image/i);
  });

  it('200 with valid image — returns itemId/size/cleanliness/confidence', async () => {
    const token = makeToken();
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"itemId":"glass-bottle","size":"中型","cleanliness":"乾淨","confidence":0.95}'
    });
    mockPoolExecute.mockResolvedValueOnce([{ insertId: 1 }]); // classification_logs insert

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake-jpeg'), { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.itemId).toBe('glass-bottle');
    expect(res.body.confidence).toBe(0.95);
  });

  it('502 when Gemini returns no text', async () => {
    const token = makeToken();
    mockGenerateContent.mockResolvedValueOnce({ text: undefined });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake-jpeg'), { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/no text/i);
  });

  it('502 when Gemini returns invalid JSON', async () => {
    const token = makeToken();
    mockGenerateContent.mockResolvedValueOnce({ text: 'not json at all' });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake-jpeg'), { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/invalid JSON/i);
  });

  it('502 when Gemini returns unknown itemId', async () => {
    const token = makeToken();
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"itemId":"banana","size":"小型","cleanliness":"乾淨","confidence":0.5}'
    });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake-jpeg'), { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/unknown itemId/i);
  });

  it('rejects non-image file with 500', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Records — basic auth guard
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/records', () => {
  it('401 without auth token', async () => {
    const res = await request(app).post('/api/records').send({ itemId: 'pet-bottle' });
    expect(res.status).toBe(401);
  });

  it('404 when itemId not in DB', async () => {
    const token = makeToken();
    mockConn.execute.mockResolvedValueOnce([[]]); // waste_types lookup → empty
    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: 'unknown-item' });
    expect(res.status).toBe(404);
  });

  it('201 with valid itemId — returns points', async () => {
    const token = makeToken();
    const fakeWaste = {
      id: 4, item_id: 'glass-bottle', name: '玻璃瓶', material: '玻璃類',
      default_bin: '玻璃回收桶', base_points: 45,
      carbon_reduction_per_kg: 0.3, default_weight_kg: 0.25, is_recyclable: true
    };
    mockConn.execute
      .mockResolvedValueOnce([[fakeWaste]])        // SELECT waste_types
      .mockResolvedValueOnce([{ insertId: 99 }])  // INSERT recycle_records
      .mockResolvedValueOnce([{}])                 // INSERT coin_transactions
      .mockResolvedValueOnce([{}]);                // UPDATE users

    const res = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: 'glass-bottle', size: '中型', cleanliness: '乾淨' });

    expect(res.status).toBe(201);
    expect(res.body.points).toBe(45); // 45 * 1 * 1
    expect(res.body.itemId).toBe('glass-bottle');
  });
});
