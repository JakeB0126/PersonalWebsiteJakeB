// Local preparation only. Supply a previously approved key through the environment.
import { readFile, writeFile } from 'node:fs/promises';
import { createCipheriv, randomBytes } from 'node:crypto';
const [source, destination] = process.argv.slice(2);
if (!source || !destination || !/^[a-f0-9]{64}$/.test(process.env.RESUME_FILE_KEY || '')) throw new Error('Supply source, destination, and the approved RESUME_FILE_KEY through the environment.');
const pdf = await readFile(source);
if (pdf.subarray(0, 5).toString() !== '%PDF-' || pdf.length > 2000000) throw new Error('Expected a PDF under 2 MB.');
const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.RESUME_FILE_KEY, 'hex'), iv);
const ciphertext = Buffer.concat([cipher.update(pdf), cipher.final()]);
await writeFile(destination, JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }) + '\n', { flag: 'wx' });
console.log('Encrypted résumé written. The source PDF and file key were not changed or printed.');
