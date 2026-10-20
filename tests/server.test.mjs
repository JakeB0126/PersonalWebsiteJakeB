import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { handleContact, challenge } from '../server/contact.mjs';
import { handleResume } from '../server/resume.mjs';
const url = 'https://portfolio.example';
const request = (path, body, origin = url) => new Request(url + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const env = { PORTFOLIO_WAF_RATE_LIMITED: 'true', RESEND_API_KEY: 'test-only-memory-key', CONTACT_TO: 'recipient@example.test', CONTACT_FROM: 'sender@example.test' };
const now = Date.now();
const message = { name: 'Visitor', email: 'visitor@example.test', message: 'A short portfolio inquiry.', website: '', token: challenge(env.RESEND_API_KEY, now - 5000) };
test('contact fails closed before services and edge rate protection are configured', async () => {
  let sent = false;
  const response = await handleContact(request('/api/contact', message), { env: {}, send: () => { sent = true; } });
  assert.equal(response.status, 503); assert.equal(sent, false);
  const withoutWaf = await handleContact(request('/api/contact', message), { env: { ...env, PORTFOLIO_WAF_RATE_LIMITED: 'false' } });
  assert.equal(withoutWaf.status, 503);
});
test('contact rejects cross-origin, header injection, honeypot and oversized bodies before mail', async () => {
  const send = () => { throw new Error('Mail must not be attempted'); };
  assert.equal((await handleContact(request('/api/contact', message, 'https://elsewhere.example'), { env, send, now })).status, 403);
  assert.equal((await handleContact(request('/api/contact', { ...message, email: 'visitor@example.test\r\nBcc: other@example.test' }), { env, send, now })).status, 400);
  assert.equal((await handleContact(request('/api/contact', { ...message, website: 'spam' }), { env, send, now })).status, 400);
  assert.equal((await handleContact(request('/api/contact', { ...message, message: 'x'.repeat(13000) }), { env, send, now })).status, 413);
});
test('contact uses fixed server recipient, plain text, safe reply-to and idempotency; success needs provider acceptance', async () => {
  let payload, headers;
  const send = async (destination, options) => { assert.equal(destination, 'https://api.resend.com/emails'); payload = JSON.parse(options.body); headers = options.headers; return Response.json({ id: 'mock-accepted' }); };
  const response = await handleContact(request('/api/contact', message), { env, send, now });
  assert.equal(response.status, 200); assert.deepEqual(payload.to, [env.CONTACT_TO]); assert.equal(payload.reply_to, message.email); assert.equal(payload.html, undefined); assert.match(headers['Idempotency-Key'], /^portfolio-contact\//);
  assert.equal((await response.text()).includes(env.CONTACT_TO), false);
  const rejected = await handleContact(request('/api/contact', message), { env, send: async () => Response.json({ error: 'mock rejection' }, { status: 403 }), now });
  assert.equal(rejected.status, 502);
});
const pdf = Buffer.from('%PDF-1.4\nMock document used only in memory.');
const fileKey = randomBytes(32), salt = randomBytes(16);
const password = 'only a test password';
const hash = `scrypt-v1:${salt.toString('hex')}:${scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', fileKey, iv);
const ciphertext = Buffer.concat([cipher.update(pdf), cipher.final()]);
const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
const resumeEnv = { PORTFOLIO_WAF_RATE_LIMITED: 'true', RESUME_PASSWORD_HASH: hash, RESUME_FILE_KEY: fileKey.toString('hex') };
test('resume never loads plaintext or returns PDF for missing settings, GET, cross-origin or wrong passwords', async () => {
  let loaded = false; const load = () => { loaded = true; return envelope; };
  assert.equal((await handleResume(request('/api/resume', { password }), { env: {}, load })).status, 503);
  assert.equal((await handleResume(new Request(url + '/api/resume'), { env: resumeEnv, load })).status, 405);
  assert.equal((await handleResume(request('/api/resume', { password }, 'https://elsewhere.example'), { env: resumeEnv, load })).status, 403);
  assert.equal((await handleResume(request('/api/resume', { password: 'wrong' }), { env: resumeEnv, load })).status, 401);
  assert.equal(loaded, false);
});
test('resume decrypts only after authentication, prohibits cache and detects ciphertext tampering', async () => {
  const response = await handleResume(request('/api/resume', { password }), { env: resumeEnv, load: async () => envelope });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'application/pdf'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  const bad = JSON.parse(envelope); bad.tag = Buffer.alloc(16).toString('base64');
  const rejected = await handleResume(request('/api/resume', { password }), { env: resumeEnv, load: async () => JSON.stringify(bad) });
  assert.equal(rejected.status, 503); assert.notEqual(rejected.headers.get('Content-Type'), 'application/pdf');
});
