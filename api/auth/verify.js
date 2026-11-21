import * as store from '../../lib/store.js';
import { normEmail, validEmail, codeHash, sameText, newToken, sha256 } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter your email and the 6-digit code.' });
  try {
    const raw = await store.get('otp:' + email);
    if (!raw) return res.status(400).json({ error: 'That code has expired or was never sent. Request a new one.' });
    const record = JSON.parse(raw);
    if (record.tries >= 5) {
      await store.del('otp:' + email);
      return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    }
    if (!sameText(record.hash, codeHash(email, code))) {
      record.tries += 1;
      await store.set('otp:' + email, JSON.stringify(record), 600);
      return res.status(400).json({ error: 'That code is not right. Check the email and try again.' });
    }
    await store.del('otp:' + email);
    const token = newToken();
    await store.set('session:' + sha256(token), email, 60 * 60 * 24 * 30);
    return res.json({ token, email });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not verify the code.' });
  }
}
