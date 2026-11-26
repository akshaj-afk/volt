// api/tts.js: text-to-speech through Fish Audio. Sign-in required.
// The key is read from the server environment (FISH_AUDIO_API_KEY) and never sent to the browser.
// The voice comes from the request (chosen in the app). FISH_AUDIO_VOICE_ID is the fallback default.

const MOOD_TAGS = { Gentle: 'soft', Upbeat: 'excited', Serious: 'serious', Calm: '' };

const verified = new Map();
const VERIFY_TTL_MS = 5 * 60 * 1000;

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

  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Voice output is not configured on the server.' });

  const { text = '', mood = '', voiceId = '' } = req.body || {};
  const clean = String(text).slice(0, 1000).trim();
  if (!clean) return res.status(400).json({ error: 'No text to speak.' });

  const tag = MOOD_TAGS[mood] || '';
  const input = tag ? `(${tag}) ${clean}` : clean;

  // Accept only plausible voice IDs, so the request cannot carry arbitrary values.
  const chosen = /^[A-Za-z0-9_-]{1,64}$/.test(String(voiceId)) ? String(voiceId) : '';
  const reference = chosen || process.env.FISH_AUDIO_VOICE_ID || '';

  const body = { text: input, format: 'mp3', ...(reference ? { reference_id: reference } : {}) };

  try {
    const upstream = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 's1' },
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
