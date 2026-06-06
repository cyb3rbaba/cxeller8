const express = require('express');
const { chatWithRAG } = require('../utils/rag');
const router = express.Router();

// POST /api/chat/message
router.post('/message', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const result = await chatWithRAG(message, history);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

module.exports = router;
