// Learning requests stay in this tab across reloads. Account credentials are
// never part of a submitted payload.
export class PendingReceipts {
  constructor(storage, uuid = () => crypto.randomUUID()) { this.storage = storage; this.uuid = uuid; this.key = 'course-studio-pending-v1'; this.memory = {}; try { const data = JSON.parse(storage.getItem(this.key) || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) this.memory = data; } catch {} }
  save() { try { this.storage.setItem(this.key, JSON.stringify(this.memory)); } catch {} }
  prepare(scope, path, input) {
    const fingerprint = JSON.stringify([path, input]), previous = this.memory[scope];
    if (previous?.fingerprint === fingerprint) return previous;
    const entry = { scope, path, input: { ...input, requestId: this.uuid() }, fingerprint };
    this.memory[scope] = entry; this.save(); return entry;
  }
  accept(scope) { delete this.memory[scope]; this.save(); }
  list() { return Object.values(this.memory).filter(e => e && typeof e.scope === 'string' && typeof e.path === 'string' && (e.path === 'attempts' || e.path === 'generate' || /^courses\/[a-zA-Z0-9-]+\/lessons\/[a-zA-Z0-9_-]+\/exercises$/.test(e.path)) && e.input && typeof e.input.requestId === 'string'); }
}
