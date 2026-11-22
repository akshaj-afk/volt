/* Shared helpers for sign-in. Needs the SESSION_SECRET environment variable (32+ random characters). */
const crypto = require('crypto');

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to 32+ random characters.');
  return s;
}
function mac(body) {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
/* Signed, self-contained token: base64url(JSON) + "." + HMAC-SHA256 signature. */
function sign(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${body}.${mac(body)}`;
}
function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const good = mac(body);
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
/* Session issued after GitHub sign-in. Your /api/data and /api/auth/verify must accept this token
   (see README in the reply). If your existing sessions live in a database, call that here instead. */
function issueSession(email) {
  return sign({ typ: 'session', sub: email, exp: Date.now() + 30 * 24 * 3600 * 1000 });
}
function appUrl(req) {
  return (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, '');
}
function readCookie(req, name) {
  const found = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}
function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}
module.exports = { sign, verify, issueSession, appUrl, readCookie, redirect };
