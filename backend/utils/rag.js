const logger = require('./logger');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';

// In-memory document store (replace with vector DB for production)
const documentStore = [];

// Simple TF-IDF style retrieval
function tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

function computeSimilarity(queryTokens, docTokens) {
  const docSet = new Set(docTokens);
  const matches = queryTokens.filter(t => docSet.has(t)).length;
  return matches / (queryTokens.length + 1);
}

function retrieveRelevantChunks(query, topK = 3) {
  if (documentStore.length === 0) return [];

  const queryTokens = tokenize(query);

  const scored = documentStore.map(doc => ({
    ...doc,
    score: computeSimilarity(queryTokens, doc.tokens),
  }));

  return scored
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(d => ({ title: d.title, chunk: d.chunk, score: d.score }));
}

function addDocument(title, content, docId) {
  // Split into chunks of ~500 chars
  const chunkSize = 500;
  const sentences = content.split(/[.!?]+/).filter(Boolean);
  let currentChunk = '';

  sentences.forEach(sentence => {
    if ((currentChunk + sentence).length > chunkSize && currentChunk) {
      documentStore.push({
        docId,
        title,
        chunk: currentChunk.trim(),
        tokens: tokenize(currentChunk),
      });
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  });

  if (currentChunk.trim()) {
    documentStore.push({
      docId,
      title,
      chunk: currentChunk.trim(),
      tokens: tokenize(currentChunk),
    });
  }

  logger.info(`RAG: Added ${documentStore.filter(d => d.docId === docId).length} chunks for "${title}"`);
}

function removeDocument(docId) {
  const before = documentStore.length;
  const idx = documentStore.reduce((acc, d, i) => {
    if (d.docId === docId) acc.push(i);
    return acc;
  }, []);
  idx.reverse().forEach(i => documentStore.splice(i, 1));
  logger.info(`RAG: Removed ${before - documentStore.length} chunks for docId ${docId}`);
}

async function chatWithRAG(userMessage, conversationHistory = []) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      message: "I'm sorry, the AI service is not configured. Please contact an agent for assistance.",
      escalate: false,
      usedRAG: false,
    };
  }

  // Retrieve relevant context
  const chunks = retrieveRelevantChunks(userMessage);
  const hasContext = chunks.length > 0;

  const systemPrompt = `You are a helpful customer support assistant. Be concise and friendly.
${hasContext ? `\nRelevant information from our knowledge base:\n${chunks.map(c => `[${c.title}]: ${c.chunk}`).join('\n\n')}` : ''}

If you cannot answer the question with the available information, respond with:
{"escalate": true, "message": "I'd like to connect you with a live agent who can better help you. Would you prefer live chat or a voice call?"}

Otherwise respond normally as plain text (not JSON).`;

  const messages = [
    ...conversationHistory.slice(-6), // Keep last 6 messages for context
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq API error');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // Check if bot wants to escalate
    try {
      const parsed = JSON.parse(content);
      if (parsed.escalate) {
        return { message: parsed.message, escalate: true, usedRAG: hasContext };
      }
    } catch {
      // Not JSON, normal response
    }

    return { message: content, escalate: false, usedRAG: hasContext };
  } catch (error) {
    logger.error('Groq API error:', error);
    return {
      message: "I'm having trouble processing your request. Would you like to speak with a live agent?",
      escalate: false,
      usedRAG: false,
      error: error.message,
    };
  }
}

module.exports = { chatWithRAG, addDocument, removeDocument, documentStore };
