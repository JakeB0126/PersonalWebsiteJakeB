import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { handleResume } from '../server/resume.mjs';
const url = 'https://portfolio.example';
const request = (path, body, origin = url) => new Request(url + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
