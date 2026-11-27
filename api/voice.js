// api/voice.js: voice routes on the Vercel Edge runtime (near-zero cold start, streams responses).
// ?action= tts (Fish Audio speech, streamed), stt (Groq Whisper), llm (Groq chat, streamed), voices (Fish list).
// Keys: FISH_AUDIO_API_KEY, GROQ_API_KEY. Sign-in is required for every action.

export const config = { runtime: 'edge' };

const MOOD_TAGS = { Gentle: 'soft', Upbeat: 'excited', Serious: 'serious', Calm: '' };
const FISH_MODEL_LIST_URL = 'https://api.fish.audio/model?page_size=100&sort_by=score';
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const VERIFY_TTL_MS = 30 * 60 * 1000;

const verified = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/* A session is valid when the existing sync endpoint accepts the same bearer token. */
async function isSignedIn(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;
  const cached = verified.get(token);
  if (cached && cached > Date.now()) return true;
  try {
    const r = await fetch(`${new URL(req.url).origin}/api/data`, { headers: { Authorization: auth } });
    if (!r.ok) return false;
    verified.set(token, Date.now() + VERIFY_TTL_MS);
    return true;
  } catch {
    return false;
  }
}

async function handleTts(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return json({ error: 'Voice output is not configured on the server.' }, 500);

  const { text = '', mood = '', voiceId = '' } = (await req.json().catch(() => ({}))) || {};
  const clean = String(text).slice(0, 1000).trim();
  if (!clean) return json({ error: 'No text to speak.' }, 400);

  const tag = MOOD_TAGS[mood] || '';
  const input = tag ? `(${tag}) ${clean}` : clean;
  const chosen = /^[A-Za-z0-9_-]{1,64}$/.test(String(voiceId)) ? String(voiceId) : '';
  const reference = chosen || process.env.FISH_AUDIO_VOICE_ID || '';
  const body = { text: input, format: 'mp3', ...(reference ? { reference_id: reference } : {}) };

  try {
    const upstream = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: process.env.FISH_AUDIO_MODEL || 's2.1-pro-free' },
      body: JSON.stringify(body)
    });
    if (!upstream.ok) return json({ error: `Fish Audio returned HTTP ${upstream.status}.` }, upstream.status);
    /* Pass the audio straight through, so the browser can start playing before it is complete. */
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'Could not reach Fish Audio.' }, 502);
  }
}

async function handleVoices(req) {
  if (req.method !== 'GET') return json({ error: 'Use GET.' }, 405);
  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return json({ error: 'Voice output is not configured on the server.' }, 500);
  try {
    const upstream = await fetch(FISH_MODEL_LIST_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!upstream.ok) return json({ error: `Fish Audio returned HTTP ${upstream.status} for the voice list.` }, upstream.status);
    const data = await upstream.json();
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    return json({ voices: items.map(m => ({ id: m._id || m.id, title: m.title || m.name || 'Voice' })).filter(v => v.id) });
  } catch {
    return json({ error: 'Could not reach Fish Audio.' }, 502);
  }
}

/* Groq rate limits and server errors are worth another try: STT retries once, chat moves to a second model. */
const GROQ_LLM_FALLBACK = process.env.GROQ_LLM_FALLBACK_MODEL || 'llama-3.3-70b-versatile';
function groqRetryable(status) { return status === 429 || status >= 500; }

async function handleStt(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: 'Speech recognition is not configured on the server.' }, 500);

  const { audio = '', mime = 'audio/webm' } = (await req.json().catch(() => ({}))) || {};
  if (typeof audio !== 'string' || !audio) return json({ error: 'No audio.' }, 400);
  let bytes;
  try { bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0)); }
  catch { return json({ error: 'Audio is not valid base64.' }, 400); }
  if (!bytes.length) return json({ error: 'Empty audio.' }, 400);
  if (bytes.length > MAX_AUDIO_BYTES) return json({ error: 'Recording too long.' }, 413);

  const type = String(mime).split(';')[0] || 'audio/webm';
  const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : 'webm';
  const sendOnce = () => {
    /* A fresh FormData each attempt, since a body cannot be sent twice. */
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), `speech.${ext}`);
    form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
    form.append('response_format', 'json');
    return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form
    });
  };

  /* One retry, after a short pause, on a rate limit, server error or dropped connection. */
  let upstream = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 400));
    let r;
    try { r = await sendOnce(); } catch { continue; }
    upstream = r;
    if (r.ok || !groqRetryable(r.status)) break;
  }
  if (!upstream) return json({ error: 'Could not reach Groq.' }, 502);
  if (!upstream.ok) return json({ error: `Groq returned HTTP ${upstream.status}.` }, upstream.status);
  try {
    const data = await upstream.json();
    return json({ text: String(data.text || '').trim() });
  } catch {
    return json({ error: 'Groq sent an unreadable reply.' }, 502);
  }
}

async function handleLlm(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: 'Groq is not configured on the server.' }, 500);

  const { messages, model } = (await req.json().catch(() => ({}))) || {};
  if (!Array.isArray(messages) || !messages.length) return json({ error: 'No messages.' }, 400);
  const requested = typeof model === 'string' && /^[A-Za-z0-9._\/-]{1,80}$/.test(model) ? model : 'llama-3.1-8b-instant';
  /* If the requested model is rate limited, the second Groq model answers instead. */
  const candidates = [...new Set([requested, GROQ_LLM_FALLBACK])];

  const sendTo = id => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: id, messages: messages.slice(-30), stream: true, max_tokens: 400, temperature: 0.7 })
  });
  let upstream = null;
  for (const id of candidates) {
    let r;
    try { r = await sendTo(id); } catch { continue; }
    upstream = r;
    if (r.ok && r.body) break;
    if (!groqRetryable(r.status)) break;
  }
  if (!upstream) return json({ error: 'Could not reach Groq.' }, 502);
  if (!upstream.ok || !upstream.body) return json({ error: `Groq returned HTTP ${upstream.status}.` }, upstream.status || 502);
  return new Response(upstream.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
}

export default async function handler(req) {
  const action = new URL(req.url).searchParams.get('action');
  if (!['tts', 'voices', 'stt', 'llm'].includes(action)) return json({ error: 'Unknown voice action.' }, 404);
  if (!(await isSignedIn(req))) return json({ error: 'Sign in to use voice.' }, 401);
  if (action === 'tts') return handleTts(req);
  if (action === 'voices') return handleVoices(req);
  if (action === 'llm') return handleLlm(req);
  return handleStt(req);
}
