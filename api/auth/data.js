import * as store from '../lib/store.js';
import { sessionEmail } from '../lib/auth.js';

const MAX_BYTES = 4000000;

export default async function handler(req, res) {
  let email;
  try { email = await sessionEmail(req); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  if (!email) return res.status(401).json({ error: 'Your sign-in has expired. Sign in again.' });

  const key = 'data:' + email;
  try {
    if (req.method === 'GET') {
      const raw = await store.get(key);
      return res.json({ data: raw ? JSON.parse(raw) : null });
    }
    if (req.method === 'PUT') {
      const text = JSON.stringify({
        convos: Array.isArray(req.body?.convos) ? req.body.convos : [],
        prefs: req.body?.prefs || {},
        updated: Date.now()
      });
      if (Buffer.byteLength(text) > MAX_BYTES) return res.status(413).json({ error: 'Your chats are too large to sync. Delete some old chats.' });
      await store.set(key, text);
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: 'Use GET or PUT.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Sync failed.' });
  }
}
