// Tiny Upstash Redis client over its REST API. No packages needed.
const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeReady = () => Boolean(URL_BASE && TOKEN);

async function run(command) {
  if (!storeReady()) throw new Error('Storage is not set up. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel, then redeploy.');
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Storage returned HTTP ${res.status}.`);
  return json.result;
}

export const get = key => run(['GET', key]);
export const set = (key, value, seconds) => seconds ? run(['SET', key, value, 'EX', String(seconds)]) : run(['SET', key, value]);
export const del = key => run(['DEL', key]);
export const incr = key => run(['INCR', key]);
export const expire = (key, seconds) => run(['EXPIRE', key, String(seconds)]);
