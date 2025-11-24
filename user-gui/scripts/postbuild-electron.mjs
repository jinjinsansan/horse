import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist-electron');

mkdirSync(distDir, { recursive: true });
writeFileSync(path.join(distDir, 'package.json'), JSON.stringify({ type: 'commonjs' }), 'utf8');
