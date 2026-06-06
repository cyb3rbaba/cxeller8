const request = require('supertest');
const { app } = require('../server');

// Mock Supabase
jest.mock('../utils/database', () => ({
  getSupabase: () => null,
  saveCall: jest.fn(),
  getCalls: jest.fn().mockResolvedValue([]),
  getCallStats: jest.fn().mockResolvedValue({ totalCalls: 5, avgDuration: 120, todayCalls: 2 }),
  saveAgent: jest.fn(),
  getAgents: jest.fn().mockResolvedValue([{ id: 'agent-1', name: 'Alice', email: 'alice@test.com', active: true }]),
  saveDocument: jest.fn(),
  getDocuments: jest.fn().mockResolvedValue([]),
  deleteDocument: jest.fn(),
  uploadFile: jest.fn().mockResolvedValue('https://example.com/file.pdf'),
}));

jest.mock('../utils/rag', () => ({
  chatWithRAG: jest.fn().mockResolvedValue({ message: 'Hello!', escalate: false, usedRAG: false }),
  addDocument: jest.fn(),
  removeDocument: jest.fn(),
  documentStore: [],
}));

let authToken;

describe('Auth Routes', () => {
  test('POST /api/auth/login - valid agent credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@callcenter.com', password: 'agent123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('agent');
    authToken = res.body.token;
  });

  test('POST /api/auth/login - invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@callcenter.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/auth/me - authenticated', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@callcenter.com', password: 'agent123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
  });
});

describe('Chat Routes', () => {
  test('POST /api/chat/message - sends message to RAG', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .send({ message: 'Hello, I need help', history: [] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('escalate');
  });

  test('POST /api/chat/message - empty message returns 400', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .send({ message: '', history: [] });

    expect(res.status).toBe(400);
  });
});

describe('Calls Routes', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@callcenter.com', password: 'agent123' });
    token = res.body.token;
  });

  test('GET /api/calls - requires auth', async () => {
    const res = await request(app).get('/api/calls');
    expect(res.status).toBe(401);
  });

  test('GET /api/calls - authenticated', async () => {
    const res = await request(app)
      .get('/api/calls')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/calls/stats', async () => {
    const res = await request(app)
      .get('/api/calls/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCalls');
  });
});

describe('Documents Routes', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'supervisor@callcenter.com', password: 'super123' });
    token = res.body.token;
  });

  test('GET /api/documents - returns array', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Health Check', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('ICE Servers', () => {
  test('GET /api/ice-servers', async () => {
    const res = await request(app).get('/api/ice-servers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('iceServers');
    expect(Array.isArray(res.body.iceServers)).toBe(true);
  });
});
