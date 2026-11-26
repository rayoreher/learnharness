import { mkdir, copyFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, 'dist');
const files = ['manifest.json', 'main.js', 'styles.css', 'README.md', 'LICENSE'];
try {
  if ((await lstat(output)).isSymbolicLink()) throw new Error('Refusing a linked plugin output directory.');
  for (const name of await readdir(output)) if (!files.includes(name)) throw new Error('Unknown content in plugin output; preserve and review it before building.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
for (const name of files) {
  const target = path.join(output, name);
  try { const entry = await lstat(target); if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Refusing to overwrite a linked or non-file plugin entry.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await copyFile(path.join(root, ['main.js', 'styles.css'].includes(name) ? 'src' : '', name), target);
}
console.log('Built native code-viewer plugin. No packages were downloaded or installed.');
