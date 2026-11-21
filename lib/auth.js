import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import * as store from './store.js';

export const normEmail = value => String(value || '').trim().toLowerCase();
export const validEmail = value => value.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(value);
export const sha256 = value => createHash('sha256').update(value).digest('hex');

function secret() {
  if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET is not set in Vercel. Add a long random value, then redeploy.');
  return process.env.AUTH_SECRET;
}
export const codeHash = (email, code) => createHmac('sha256', secret()).update(`${email}:${code}`).digest('hex');
export const newCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const newToken = () => randomBytes(32).toString('hex');

export function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function sessionEmail(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return store.get('session:' + sha256(token));
}

export async function sendCodeEmail(to, code) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Email is not set up. Add RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: `Your Volt code: ${code}`,
      text: `Your Volt verification code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
      html: `<p>Your Volt verification code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>`
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`The email could not be sent (HTTP ${res.status}). Check RESEND_API_KEY and EMAIL_FROM. ${detail.slice(0, 200)}`);
  }
}
