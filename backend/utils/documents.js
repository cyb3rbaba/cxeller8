const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { addDocument, removeDocument } = require('../utils/rag');
const { saveDocument, getDocuments, deleteDocument, uploadFile } = require('../utils/database');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.txt') || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt, .pdf, and .docx files are supported'));
    }
  },
});

async function extractText(buffer, mimetype, filename) {
  if (mimetype === 'text/plain' || filename.endsWith('.txt') || filename.endsWith('.md')) {
    return buffer.toString('utf-8');
  }

  if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    } catch (e) {
      logger.warn('pdf-parse failed, using raw text:', e.message);
      return buffer.toString('utf-8');
    }
  }

  if (filename.endsWith('.docx')) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (e) {
      logger.warn('mammoth failed:', e.message);
      return buffer.toString('utf-8');
    }
  }

  return buffer.toString('utf-8');
}

// GET /api/documents
router.get('/', authenticate, async (req, res) => {
  try {
    const docs = await getDocuments();
    res.json(docs);
  } catch {
    res.json([]);
  }
});

// POST /api/documents - upload document for RAG
router.post('/', authenticate, upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const docId = uuidv4();
  const title = req.body.title || req.file.originalname;

  try {
    const content = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    // Add to in-memory RAG store
    addDocument(title, content, docId);

    // Try to save to Supabase storage + DB
    let fileUrl = null;
    try {
      fileUrl = await uploadFile('rag-documents', `${docId}/${req.file.originalname}`, req.file.buffer, req.file.mimetype);
    } catch (e) {
      logger.warn('Document upload to storage failed:', e.message);
    }

    const docRecord = {
      id: docId,
      title,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      file_url: fileUrl,
      content: content, // stored for RAG reload on restart
      chunk_count: Math.ceil(content.length / 500),
      created_at: new Date().toISOString(),
    };

    try {
      await saveDocument(docRecord);
    } catch (e) {
      logger.warn('Document DB save failed:', e.message);
    }

    res.status(201).json(docRecord);
  } catch (error) {
    logger.error('Document processing error:', error);
    res.status(500).json({ error: 'Failed to process document', details: error.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authenticate, async (req, res) => {
  const docId = req.params.id;
  removeDocument(docId);

  try {
    await deleteDocument(docId);
  } catch (e) {
    logger.warn('Document DB delete failed:', e.message);
  }

  res.json({ success: true, id: docId });
});

module.exports = router;
