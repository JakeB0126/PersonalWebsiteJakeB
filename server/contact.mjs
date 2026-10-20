import { randomUUID } from 'node:crypto';
import { field, validEmail, hmac, safeEqual, sameOrigin, readBody, json, HttpError, limitRequest, rateConfigured } from './security.mjs';

export function contactConfigured(env) { return Boolean(env.RESEND_API_KEY && validEmail(env.CONTACT_TO || '') && validEmail(env.CONTACT_FROM || '') && rateConfigured(env)); }
export function challenge(secret, now = Date.now()) { const data = `${now}.${randomUUID()}`; return `${data}.${hmac(secret, data)}`; }
function checkChallenge(token, secret, now) {
  if (!/^\d{13}\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token || '')) throw new HttpError(400, 'Please reload the form before sending.');
  const [time, id, signature] = token.split('.');
  if (!safeEqual(signature, hmac(secret, `${time}.${id}`)) || now - Number(time) < 3000 || now - Number(time) > 3600000) throw new HttpError(400, 'Please take a moment, then reload the form and try again.');
  return id;
}
export async function handleContact(request, { env = process.env, send = fetch, now = Date.now() } = {}) {
  try {
    if (!contactConfigured(env)) return json({ available: false, message: 'The contact form is not available yet. Please use LinkedIn for now.' }, 503);
    if (request.method === 'GET') {
      await limitRequest(request, env);
      return json({ available: true, token: challenge(env.RESEND_API_KEY, now) });
    }
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
    sameOrigin(request);
    await limitRequest(request, env);
    const body = await readBody(request);
    const name = field(body, 'name', 1, 80), email = field(body, 'email', 3, 254), message = field(body, 'message', 10, 4000, true);
    if (!validEmail(email) || (body.website && String(body.website).trim())) throw new HttpError(400, 'Please check the form and try again.');
    const id = checkChallenge(body.token, env.RESEND_API_KEY, now);
    const response = await send('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `portfolio-contact/${id}` }, body: JSON.stringify({ from: env.CONTACT_FROM, to: [env.CONTACT_TO], reply_to: email, subject: 'New portfolio inquiry', text: `Name: ${name}\nReply email: ${email}\n\n${message}` }), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok || typeof result.id !== 'string' || !result.id) { console.error('Contact provider did not accept submission', response.status); return json({ message: 'Your message could not be sent. Please try again later.' }, 502); }
    return json({ message: 'Your message was accepted for delivery. Thank you for getting in touch.' });
  } catch (error) {
    if (error instanceof HttpError) return json({ message: error.message }, error.status);
    console.error('Contact submission could not be confirmed');
    return json({ message: 'Delivery could not be confirmed. Please wait before retrying; your message may already have been accepted.' }, 503);
  }
}
