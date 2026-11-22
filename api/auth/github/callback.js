/* GET /api/auth/github/callback — GitHub returns here.
   Checks the state, exchanges the code for a token, reads the verified primary email,
   then sends the browser back to the app with the session in the URL fragment (#volt-auth=...). */
const { verify, issueSession, appUrl, readCookie, redirect } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  const base = appUrl(req);
  const u = new URL(req.url, base);
  const fail = msg => redirect(res, `${base}/#volt-auth-error=${encodeURIComponent(msg)}`);

  // The state cookie is single-use: clear it whatever happens next.
  res.setHeader('Set-Cookie', 'volt_gh_state=; Path=/api/auth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  if (u.searchParams.get('error')) return fail('GitHub sign-in was cancelled.');

  const code = u.searchParams.get('code');
  const state = verify(u.searchParams.get('state') || '');
  const cookieNonce = readCookie(req, 'volt_gh_state');
  if (!code || !state || state.typ !== 'gh-state' || !cookieNonce || cookieNonce !== state.n || Date.now() - state.t > 10 * 60 * 1000) {
    return fail('Sign-in expired. Please try again.');
  }

  let accessToken = null;
  try {
    const tr = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${base}/api/auth/github/callback`
      })
    });
    accessToken = (await tr.json()).access_token || null;
  } catch { accessToken = null; }
  if (!accessToken) return fail('GitHub did not return a sign-in token. Please try again.');

  const gh = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'volt-app' };
  const [user, emails] = await Promise.all([
    fetch('https://api.github.com/user', { headers: gh }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('https://api.github.com/user/emails', { headers: gh }).then(r => (r.ok ? r.json() : [])).catch(() => [])
  ]);
  const list = Array.isArray(emails) ? emails : [];
  const primary = list.find(e => e.primary && e.verified) || list.find(e => e.verified);
  if (!user || !primary) return fail('Your GitHub account needs a verified email address. Add one on GitHub, then try again.');

  const email = String(primary.email).toLowerCase();
  const name = String(user.name || user.login || '').slice(0, 60);
  const session = issueSession(email);
  const frag = new URLSearchParams({ 'volt-auth': session, 'volt-email': email, 'volt-name': name });
  redirect(res, `${state.r}#${frag.toString()}`);
};
