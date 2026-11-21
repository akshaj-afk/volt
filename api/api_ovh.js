// api/ovh.js — same-origin proxy to OVHcloud's keyless Qwen endpoint (Quillo Pro's chain).
// Mirror api/kilo.js if your project handles request bodies differently.
const OVH_BASE = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const path = String(req.query.path || '');
  if (!/^[a-z0-9/_.-]{1,80}$/i.test(path)) return res.status(400).json({ error: 'Bad path' });

  const upstream = await fetch(OVH_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body || {})
  });

  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  if (!upstream.body) return res.end(await upstream.text());
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}
