import { writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist-electron');
const nestedDir = path.join(distDir, 'user-gui', 'electron');

mkdirSync(distDir, { recursive: true });
writeFileSync(path.join(distDir, 'package.json'), JSON.stringify({ type: 'commonjs' }), 'utf8');

if (existsSync(nestedDir)) {
  cpSync(nestedDir, distDir, { recursive: true });
  rmSync(path.join(distDir, 'user-gui'), { recursive: true, force: true });
}
