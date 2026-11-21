import * as store from '../../lib/store.js';
import { sha256 } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (/^[a-f0-9]{64}$/.test(token)) await store.del('session:' + sha256(token)).catch(() => {});
  return res.json({ ok: true });
}
