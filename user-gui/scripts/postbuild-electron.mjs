import { renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist-electron');

const targets = ['main', 'preload'];

for (const name of targets) {
  const from = path.join(distDir, `${name}.js`);
  const to = path.join(distDir, `${name}.cjs`);
  if (existsSync(from)) {
    renameSync(from, to);
  }
}
