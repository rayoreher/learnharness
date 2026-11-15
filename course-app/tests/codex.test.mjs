import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Codex } from '../codex.mjs';

async function client(t, behavior = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lh-codex-test-'));
  const messages = []; let child, spawnOptions;
  const fakeSpawn = (command, args, options) => {
    spawnOptions = options; child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const send = message => child.stdout.write(JSON.stringify(message) + '\n');
    child.stdin = new Writable({ write(chunk, _, done) {
      const message = JSON.parse(chunk.toString()); messages.push(message);
      queueMicrotask(() => {
        if (message.method === 'initialized' || message.id === undefined || message.error) return;
        if (behavior.hang === message.method) return;
        let result = {};
        if (message.method === 'account/read') result = { account: { type: behavior.authType ?? 'chatgpt' } };
        if (message.method === 'account/login/start') result = { authUrl: behavior.authUrl ?? 'https://auth.openai.com/authorize?example=1' };
        if (message.method === 'model/list') result = { data: [{ id: 'available-model', displayName: 'Available model', isDefault: true }], nextCursor: null };
        if (message.method === 'thread/start') result = { thread: { id: 'thread-test' } };
        if (message.method === 'turn/start') {
          result = { turn: { id: 'turn-test' } };
          // Deliberately finish before turn/start's response to exercise ordering.
          send({ method: 'item/agentMessage/delta', params: { threadId: 'thread-test', delta: behavior.output ?? '{"answer":"complete"}' } });
          send({ method: 'turn/completed', params: { threadId: 'thread-test', turn: { id: 'turn-test', status: behavior.status ?? 'completed' } } });
        }
        send({ id: message.id, result });
      }); done();
    } });
    child.kill = () => { child.stdout.end(); child.emit('exit', 0); };
    child.sendToClient = send; return child;
  };
  const codex = new Codex({ directory, spawnProcess: fakeSpawn, timeout: 200 });
  t.after(async () => { await codex.close(); await rm(directory, { recursive: true, force: true }); });
  return { codex, messages, options: () => spawnOptions, child: () => child };
}
test('Codex handshakes, authenticates with ChatGPT, and handles early completion', async t => {
  const f = await client(t); assert.equal((await f.codex.status()).connected, true);
  const result = await f.codex.generate('Create learning content', { type: 'object' }, 'available-model'); assert.equal(result.answer, 'complete');
  assert.deepEqual(f.messages.slice(0, 2).map(m => m.method), ['initialize', 'initialized']);
  const turn = f.messages.find(m => m.method === 'turn/start'); assert.equal(turn.params.sandboxPolicy.type, 'readOnly'); assert.equal(turn.params.approvalPolicy, 'never');
  assert.deepEqual(turn.params.sandboxPolicy.access.readableRoots, [f.options().cwd]);
  assert.equal(f.options().env.OPENAI_API_KEY, undefined); assert.equal(f.options().env.SSH_AUTH_SOCK, undefined);
});
test('API-key authentication cannot silently substitute for ChatGPT', async t => {
  const f = await client(t, { authType: 'apiKey' });
  assert.equal((await f.codex.status()).connected, false);
  await assert.rejects(f.codex.generate('test', {}, null), /Sign in.*ChatGPT/);
  assert.equal(f.messages.some(m => m.method === 'thread/start'), false);
});
test('malformed and incomplete model responses never become accepted content', async t => {
  const malformed = await client(t, { output: 'Some non-JSON response' });
  await assert.rejects(malformed.codex.generate('test', {}, null), /invalid structured content/);
  const interrupted = await client(t, { status: 'interrupted' });
  await assert.rejects(interrupted.codex.generate('test', {}, null), /did not complete/);
});
test('login accepts only supported HTTPS destinations and exposes no token response', async t => {
  const f = await client(t); const login = await f.codex.login(); assert.deepEqual(Object.keys(login), ['authUrl']);
  const hostile = await client(t, { authUrl: 'https://example.com/steal' }); await assert.rejects(hostile.codex.login(), /unexpected sign-in/);
});
test('unanswered protocol calls time out and release pending requests', async t => {
  const f = await client(t, { hang: 'model/list' });
  await assert.rejects(f.codex.models(), /did not finish/); assert.equal(f.codex.pending.size, 0);
});
test('unexpected tool approval requests are refused', async t => {
  const f = await client(t); await f.codex.start();
  f.child().sendToClient({ id: 'server-request', method: 'item/commandExecution/requestApproval', params: {} });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.messages.find(m => m.id === 'server-request').error.code, -32601);
});
