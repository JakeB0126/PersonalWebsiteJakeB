import { createDecipheriv, scrypt as derive } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HttpError, privateHeaders, sameOrigin, readBody, safeEqual, rateConfigured, limitRequest } from './security.mjs';
const scrypt = promisify(derive);
export async function checkPassword(password, stored) {
  const [version, salt, expected] = String(stored || '').split(':');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return safeEqual(actual.toString('hex'), expected);
}
export function decryptResume(envelope, encodedKey) {
  if (!/^[a-f0-9]{64}$/.test(encodedKey || '')) throw new Error('Missing file key');
  const data = JSON.parse(envelope);
  if (data.version !== 1) throw new Error('Unsupported envelope');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(encodedKey, 'hex'), Buffer.from(data.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  const pdf = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]);
  if (pdf.length > 2000000 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid document');
  return pdf;
}
function page(message, status) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Résumé access — Jake Biondolillo</title><link rel="stylesheet" href="/styles.css"></head><body><main class="page page-width"><section class="section"><h1>Résumé access</h1><p role="alert">${message}</p><p><a href="/resume.html">Return to résumé access</a> · <a href="/">Portfolio</a></p></section></main></body></html>`, { status, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}
export async function handleResume(request, { env = process.env, send = fetch, load = () => readFile(resolve(process.cwd(), 'private/resume.enc'), 'utf8') } = {}) {
  try {
    if (!env.RESUME_PASSWORD_HASH || !/^[a-f0-9]{64}$/.test(env.RESUME_FILE_KEY || '') || !rateConfigured(env)) return page('Résumé access is not available yet.', 503);
    if (request.method !== 'POST') return page('Enter the password using the résumé access form.', 405);
    sameOrigin(request);
    await limitRequest(request, env);
    const body = await readBody(request, 2048);
    const password = body.password;
    if (typeof password !== 'string' || !password.length || password.length > 256) throw new HttpError(400, 'Please enter the password.');
    if (!await checkPassword(password, env.RESUME_PASSWORD_HASH)) return page('That password was not recognized. Please try again.', 401);
    const pdf = decryptResume(await load(), env.RESUME_FILE_KEY);
    return new Response(pdf, { headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Jake_Biondolillo_Product_Design_Resume.pdf"', 'Content-Security-Policy': "frame-ancestors 'none'" } });
  } catch (error) {
    if (error instanceof HttpError) return page(error.message, error.status);
    console.error('Protected resume unavailable');
    return page('Résumé access is temporarily unavailable. Please try again later.', 503);
  }
}
