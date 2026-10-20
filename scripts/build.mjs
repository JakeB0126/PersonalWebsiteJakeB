import { readFile, mkdir, copyFile, rm, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv.includes('--local-review')) {
  const required = ['RESUME_PASSWORD_HASH', 'RESUME_FILE_KEY'];
  if (required.some(key => !process.env[key]) || process.env.PORTFOLIO_WAF_RATE_LIMITED !== 'true') throw new Error('Publication blocked: protected résumé and verified WAF configuration are required.');
  await access(resolve(root, 'private/resume.enc'));
}
const files = JSON.parse(await readFile(resolve(root, 'static-files.json'), 'utf8'));
const output = resolve(root, 'public');
await rm(output, { recursive: true, force: true });
for (const file of files) {
  if (file.includes('..') || file.startsWith('/') || /(?:^|\/)resume\/|\.pdf$/i.test(file)) throw new Error('Plaintext PDF cannot be published.');
  const destination = resolve(output, file); await mkdir(dirname(destination), { recursive: true }); await copyFile(resolve(root, file), destination);
}
console.log(`Built ${files.length} public files from the explicit static allowlist. No plaintext PDF or private server files are included.`);
