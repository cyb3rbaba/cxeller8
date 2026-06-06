const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getCallStats, getCalls, getAgents } = require('../utils/database');
const router = express.Router();

// GET /api/supervisor/stats
router.get('/stats', authenticate, async (req, res) => {
  const state = req.app.locals.state;

  // Live stats from memory
  const liveStats = {
    queueLength: state.callQueue.length,
    activeAgents: Array.from(state.agents.values()).filter(a => a.status !== 'offline').length,
    busyAgents: Array.from(state.agents.values()).filter(a => a.status === 'busy' || a.status === 'on-call').length,
    activeCalls: Array.from(state.activeCalls.values()).filter(c => c.status === 'active').length,
  };

  try {
    const dbStats = await getCallStats();
    res.json({ ...liveStats, ...dbStats });
  } catch {
    res.json({ ...liveStats, totalCalls: 0, avgDuration: 0, todayCalls: 0 });
  }
});

// GET /api/supervisor/queue
router.get('/queue', authenticate, (req, res) => {
  const state = req.app.locals.state;
  res.json(state.callQueue);
});

// GET /api/supervisor/active-calls
router.get('/active-calls', authenticate, (req, res) => {
  const state = req.app.locals.state;
  res.json(Array.from(state.activeCalls.values()));
});

module.exports = router;
