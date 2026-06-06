require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const callRoutes = require('./routes/calls');
const agentRoutes = require('./routes/agents');
const supervisorRoutes = require('./routes/supervisor');
const documentsRoutes = require('./routes/documents');

const app = express();
const server = http.createServer(app);

// ── Socket.io setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // handled by frontend separately
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ── REST Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/documents', documentsRoutes);

// ── Serve frontend pages ─────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/customer/index.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, '../frontend/customer/index.html')));
app.get('/agent', (req, res) => res.sendFile(path.join(__dirname, '../frontend/agent/index.html')));
app.get('/supervisor', (req, res) => res.sendFile(path.join(__dirname, '../frontend/supervisor/index.html')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ICE server config endpoint
app.get('/api/ice-servers', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: process.env.TURN_SERVER_URL || 'turn:openrelay.metered.ca:80',
        username: process.env.TURN_USERNAME || 'openrelayproject',
        credential: process.env.TURN_CREDENTIAL || 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: process.env.TURN_USERNAME || 'openrelayproject',
        credential: process.env.TURN_CREDENTIAL || 'openrelayproject',
      },
    ],
  });
});

// ── In-memory state (replace with Redis in production) ───────────────────────
const state = {
  agents: new Map(),        // socketId -> agentInfo
  customers: new Map(),     // socketId -> customerInfo
  callQueue: [],            // pending call requests
  activeCalls: new Map(),   // callId -> callInfo
  chatSessions: new Map(),  // sessionId -> chatInfo
};

// Export state for routes
app.locals.state = state;
app.locals.io = io;

