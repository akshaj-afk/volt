// api/kilo.js
// Vercel serverless proxy for Kilo Gateway (free models only).
// Volt's page calls /api/kilo?path=models and /api/kilo?path=chat/completions.
// The Kilo API key stays on the server and is never sent to the browser.

const UPSTREAM = (process.env.KILO_GATEWAY_URL || 'https://api.kilo.ai/api/gateway').replace(/\/+$/, '');

// Only these routes are forwarded, so the proxy cannot be used for anything else.
const ALLOWED = {
  'models': 'GET',
  'chat/completions': 'POST'
};

export default async function handler(req, res) {
  const path = String(req.query?.path ?? '').replace(/^\/+/, '');
  const method = ALLOWED[path];

  if (!method) {
    return res.status(404).json({ error: `Unknown Kilo route: "${path}". Allowed: ${Object.keys(ALLOWED).join(', ')}` });
  }
  if (req.method !== method) {
    return res.status(405).json({ error: `Use ${method} for ${path}.` });
  }

  const key = process.env.KILO_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'KILO_API_KEY is not set in Vercel. Add it under Project Settings → Environment Variables, then redeploy.' });
  }

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}/${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': method === 'POST' ? 'text/event-stream' : 'application/json'
      },
      body: method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Kilo Gateway at ${UPSTREAM}: ${err.message}` });
  }

  // Pass upstream errors through unchanged, so the real cause is visible in Volt.
  if (!upstream.ok) {
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text || JSON.stringify({ error: `Kilo Gateway returned HTTP ${upstream.status} for ${path}.` }));
  }

  res.status(200);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || (method === 'POST' ? 'text/event-stream' : 'application/json'));
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  if (method === 'POST' && upstream.body) {
    // Stream tokens to the browser as they arrive.
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      res.end();
    }
    return;
  }

  return res.send(await upstream.text());
}
