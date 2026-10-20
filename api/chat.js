export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: { message: 'Server is missing OPENROUTER_API_KEY' } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await req.text();

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'Volt'
    },
    body
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream' }
  });
}
