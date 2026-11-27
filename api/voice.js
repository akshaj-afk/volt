// api/voice.js: all voice routes in one serverless function (Vercel Hobby allows 12 per deployment).
// Routed by ?action= : tts (Fish Audio speech), voices (Fish Audio voice list), stt (Groq Whisper).
// Public URLs stay /api/tts, /api/voices and /api/stt through vercel.json rewrites.
// Keys live in Vercel env vars: FISH_AUDIO_API_KEY, GROQ_API_KEY. Sign-in is required for all three.

const MOOD_TAGS = { Gentle: 'soft', Upbeat: 'excited', Serious: 'serious', Calm: '' };
const FISH_MODEL_LIST_URL = 'https://api.fish.audio/model?page_size=100&sort_by=score';
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

const verified = new Map();
const VERIFY_TTL_MS = 5 * 60 * 1000;

/* A session is valid when the existing sync endpoint accepts the same bearer token. */
async function isSignedIn(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;
  const cached = verified.get(token);
  if (cached && cached > Date.now()) return true;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  try {
    const r = await fetch(`${proto}://${req.headers.host}/api/data`, { headers: { Authorization: auth } });
    if (!r.ok) return false;
    verified.set(token, Date.now() + VERIFY_TTL_MS);
    return true;
  } catch {
    return false;
  }
}

async function handleTts(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Voice output is not configured on the server.' });

  const { text = '', mood = '', voiceId = '' } = req.body || {};
  const clean = String(text).slice(0, 1000).trim();
  if (!clean) return res.status(400).json({ error: 'No text to speak.' });

  const tag = MOOD_TAGS[mood] || '';
  const input = tag ? `(${tag}) ${clean}` : clean;
  const chosen = /^[A-Za-z0-9_-]{1,64}$/.test(String(voiceId)) ? String(voiceId) : '';
  const reference = chosen || process.env.FISH_AUDIO_VOICE_ID || '';
  const body = { text: input, format: 'mp3', ...(reference ? { reference_id: reference } : {}) };

  try {
    const upstream = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: process.env.FISH_AUDIO_MODEL || 's2.1-pro-free'
      },
      body: JSON.stringify(body)
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Fish Audio returned HTTP ${upstream.status}.` });
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch {
    return res.status(502).json({ error: 'Could not reach Fish Audio.' });
  }
}

async function handleVoices(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Voice output is not configured on the server.' });
  try {
    const upstream = await fetch(FISH_MODEL_LIST_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Fish Audio returned HTTP ${upstream.status} for the voice list.` });
    const data = await upstream.json();
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    const voices = items.map(m => ({ id: m._id || m.id, title: m.title || m.name || 'Voice' })).filter(v => v.id);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ voices });
  } catch {
    return res.status(502).json({ error: 'Could not reach Fish Audio.' });
  }
}

async function handleStt(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Speech recognition is not configured on the server.' });

  const { audio = '', mime = 'audio/webm' } = req.body || {};
  if (typeof audio !== 'string' || !audio) return res.status(400).json({ error: 'No audio.' });
  const bytes = Buffer.from(audio, 'base64');
  if (!bytes.length) return res.status(400).json({ error: 'Empty audio.' });
  if (bytes.length > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Recording too long.' });

  const type = String(mime).split(';')[0] || 'audio/webm';
  const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), `speech.${ext}`);
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'json');

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Groq returned HTTP ${upstream.status}.` });
    const data = await upstream.json();
    return res.status(200).json({ text: String(data.text || '').trim() });
  } catch {
    return res.status(502).json({ error: 'Could not reach Groq.' });
  }
}

async function handleLlm(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Groq is not configured on the server.' });

  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'No messages.' });
  const id = typeof model === 'string' && /^[A-Za-z0-9._\/-]{1,80}$/.test(model) ? model : 'llama-3.1-8b-instant';

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: id, messages: messages.slice(-30), stream: true, max_tokens: 400, temperature: 0.7 })
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).json({ error: `Groq returned HTTP ${upstream.status}.` });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200);
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    return res.end();
  } catch {
    if (!res.headersSent) return res.status(502).json({ error: 'Could not reach Groq.' });
    return res.end();
  }
}

export default async function handler(req, res) {
  const action = (req.query && req.query.action) || new URL(req.url, 'http://localhost').searchParams.get('action');
  if (!['tts', 'voices', 'stt', 'llm'].includes(action)) return res.status(404).json({ error: 'Unknown voice action.' });
  if (!(await isSignedIn(req))) return res.status(401).json({ error: 'Sign in to use voice.' });
  if (action === 'tts') return handleTts(req, res);
  if (action === 'voices') return handleVoices(req, res);
  if (action === 'llm') return handleLlm(req, res);
  return handleStt(req, res);
}
