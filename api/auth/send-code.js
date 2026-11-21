import * as store from '../../lib/store.js';
import { normEmail, validEmail, codeHash, newCode, sendCodeEmail } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const email = normEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    if (await store.get('otp-wait:' + email)) return res.status(429).json({ error: 'Wait a minute before asking for another code.' });
    const sent = await store.incr('otp-sent:' + email);
    if (sent === 1) await store.expire('otp-sent:' + email, 3600);
    if (sent > 6) return res.status(429).json({ error: 'Too many codes requested for this email. Try again in an hour.' });
    const code = newCode();
    await sendCodeEmail(email, code);
    await store.set('otp:' + email, JSON.stringify({ hash: codeHash(email, code), tries: 0 }), 600);
    await store.set('otp-wait:' + email, '1', 60);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not send the code.' });
  }
}
