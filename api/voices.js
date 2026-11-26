// api/voices.js: lists the Fish Audio voices available to this account. Sign-in required.

// Fish Audio's voice (model) listing endpoint. Verify against their API reference if the list comes back empty.
const FISH_MODEL_LIST_URL = 'https://api.fish.audio/model?page_size=100&sort_by=score';

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  if (!(await isSignedIn(req))) return res.status(401).json({ error: 'Sign in to choose a voice.' });

  const key = process.env.FISH_AUDIO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Voice output is not configured on the server.' });

  try {
    const upstream = await fetch(FISH_MODEL_LIST_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Fish Audio returned HTTP ${upstream.status} for the voice list.` });
    const data = await upstream.json();
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    const voices = items
      .map(m => ({ id: m._id || m.id, title: m.title || m.name || 'Voice' }))
      .filter(v => v.id);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ voices });
  } catch {
    return res.status(502).json({ error: 'Could not reach Fish Audio.' });
  }
}
