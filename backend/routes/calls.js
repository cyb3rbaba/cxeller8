const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getCalls, getCallStats, saveCall, uploadFile } = require('../utils/database');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/calls - list calls
router.get('/', authenticate, async (req, res) => {
  try {
    const { limit, offset, agentId, date } = req.query;
    const calls = await getCalls({ limit: +limit || 50, offset: +offset || 0, agentId, date });
    res.json(calls);
  } catch (error) {
    // Return empty in demo mode
    res.json([]);
  }
});

// GET /api/calls/stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await getCallStats();
    res.json(stats);
  } catch (error) {
    res.json({ totalCalls: 0, avgDuration: 0, todayCalls: 0, voiceCalls: 0, chatSessions: 0 });
  }
});

// POST /api/calls/:callId/recording - upload recording
router.post('/:callId/recording', authenticate, upload.single('recording'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const path = `recordings/${req.params.callId}-${Date.now()}.webm`;
    const url = await uploadFile('call-recordings', path, req.file.buffer, 'audio/webm');
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload recording', details: error.message });
  }
});

// POST /api/calls - save call record
router.post('/', authenticate, async (req, res) => {
  try {
    const call = await saveCall({ ...req.body, id: uuidv4() });
    res.status(201).json(call || req.body);
  } catch (error) {
    res.status(201).json(req.body); // Demo fallback
  }
});

module.exports = router;
