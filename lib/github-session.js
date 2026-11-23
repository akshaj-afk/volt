// Helpers for GitHub sign-in only. Kept separate from lib/auth.js so they never overwrite the email sign-in code.
// Needs SESSION_SECRET (32+ random characters).
import crypto from 'node:crypto';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to 32+ random characters.');
  return s;
}
function mac(body) {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
// Signed, self-contained token: base64url(JSON) + "." + HMAC-SHA256 signature.
export function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${body}.${mac(body)}`;
}
export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const good = mac(body);
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
// Session issued after GitHub sign-in. IMPORTANT: your /api/data must accept this token. If your existing
// sessions are stored differently (for example in a database), replace the body of this function with the
// same call your email sign-in uses to create a session.
export function issueSession(email) {
  return sign({ typ: 'session', sub: email, exp: Date.now() + 30 * 24 * 3600 * 1000 });
}
export function appUrl(req) {
  return (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, '');
}
export function readCookie(req, name) {
  const found = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}
export function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}
