// Key-value storage on Neon Postgres (free tier). Same small API as before,
// so the auth and sync routes do not need to change.
import { neon } from '@neondatabase/serverless';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = DB_URL ? neon(DB_URL) : null;
let ready;

export const storeReady = () => Boolean(DB_URL);

function db() {
  if (!sql) throw new Error('Storage is not set up. Add DATABASE_URL (your Neon connection string) in Vercel, then redeploy.');
  if (!ready) {
    ready = sql`CREATE TABLE IF NOT EXISTS kv (
      key text PRIMARY KEY,
      value text NOT NULL,
      expires_at timestamptz
    )`.catch(err => { ready = null; throw err; });
  }
  return ready.then(() => sql);
}

export async function get(key) {
  const q = await db();
  const rows = await q`SELECT value FROM kv
    WHERE key = ${key} AND (expires_at IS NULL OR expires_at > now())`;
  return rows[0] ? rows[0].value : null;
}

export async function set(key, value, seconds) {
  const q = await db();
  if (seconds) {
    await q`INSERT INTO kv (key, value, expires_at)
      VALUES (${key}, ${value}, now() + make_interval(secs => ${seconds}))
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
  } else {
    await q`INSERT INTO kv (key, value, expires_at)
      VALUES (${key}, ${value}, NULL)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = NULL`;
  }
}

export async function del(key) {
  const q = await db();
  await q`DELETE FROM kv WHERE key = ${key}`;
}

// Counter that restarts at 1 once its expiry has passed.
export async function incr(key) {
  const q = await db();
  const rows = await q`INSERT INTO kv (key, value) VALUES (${key}, '1')
    ON CONFLICT (key) DO UPDATE SET
      value = CASE WHEN kv.expires_at IS NOT NULL AND kv.expires_at <= now()
                   THEN '1' ELSE (kv.value::int + 1)::text END,
      expires_at = CASE WHEN kv.expires_at IS NOT NULL AND kv.expires_at <= now()
                   THEN NULL ELSE kv.expires_at END
    RETURNING value`;
  return Number(rows[0].value);
}

export async function expire(key, seconds) {
  const q = await db();
  await q`UPDATE kv SET expires_at = now() + make_interval(secs => ${seconds})
    WHERE key = ${key}`;
}
