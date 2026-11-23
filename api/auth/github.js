// GET /api/auth/github?mode=signin|signup&return=<app url>
// Starts GitHub sign-in: sets a one-time state cookie and redirects to GitHub.
import crypto from 'node:crypto';
import { sign, appUrl, redirect } from '../../lib/github-session.js';

function safeReturn(raw, base) {
  if (!raw) return base + '/';
  try {
    const u = new URL(raw, base);
    return u.origin === new URL(base).origin ? u.href : base + '/';
  } catch { return base + '/'; }
}

export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'GitHub sign-in is not configured yet.' }));
  }
  const base = appUrl(req);
  const u = new URL(req.url, base);
  const mode = u.searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = sign({ typ: 'gh-state', n: nonce, m: mode, r: safeReturn(u.searchParams.get('return'), base), t: Date.now() });
  res.setHeader('Set-Cookie', `volt_gh_state=${nonce}; Path=/api/auth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/api/auth/github/callback`,
    scope: 'read:user user:email',
    state,
    allow_signup: 'true'
  });
  redirect(res, `https://github.com/login/oauth/authorize?${q}`);
}
