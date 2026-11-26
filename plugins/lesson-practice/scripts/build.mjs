import { mkdir, copyFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), output = path.join(root, 'dist');
try {
  if ((await lstat(output)).isSymbolicLink()) throw new Error('Refusing a linked plugin output directory.');
  for (const name of await readdir(output)) if (!['manifest.json', 'main.js', 'backend.cjs', 'domain.cjs', 'schemas.cjs', 'store.cjs', 'formats.cjs', 'styles.css', 'README.md', 'LICENSE'].includes(name)) throw new Error('Unknown content in plugin output; preserve and review it before building.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
for (const name of ['main.js', 'backend.cjs', 'domain.cjs', 'schemas.cjs', 'store.cjs', 'formats.cjs', 'styles.css', 'manifest.json', 'README.md', 'LICENSE']) {
  const target = path.join(output, name); try { if (!(await lstat(target)).isFile() || (await lstat(target)).isSymbolicLink()) throw new Error('Refusing to overwrite a linked or non-file plugin entry.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await copyFile(path.join(root, ['manifest.json', 'README.md', 'LICENSE'].includes(name) ? '' : 'src', name), target);
}
console.log('Built native lesson-practice plugin. No packages were downloaded or installed.');
