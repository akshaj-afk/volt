// api/stt.js: speech-to-text through Groq (Whisper). Sign-in required.
// The key is read from the server environment (GROQ_API_KEY) and never sent to the browser.
// Optional: GROQ_STT_MODEL overrides the model name.

const verified = new Map();
const VERIFY_TTL_MS = 5 * 60 * 1000;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!(await isSignedIn(req))) return res.status(401).json({ error: 'Sign in to use voice.' });

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
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Groq returned HTTP ${upstream.status}.` });
    }
    const data = await upstream.json();
    return res.status(200).json({ text: String(data.text || '').trim() });
  } catch {
    return res.status(502).json({ error: 'Could not reach Groq.' });
  }
}