// ── WebRTC Signaling via Socket.io ───────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // ── Role registration ──────────────────────────────────────────────────────
  socket.on('register:customer', (data) => {
    const sessionId = uuidv4();
    state.customers.set(socket.id, {
      socketId: socket.id,
      sessionId,
      name: data.name || 'Customer',
      joinedAt: new Date(),
    });
    socket.join('customers');
    socket.emit('registered', { sessionId, role: 'customer' });
    logger.info(`Customer registered: ${socket.id}`);
  });

  socket.on('register:agent', (data) => {
    state.agents.set(socket.id, {
      socketId: socket.id,
      agentId: data.agentId,
      name: data.name,
      status: 'available',
      currentCall: null,
      joinedAt: new Date(),
    });
    socket.join('agents');
    socket.join(`agent:${data.agentId}`);
    broadcastAgentList();
    socket.emit('registered', { role: 'agent' });
    // Send pending queue
    socket.emit('queue:update', state.callQueue);
    logger.info(`Agent registered: ${data.name} (${socket.id})`);
  });

  socket.on('register:supervisor', (data) => {
    socket.join('supervisors');
    socket.emit('registered', { role: 'supervisor' });
    // Send current state snapshot
    socket.emit('state:snapshot', {
      agents: Array.from(state.agents.values()),
      queue: state.callQueue,
      activeCalls: Array.from(state.activeCalls.values()),
    });
    logger.info(`Supervisor connected: ${socket.id}`);
  });

  // ── Chat signaling ─────────────────────────────────────────────────────────
  socket.on('chat:request', (data) => {
    const customer = state.customers.get(socket.id);
    if (!customer) return;

    const chatSession = {
      id: uuidv4(),
      customerId: socket.id,
      customerName: customer.name,
      agentId: null,
      type: 'chat',
      status: 'queued',
      createdAt: new Date(),
      messages: [],
    };
    state.chatSessions.set(chatSession.id, chatSession);
    state.callQueue.push({ ...chatSession, socketId: socket.id });

    socket.emit('chat:queued', { sessionId: chatSession.id, position: state.callQueue.length });
    io.to('agents').emit('queue:update', state.callQueue);
    io.to('supervisors').emit('queue:update', state.callQueue);
    logger.info(`Chat queued: ${chatSession.id}`);
  });

  socket.on('chat:accept', ({ sessionId }) => {
    const agent = state.agents.get(socket.id);
    if (!agent) return;

    const queueIndex = state.callQueue.findIndex(q => q.id === sessionId);
    if (queueIndex === -1) return;

    const session = state.callQueue.splice(queueIndex, 1)[0];
    session.agentId = socket.id;
    session.status = 'active';
    session.acceptedAt = new Date();
    state.chatSessions.set(session.id, session);

    agent.status = 'busy';
    agent.currentCall = sessionId;
    state.agents.set(socket.id, agent);

    socket.join(`chat:${sessionId}`);
    io.to(session.customerId).socketsJoin(`chat:${sessionId}`);

    io.to(session.customerId).emit('chat:connected', {
      sessionId,
      agentName: agent.name,
    });
    socket.emit('chat:connected', {
      sessionId,
      customerName: session.customerName,
    });

    io.to('agents').emit('queue:update', state.callQueue);
    io.to('supervisors').emit('queue:update', state.callQueue);
    broadcastAgentList();
    logger.info(`Chat accepted: ${sessionId} by agent ${agent.name}`);
  });

  socket.on('chat:message', ({ sessionId, message, sender }) => {
    const session = state.chatSessions.get(sessionId);
    if (!session) return;

    const msg = { id: uuidv4(), text: message, sender, timestamp: new Date() };
    session.messages.push(msg);
    io.to(`chat:${sessionId}`).emit('chat:message', msg);
  });

  socket.on('chat:end', ({ sessionId }) => {
    const session = state.chatSessions.get(sessionId);
    if (!session) return;
    session.status = 'ended';
    session.endedAt = new Date();
    io.to(`chat:${sessionId}`).emit('chat:ended', { sessionId });

    // Free agent
    if (session.agentId) {
      const agent = state.agents.get(session.agentId);
      if (agent) {
        agent.status = 'available';
        agent.currentCall = null;
        state.agents.set(session.agentId, agent);
        broadcastAgentList();
      }
    }
  });

  // ── WebRTC Voice Call signaling ────────────────────────────────────────────
  socket.on('call:request', (data) => {
    const customer = state.customers.get(socket.id);
    if (!customer) return;

    const callId = uuidv4();
    const callInfo = {
      id: callId,
      customerId: socket.id,
      customerName: customer.name,
      agentId: null,
      type: 'voice',
      status: 'queued',
      createdAt: new Date(),
      duration: 0,
    };
    state.callQueue.push(callInfo);
    state.activeCalls.set(callId, callInfo);

    socket.emit('call:queued', { callId, position: state.callQueue.length });
    io.to('agents').emit('queue:update', state.callQueue);
    io.to('supervisors').emit('queue:update', state.callQueue);
    logger.info(`Voice call queued: ${callId}`);
  });

  socket.on('call:accept', ({ callId }) => {
    const agent = state.agents.get(socket.id);
    if (!agent) return;

    const queueIndex = state.callQueue.findIndex(q => q.id === callId);
    if (queueIndex === -1) return;

    const callInfo = state.callQueue.splice(queueIndex, 1)[0];
    callInfo.agentId = socket.id;
    callInfo.status = 'connecting';
    callInfo.acceptedAt = new Date();
    state.activeCalls.set(callId, callInfo);

    agent.status = 'on-call';
    agent.currentCall = callId;
    state.agents.set(socket.id, agent);

    socket.join(`call:${callId}`);
    io.to(callInfo.customerId).socketsJoin(`call:${callId}`);

    io.to(callInfo.customerId).emit('call:accepted', { callId, agentName: agent.name });
    socket.emit('call:initiate', { callId, customerSocketId: callInfo.customerId });

    io.to('agents').emit('queue:update', state.callQueue);
    io.to('supervisors').emit('queue:update', state.callQueue);
    broadcastAgentList();
    logger.info(`Call accepted: ${callId} by ${agent.name}`);
  });

  // WebRTC offer/answer/ICE exchange
  socket.on('webrtc:offer', ({ callId, offer, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc:offer', { callId, offer, fromSocketId: socket.id });
  });

  socket.on('webrtc:answer', ({ callId, answer, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc:answer', { callId, answer });
  });

  socket.on('webrtc:ice-candidate', ({ callId, candidate, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc:ice-candidate', { callId, candidate });
  });

  socket.on('call:active', ({ callId }) => {
    const callInfo = state.activeCalls.get(callId);
    if (callInfo) {
      callInfo.status = 'active';
      callInfo.startedAt = new Date();
    }
    io.to('supervisors').emit('call:updated', callInfo);
  });

  socket.on('call:hold', ({ callId, onHold }) => {
    const callInfo = state.activeCalls.get(callId);
    if (callInfo) callInfo.onHold = onHold;
    io.to(`call:${callId}`).emit('call:hold', { callId, onHold });
    io.to('supervisors').emit('call:updated', callInfo);
  });

  socket.on('call:end', ({ callId }) => {
    const callInfo = state.activeCalls.get(callId);
    if (callInfo) {
      callInfo.status = 'ended';
      callInfo.endedAt = new Date();
      callInfo.duration = callInfo.startedAt
        ? Math.floor((new Date() - new Date(callInfo.startedAt)) / 1000)
        : 0;
    }

    io.to(`call:${callId}`).emit('call:ended', { callId });

    // Free agent
    if (callInfo?.agentId) {
      const agent = state.agents.get(callInfo.agentId);
      if (agent) {
        agent.status = 'available';
        agent.currentCall = null;
        state.agents.set(callInfo.agentId, agent);
        broadcastAgentList();
      }
    }

    io.to('supervisors').emit('call:ended', callInfo);
    logger.info(`Call ended: ${callId}`);
  });

  socket.on('call:reject', ({ callId }) => {
    const queueIndex = state.callQueue.findIndex(q => q.id === callId);
    if (queueIndex > -1) state.callQueue.splice(queueIndex, 1);

    const callInfo = state.activeCalls.get(callId);
    if (callInfo) {
      io.to(callInfo.customerId).emit('call:rejected', { callId });
    }

    io.to('agents').emit('queue:update', state.callQueue);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (state.agents.has(socket.id)) {
      const agent = state.agents.get(socket.id);
      state.agents.delete(socket.id);
      broadcastAgentList();
      logger.info(`Agent disconnected: ${agent.name}`);
    }
    if (state.customers.has(socket.id)) {
      state.customers.delete(socket.id);
    }
    logger.info(`Socket disconnected: ${socket.id}`);
  });

  // ── Agent status update ────────────────────────────────────────────────────
  socket.on('agent:status', ({ status }) => {
    const agent = state.agents.get(socket.id);
    if (agent) {
      agent.status = status;
      state.agents.set(socket.id, agent);
      broadcastAgentList();
    }
  });
});

function broadcastAgentList() {
  const agentList = Array.from(state.agents.values()).map(a => ({
    socketId: a.socketId,
    agentId: a.agentId,
    name: a.name,
    status: a.status,
    currentCall: a.currentCall,
  }));
  io.to('supervisors').emit('agents:update', agentList);
  io.to('agents').emit('agents:update', agentList);
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`🚀 CallCenter server running on port ${PORT}`);
  logger.info(`📡 WebRTC signaling active`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
