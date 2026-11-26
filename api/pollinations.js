// api/pollinations.js: keyless text provider for Auto. No API key is needed.
// Forwards a chat request to Pollinations' OpenAI-compatible endpoint and streams the reply back.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'No messages.' });
  }

  const body = {
    model: typeof model === 'string' && model.length <= 64 ? model : 'openai',
    messages: messages.slice(-30),
    stream: true
  };

  try {
    const upstream = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).json({ error: `Pollinations returned HTTP ${upstream.status}.` });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200);
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    return res.end();
  } catch {
    if (!res.headersSent) return res.status(502).json({ error: 'Could not reach Pollinations.' });
    return res.end();
  }
}
