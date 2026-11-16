'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { assert, defaults, settings } = require('./domain.cjs');

function openStore(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'lessons.json');
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, revision: 0, settings: defaults(), sessions: {} }; }
  assert(state.version === 1 && state.sessions && typeof state.sessions === 'object' && !Array.isArray(state.sessions), 'Unsupported lesson records; original data has been preserved.'); settings(state.settings);
  return {
    read: () => structuredClone(state),
    change(update) {
      const next = structuredClone(state), result = update(next);
      if (JSON.stringify(next) === JSON.stringify(state)) return structuredClone(result);
      next.revision++;
      const temporary = `${file}.${randomUUID()}.tmp`, bytes = JSON.stringify(next);
      assert(Buffer.byteLength(bytes) <= 16 * 1024 * 1024, 'Lesson records exceed the 16 MB limit.');
      try {
        const fd = fs.openSync(temporary, 'wx', 0o600);
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(temporary, file); state = next;
      } finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      return structuredClone(result);
    }
  };
}
module.exports = { openStore };
