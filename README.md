# 🎧 Nexus Call Center Platform

A full-stack, WebRTC-based call center platform with AI-powered chatbot, live chat, voice calls, and supervisor analytics — built entirely on **free services**.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    NEXUS CALL CENTER                     │
├─────────────────┬────────────────────┬───────────────────┤
│  Customer Page  │    Agent Console   │  Supervisor Dash  │
│  (HTML/CSS/JS)  │   (HTML/CSS/JS)    │  (HTML/CSS/JS)    │
└────────┬────────┴─────────┬──────────┴─────────┬─────────┘
         │                  │                    │
         └──────────────────┼────────────────────┘
                            │ WebSocket (Socket.io)
                     ┌──────▼──────┐
                     │  Node.js    │
                     │  Express    │
                     │  Server     │
                     └──────┬──────┘
              ┌─────────────┼────────────────┐
              │             │                │
        ┌─────▼───┐  ┌──────▼──────┐  ┌─────▼──────┐
        │ Groq AI │  │  Supabase   │  │  WebRTC    │
        │ (Free)  │  │  DB+Storage │  │  STUN/TURN │
        └─────────┘  └─────────────┘  └────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Free accounts: [Groq](https://console.groq.com), [Supabase](https://supabase.com)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/nexus-callcenter
cd nexus-callcenter/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
GROQ_API_KEY=gsk_...        # From console.groq.com (free)
SUPABASE_URL=https://...    # From supabase.com project settings
SUPABASE_SERVICE_KEY=...    # From supabase.com > Settings > API
JWT_SECRET=your-random-64-char-string
```

### 3. Set Up Database

In your Supabase dashboard → SQL Editor, run the contents of `backend/supabase-schema.sql`.

Also create two storage buckets in Supabase → Storage:
- `call-recordings` (private)
- `rag-documents` (private)

### 4. Start the Backend

```bash
cd backend
npm run dev
```

### 5. Open the Pages

- **Customer**: Open `frontend/customer/index.html` in browser
- **Agent**: Open `frontend/agent/index.html` — Login: `alice@callcenter.com` / `agent123`
- **Supervisor**: Open `frontend/supervisor/index.html` — Login: `supervisor@callcenter.com` / `super123`

> For local testing: update `API_URL` in each HTML file from `https://your-render-app.onrender.com` to `http://localhost:3001`.

---

## 🌐 Deployment on Render (Free)

### Backend

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo, set:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Runtime**: Node
4. Add environment variables from `.env.example`

### Frontend Pages

For each frontend page (customer, agent, supervisor):
1. Render → New → Static Site
2. Connect repo
3. Set **Publish directory**: `frontend/customer` (or `agent` / `supervisor`)
4. Update `API_URL` in each HTML to your backend Render URL

### Or use `render.yaml`

Push the `render.yaml` to your repo root and Render will auto-configure all services.

---

## 📡 Free Services Used

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Groq](https://console.groq.com) | LLM for chatbot (Llama 3) | 14,400 req/day |
| [Supabase](https://supabase.com) | Database + File storage | 500MB DB, 1GB storage |
| [Open Relay](https://openrelay.metered.ca) | WebRTC TURN server | Free public TURN |
| [Render](https://render.com) | Backend hosting | 750 hrs/month |
| [Google STUN](https://stun.l.google.com) | WebRTC STUN | Unlimited |

---

## 🎯 Feature Summary

### Customer Page
- **AI Chatbot** powered by Groq (Llama 3) with RAG from uploaded documents
- **Escalation** to live chat or voice call when bot can't answer
- **Live Chat** with real-time messaging via WebSocket
- **Voice Call** using WebRTC peer-to-peer audio
- Automatic microphone permission handling

### Agent Console
- **Secure login** with JWT authentication
- **Live queue** showing incoming chat/voice requests
- **10-second accept window** with notification
- **Call controls**: Mute, Hold, End
- **Live chat interface** with real-time messaging
- **Session statistics**: calls handled, avg duration, chat count
- **Call recording** uploaded to Supabase storage
- Status management (Available / Busy / Break)

### Supervisor Dashboard
- **Real-time stats**: queue depth, active agents, call volume
- **Live monitor**: all connected agents and active calls
- **Agent management**: create new agents without payment
- **Knowledge base**: upload/delete documents for RAG
- **Call recordings**: review recorded calls
- **Hourly call volume** chart (live data when DB connected)

---

## 🔒 Security

- **JWT authentication** for agents and supervisors
- **HTTPS/WSS** enforced via Render SSL (Let's Encrypt)
- **Rate limiting** on all API endpoints (200 req/15min)
- **Helmet.js** for HTTP security headers
- **CORS** configured for specific frontend origins
- **Input validation** on all endpoints
- **WebRTC**: peer-to-peer encrypted audio (DTLS/SRTP)

---

## 🧪 Testing

```bash
cd backend
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

Tests cover: auth, chat API, calls API, documents API, health check.

CI/CD via GitHub Actions runs on every push to `main`.

---

## 📁 Project Structure

```
nexus-callcenter/
├── backend/
│   ├── server.js              # Main server + Socket.io signaling
│   ├── routes/
│   │   ├── auth.js            # Login, agent creation
│   │   ├── chat.js            # Groq RAG chatbot
│   │   ├── calls.js           # Call management + recordings
│   │   ├── agents.js          # Agent listing
│   │   ├── supervisor.js      # Dashboard stats
│   │   └── documents.js       # RAG document upload/delete
│   ├── utils/
│   │   ├── rag.js             # Groq + TF-IDF retrieval
│   │   ├── database.js        # Supabase client + helpers
│   │   └── logger.js          # Winston logging
│   ├── middleware/
│   │   └── auth.js            # JWT middleware
│   ├── __tests__/
│   │   └── api.test.js        # API tests
│   ├── supabase-schema.sql    # Database setup
│   └── .env.example           # Environment template
├── frontend/
│   ├── customer/index.html    # Customer chatbot + WebRTC
│   ├── agent/index.html       # Agent console
│   └── supervisor/index.html  # Supervisor dashboard
├── .github/
│   └── workflows/ci.yml       # GitHub Actions CI
├── render.yaml                # Render deployment config
└── README.md
```

---

## 🔮 Future Enhancements

- **Sentiment analysis** via Groq on chat transcripts
- **Multilingual support** using Groq's multilingual models
- **Vector database** (Supabase pgvector) for better RAG
- **Customer feedback** forms after calls
- **Agent performance scoring** with leaderboard
- **SIP integration** for PSTN calls via Twilio/Telnyx
- **Screen sharing** via WebRTC `getDisplayMedia`
- **Whisper transcription** for call recordings

---

## 📝 License

MIT — Free to use, modify, and deploy.
