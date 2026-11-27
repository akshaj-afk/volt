// api/llm7.js: OpenAI-compatible chat through LLM7 (llm7.io), streamed straight back to the browser.
// Optional env: LLM7_API_KEY (raises LLM7's free limits), LLM7_MODEL (default model id).
// Like api/ovh.js, this route needs no sign-in, so Auto can reach it. Verify model ids at llm7.io.

export const config = { runtime: 'edge' };

const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const { messages, model, temperature } = (await req.json().catch(() => ({}))) || {};
  if (!Array.isArray(messages) || !messages.length) return json({ error: 'No messages.' }, 400);
  const id = typeof model === 'string' && /^[A-Za-z0-9._\/-]{1,80}$/.test(model)
    ? model
    : (process.env.LLM7_MODEL || 'default');

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LLM7_API_KEY) headers.Authorization = `Bearer ${process.env.LLM7_API_KEY}`;
  const body = { model: id, messages: messages.slice(-30), stream: true, max_tokens: 800 };
  if (typeof temperature === 'number') body.temperature = temperature;

  try {
    const upstream = await fetch(LLM7_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!upstream.ok || !upstream.body) return json({ error: `LLM7 returned HTTP ${upstream.status}.` }, upstream.status || 502);
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'Could not reach LLM7.' }, 502);
  }
}
