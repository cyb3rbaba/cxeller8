const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAgents } = require('../utils/database');
const router = express.Router();

// GET /api/agents
router.get('/', authenticate, async (req, res) => {
  try {
    const agents = await getAgents();
    res.json(agents);
  } catch {
    res.json([
      { id: 'agent-1', name: 'Alice Johnson', email: 'alice@callcenter.com', active: true },
      { id: 'agent-2', name: 'Bob Smith', email: 'bob@callcenter.com', active: true },
    ]);
  }
});

// GET /api/agents/live - live status from socket state
router.get('/live', authenticate, (req, res) => {
  const state = req.app.locals.state;
  const agents = Array.from(state.agents.values()).map(a => ({
    socketId: a.socketId,
    agentId: a.agentId,
    name: a.name,
    status: a.status,
    currentCall: a.currentCall,
    joinedAt: a.joinedAt,
  }));
  res.json(agents);
});

module.exports = router;
