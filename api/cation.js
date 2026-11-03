// Vercel serverless function: forwards Volt's chat to MANEX's Cation API.
// The key is read from the CATION_KEY environment variable and never reaches the browser.
// Cation's docs: https://manex-inc.github.io/website/cation.html

const CATION_URL = 'https://cation-6a.manex-api.workers.dev/v1/chat/completions';
const MAX_TURNS = 30;        // Cation reads the last 30 messages
const MAX_CHARS = 8000;      // keep each message within a sane size

// Per-visitor guard. Everyone who uses Volt shares one Cation key and one daily allowance,
// so one visitor should not be able to use it all up. Tune these two numbers as needed.
// This is best-effort: each warm serverless instance keeps its own count, so it is a brake, not a hard cap.
const WINDOW_MS = 60 * 60 * 1000;   // one hour
const MAX_PER_WINDOW = 40;          // requests per visitor per window
const hits = new Map();             // visitor id -> { count, start }

function visitorId(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket?.remoteAddress;
  return (ip || 'unknown').trim();
}

// Returns true when this visitor has gone over the limit for the current window.
function overLimit(id) {
  const now = Date.now();
  const rec = hits.get(id);
  if (!rec || now - rec.start > WINDOW_MS) {
    hits.set(id, { count: 1, start: now });
  } else {
    rec.count += 1;
    if (rec.count > MAX_PER_WINDOW) return true;
  }
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Use POST for this endpoint.' } });
  }

  const key = process.env.CATION_KEY;
  if (!key) {
    return res.status(500).json({ error: { message: 'Cation is not set up on this server yet. Add CATION_KEY in Vercel.' } });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // Cation takes plain user and assistant turns, so anything else is dropped.
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: { message: 'Send a message to Cation first.' } });
  }

  if (overLimit(visitorId(req))) {
    return res.status(429).json({ error: { message: "You've sent a lot of messages to Cation in the last hour. Please wait a little and try again." } });
  }

  let upstream;
  try {
    upstream = await fetch(CATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(60000)
    });
  } catch {
    return res.status(502).json({ error: { message: 'Cation could not be reached. Try again in a moment.' } });
  }

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    if (upstream.status === 401) {
      return res.status(401).json({ error: { message: 'Cation rejected the server key. Check CATION_KEY in Vercel.' } });
    }
    if (upstream.status === 429) {
      return res.status(429).json({ error: { message: "Cation's shared daily allowance has run out. It resets tomorrow." } });
    }
    return res.status(502).json({ error: { message: 'Cation returned an error. Try again shortly.' } });
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    return res.status(502).json({ error: { message: 'Cation sent an empty reply. Try again.' } });
  }

  // Volt reads every reply as a stream, so the whole answer goes out as one event.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  res.write('data: [DONE]\n\n');
  return res.end();
}
