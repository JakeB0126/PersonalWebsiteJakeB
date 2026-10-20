import { createHmac, timingSafeEqual } from 'node:crypto';

export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const json = (value, status = 200) => Response.json(value, { status, headers: privateHeaders });
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Please submit this form from the portfolio website.');
}
export async function readBody(request, limit = 12000) {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'This submission is too large.');
  const reader = request.body?.getReader(); let length = 0; const chunks = [];
  if (reader) for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new HttpError(413, 'This submission is too large.'); }
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const type = request.headers.get('content-type')?.split(';')[0].trim();
  try {
    if (type === 'application/json') {
      const body = JSON.parse(text);
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
      return body;
    }
    if (type === 'application/x-www-form-urlencoded') {
      const params = new URLSearchParams(text); const body = {};
      for (const [key, value] of params) { if (Object.hasOwn(body, key)) throw new Error(); body[key] = value; }
      return body;
    }
  } catch { throw new HttpError(400, 'Please check the form and try again.'); }
  throw new HttpError(415, 'Unsupported form format.');
}
export function field(body, key, min, max, multiline = false) {
  if (typeof body[key] !== 'string') throw new HttpError(400, 'Please complete all required fields.');
  const value = body[key].trim();
  if (value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!multiline && /[\r\n]/.test(value))) throw new HttpError(400, 'Please check the form field lengths and formatting.');
  return value;
}
export const validEmail = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n]/.test(value) && value.length <= 254;
export const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
export function safeEqual(a, b) { return typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
// Set only after the matching Vercel WAF POST rule is applied and verified.
// Enforcement is at Vercel's edge, shared across function instances.
export function rateConfigured(env) { return env.PORTFOLIO_WAF_RATE_LIMITED === 'true'; }
export async function limitRequest(request, env) {
  if (!rateConfigured(env)) throw new HttpError(503, 'This service is temporarily unavailable.');
}
