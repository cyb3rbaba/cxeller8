const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken, authenticate } = require('../middleware/auth');
const { saveAgent, getAgents, getSupabase } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Demo agent credentials (in production, use Supabase auth)
const DEMO_AGENTS = [
  { id: 'agent-1', name: 'Alice Johnson', email: 'alice@callcenter.com', password: 'agent123', role: 'agent' },
  { id: 'agent-2', name: 'Bob Smith', email: 'bob@callcenter.com', password: 'agent123', role: 'agent' },
];

const DEMO_SUPERVISOR = {
  id: 'supervisor-1', name: 'Carol Davis', email: 'supervisor@callcenter.com',
  password: 'super123', role: 'supervisor',
};

const ALL_USERS = [...DEMO_AGENTS, DEMO_SUPERVISOR];

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = ALL_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

// POST /api/auth/agent (supervisor creates new agent)
router.post('/agent', authenticate, async (req, res) => {
  if (req.user.role !== 'supervisor') {
    return res.status(403).json({ error: 'Only supervisors can create agents' });
  }
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password required' });
  }

  const newAgent = {
    id: `agent-${uuidv4().slice(0, 8)}`,
    name,
    email,
    role: 'agent',
    active: true,
    created_at: new Date().toISOString(),
  };

  // Save to Supabase if available
  try {
    await saveAgent(newAgent);
  } catch (e) {
    // Continue without DB in demo mode
  }

  DEMO_AGENTS.push({ ...newAgent, password });
  ALL_USERS.push({ ...newAgent, password });

  res.status(201).json({ agent: { id: newAgent.id, name: newAgent.name, email: newAgent.email } });
});

module.exports = router;
