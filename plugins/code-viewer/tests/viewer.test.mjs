import test from 'node:test';
import assert from 'node:assert/strict';
import { languages, codeFence, activate } from '../src/main.js';

test('code survives its own closing-fence characters and untrusted metadata cannot escape the block', () => {
  const source = 'const label = "<b>text</b>";\n```\n````\nend\n';
  const text = codeFence({ source, language: 'javascript', meta: 'startLine=12\n```\n# outside' });
  assert.equal(text, `\`\`\`\`\`javascript startLine=12\n${source}\n\`\`\`\`\``);
  assert.equal(codeFence({ source: 'x', language: 'python', meta: 'startLine=0 noLineNumbers' }), '```python noLineNumbers\nx\n```');
  assert.equal(codeFence({ source: 'x', language: 'python', meta: 'startLine=9999999999999999999' }), '```python\nx\n```');
  const many = '`x'.repeat(150000);
  assert.equal(codeFence({ source: many, language: 'text', meta: '' }), `\`\`\`text\n${many}\n\`\`\``);
});
test('ordinary code languages register through native hooks and leave specialized renderers available', () => {
  const registrations = new Map();
  const stop = activate({ registerCodeBlock(renderer) { assert(!registrations.has(renderer.language)); registrations.set(renderer.language, renderer); return () => registrations.delete(renderer.language); } });
  for (const language of ['python', 'js', 'ts', 'sql', 'c++']) assert(registrations.has(language));
  for (const language of ['mermaid', 'tikz', 'smiles', 'abc', 'lesson-deck', 'lesson-flow']) assert(!registrations.has(language));
  assert.equal(registrations.size, languages.length); stop(); stop(); assert.equal(registrations.size, 0);
});
test('a conflicting registration releases every earlier claim', () => {
  const active = new Set();
  assert.throws(() => activate({ registerCodeBlock(renderer) { if (renderer.language === 'python') throw new Error('Already registered'); active.add(renderer.language); return () => active.delete(renderer.language); } }), /Already registered/);
  assert.equal(active.size, 0);
});
