-- ============================================================
-- NEXUS CALL CENTER — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Agents table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'agent',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Calls table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT REFERENCES agents(id),
  customer_name TEXT,
  type TEXT CHECK (type IN ('voice', 'chat')) DEFAULT 'voice',
  status TEXT DEFAULT 'ended',
  duration INTEGER DEFAULT 0,  -- seconds
  recording_url TEXT,
  on_hold BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- ── Documents table (RAG knowledge base) ──────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  filename TEXT,
  mimetype TEXT,
  size INTEGER,
  file_url TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Chat sessions table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id TEXT REFERENCES agents(id),
  customer_name TEXT,
  status TEXT DEFAULT 'ended',
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ── Storage buckets ───────────────────────────────────────────
-- Run these in Supabase dashboard > Storage > Create bucket:
-- 1. "call-recordings" — public: false
-- 2. "rag-documents"   — public: false

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by backend)
CREATE POLICY "service_role_all_agents" ON agents FOR ALL USING (true);
CREATE POLICY "service_role_all_calls" ON calls FOR ALL USING (true);
CREATE POLICY "service_role_all_documents" ON documents FOR ALL USING (true);
CREATE POLICY "service_role_all_chats" ON chat_sessions FOR ALL USING (true);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_type ON calls(type);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

-- ── Seed demo agents ──────────────────────────────────────────
INSERT INTO agents (id, name, email, role, active)
VALUES
  ('agent-1', 'Alice Johnson', 'alice@callcenter.com', 'agent', true),
  ('agent-2', 'Bob Smith', 'bob@callcenter.com', 'agent', true),
  ('supervisor-1', 'Carol Davis', 'supervisor@callcenter.com', 'supervisor', true)
ON CONFLICT (id) DO NOTHING;
