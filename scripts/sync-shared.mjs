import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const sharedDist = path.resolve(root, 'shared/dist');
const sharedPackage = path.resolve(root, 'shared/package.json');
const targets = [
  path.resolve(root, 'admin-panel/node_modules/@horsebet/shared'),
  path.resolve(root, 'user-gui/node_modules/@horsebet/shared'),
];

async function ensureSharedBuild() {
  try {
    const info = await stat(sharedDist);
    if (!info.isDirectory()) {
      throw new Error('shared directory is not accessible');
    }
  } catch (error) {
    throw new Error(`shared dist not found at ${sharedDist}: ${error}`);
  }
}

async function syncTarget(target) {
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(sharedDist, path.join(target, 'dist'), { recursive: true });
  await cp(sharedPackage, path.join(target, 'package.json'));
  console.log(`[sync-shared] Copied shared -> ${target}`);
}

await ensureSharedBuild();
for (const target of targets) {
  await syncTarget(target);
}
