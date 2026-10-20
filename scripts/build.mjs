import { readFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = JSON.parse(await readFile(resolve(root, 'static-files.json'), 'utf8'));
const output = resolve(root, 'public');
await rm(output, { recursive: true, force: true });
for (const file of files) {
  if (file.includes('..') || file.startsWith('/') || (/\.pdf$/i.test(file) && file !== 'assets/resume/Jake_Biondolillo_PD_Public.pdf')) throw new Error('Only the reviewed public résumé copy may be published.');
  const destination = resolve(output, file); await mkdir(dirname(destination), { recursive: true }); await copyFile(resolve(root, file), destination);
}
console.log(`Built ${files.length} public files from the explicit static allowlist. Only the reviewed public résumé copy is included.`);
