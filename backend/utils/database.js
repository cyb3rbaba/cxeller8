const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn('⚠️  Supabase credentials not set — DB features disabled');
      return null;
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function saveCall(callData) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from('calls').insert(callData).select().single();
  if (error) throw error;
  return data;
}

async function updateCall(callId, updates) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from('calls').update(updates).eq('id', callId).select().single();
  if (error) throw error;
  return data;
}

async function getCalls({ limit = 50, offset = 0, agentId, date } = {}) {
  const db = getSupabase();
  if (!db) return [];
  let query = db.from('calls').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (agentId) query = query.eq('agent_id', agentId);
  if (date) query = query.gte('created_at', date);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getCallStats() {
  const db = getSupabase();
  if (!db) return { totalCalls: 0, avgDuration: 0, todayCalls: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [allCalls, todayCalls] = await Promise.all([
    db.from('calls').select('duration, type, status'),
    db.from('calls').select('id').gte('created_at', today.toISOString()),
  ]);

  const calls = allCalls.data || [];
  const avgDuration = calls.length
    ? Math.round(calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length)
    : 0;

  return {
    totalCalls: calls.length,
    avgDuration,
    todayCalls: (todayCalls.data || []).length,
    voiceCalls: calls.filter(c => c.type === 'voice').length,
    chatSessions: calls.filter(c => c.type === 'chat').length,
  };
}

async function saveAgent(agentData) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from('agents').upsert(agentData).select().single();
  if (error) throw error;
  return data;
}

async function getAgents() {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from('agents').select('*').eq('active', true);
  if (error) throw error;
  return data || [];
}

async function saveDocument(docData) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.from('documents').insert(docData).select().single();
  if (error) throw error;
  return data;
}

async function getDocuments() {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from('documents').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deleteDocument(docId) {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from('documents').delete().eq('id', docId);
  if (error) throw error;
}

async function uploadFile(bucket, path, buffer, contentType) {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = db.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

module.exports = {
  getSupabase,
  saveCall, updateCall, getCalls, getCallStats,
  saveAgent, getAgents,
  saveDocument, getDocuments, deleteDocument,
  uploadFile,
};
