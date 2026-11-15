import { mkdir, readFile, rename, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { check } from './schema.mjs';
import { validateStoredState } from './transfers.mjs';

export class Store {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'learning.json'); this.tail = Promise.resolve(); }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    // A lifetime lease prevents two servers from silently overwriting the same file.
    this.lock = path.join(this.directory, 'writer.lock');
    try { const lease = await open(this.lock, 'wx', 0o600); await lease.writeFile(String(process.pid)); await lease.close(); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(this.lock, 'utf8'));
      let alive = true;
      try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      check(!alive && Number.isSafeInteger(pid) && pid > 0, 'Another Course Studio process owns this data directory.', 409);
      await rm(this.lock);
      const lease = await open(this.lock, 'wx', 0o600); await lease.writeFile(String(process.pid)); await lease.close();
    }
    this.ownsLease = true;
    try {
      try { check((await stat(this.file)).size <= 64 * 1024 * 1024, 'Learning records exceed the 64 MB limit. The file has been preserved.', 500); this.state = JSON.parse(await readFile(this.file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; this.state = { version: 1, courses: [], progress: {}, jobs: [], settings: { model: null } }; }
      validateStoredState(this.state);
      for (const job of this.state.jobs) if (['running', 'queued'].includes(job.status)) { job.status = 'interrupted'; job.error = 'The server restarted. Start a new generation when ready.'; }
      await this.persist(this.state);
      return this;
    } catch (error) { await this.close(); throw error; }
  }
  async persist(state) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const serialized = JSON.stringify(state); check(Buffer.byteLength(serialized) <= 64 * 1024 * 1024, 'Learning records exceed the 64 MB limit. Export a backup before adding more.');
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(serialized); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.file);
      const directory = await open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  async read() { await this.tail; return structuredClone(this.state); }
  transact(change) {
    const operation = this.tail.then(async () => {
      const next = structuredClone(this.state);
      const result = await change(next);
      await this.persist(next);
      this.state = next;
      return structuredClone(result);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  async close() { await this.tail; if (this.ownsLease) { this.ownsLease = false; await rm(this.lock, { force: true }); } }
}
