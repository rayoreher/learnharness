// Explicit, isolated compatibility checks for the pinned browser sanitizer.
// This does not load the complete LearnHarness/React/Mermaid application.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';

assert.equal(process.env.LH_SANITIZER_ISOLATED, '1');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const proof = JSON.parse(await readFile('/proof.json', 'utf8'));
const locked = JSON.parse(await readFile('/lock.json', 'utf8')).packages['node_modules/dompurify'];
assert.equal(proof.name, 'dompurify'); assert.equal(proof.version, locked.version); assert.equal(proof.integrity, locked.integrity);
const bundles = new Map();
for (const name of ['dist/purify.es.mjs', 'dist/purify.js']) {
  const bytes = await readFile('/candidate/' + name), expected = proof.inventory.find(file => file.path === name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  bundles.set(name, bytes);
}
const checks = `import esm from '/purify.mjs';
const results=[];
const check=(condition,message)=>{if(!condition)throw new Error(message)};
try {
 for(const [format,purify]of [['ESM',esm],['browser',window.DOMPurify]]){
  check(purify.version===${JSON.stringify(locked.version)},'Unexpected sanitizer version');
  const parse=html=>new DOMParser().parseFromString(html,'text/html');
  const clean=purify.sanitize('<p><strong>Lesson</strong> and <code>x &lt; y</code></p><img onerror="window.unexpected=true"><script>window.unexpected=true</script><a href="javascript:void(0)">link</a>');
  const tree=parse(clean);check(tree.querySelector('strong')?.textContent==='Lesson','Lost lesson formatting');check(tree.querySelector('code')?.textContent==='x < y','Changed escaped code');check(!tree.querySelector('script,[onerror]'),'Unsafe content survived');check(!tree.querySelector('a')?.hasAttribute('href'),'Unsafe URL survived');
  results.push(format+': safe lesson markup and code retained; unsafe markup/URLs removed');
  const svg=purify.sanitize('<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="9" refY="5" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs><rect x="10" y="10" width="80" height="30"/><text x="15" y="30">Recall</text><path d="M50 40L50 80" marker-end="url(#arrow)"/></svg>',{USE_PROFILES:{svg:true}});
  const drawing=parse(svg);check(!!drawing.querySelector('svg marker path'),'Lost diagram arrow marker');check(!!drawing.querySelector('svg path[marker-end]'),'Lost arrow attachment');check(drawing.querySelector('svg text')?.textContent==='Recall','Lost diagram label');
  results.push(format+': SVG diagram labels, shapes and arrow markers retained');
  let hookCalls=0;const hook=node=>{if(node.nodeName==='A'){hookCalls++;node.setAttribute('rel','noopener')}};
  purify.addHook('afterSanitizeAttributes',hook);const link=parse(purify.sanitize('<a href="https://example.invalid/">Read</a>')).querySelector('a');purify.removeAllHooks();check(hookCalls===1&&link.getAttribute('rel')==='noopener','Native sanitizer hook contract changed');
  results.push(format+': existing sanitizer hook lifecycle retained');
  const root=document.createElement('style');root.textContent='</style><div data-unexpected="1">injected</div>';let rejected=false,returned;
  try{returned=purify.sanitize(root,{IN_PLACE:true})}catch(error){check(error instanceof TypeError,'Unexpected failure sanitizing rawtext root');rejected=true}
  if(!rejected){const serialized=typeof returned==='string'?returned:returned?.outerHTML??'';check(!parse(serialized).querySelector('[data-unexpected]'),'Removed rawtext root returned unsafe serialized markup')}
  results.push(format+': removed rawtext root cannot reintroduce markup through serialization');
 }
 window.verification={passed:true,results};
}catch(error){window.verification={passed:false,results,error:String(error.stack??error)}}`;
const page = '<!doctype html><meta charset="utf-8"><script src="/purify.js"></script><script type="module" src="/checks.mjs"></script>';
const server = http.createServer((request, response) => {
  const values = { '/': ['text/html', page], '/purify.mjs': ['text/javascript', bundles.get('dist/purify.es.mjs')], '/purify.js': ['text/javascript', bundles.get('dist/purify.js')], '/checks.mjs': ['text/javascript', checks] };
  const value = values[request.url]; if (!value) { response.statusCode = 404; response.end(); return; }
  response.setHeader('content-type', value[0]); response.end(value[1]);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let chrome, socket, serial = 0; const pending = new Map();
try {
  const endpoint = await new Promise((resolve, reject) => {
    chrome = spawn('/opt/chrome/chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=/tmp/sanitizer-browser', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 15000);
    chrome.stderr.on('data', chunk => { const match = chunk.toString().match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); chrome.on('error', reject);
  });
  socket = new WebSocket(endpoint); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const message = JSON.parse(event.data), waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); clearTimeout(waiter.timer); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); };
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => reject(new Error('Browser timeout: ' + method)), 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const target = await rpc('Target.createTarget', { url: 'about:blank' }), attached = await rpc('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await rpc('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }, attached.sessionId);
  let result;
  for (let attempt = 0; attempt < 100; attempt++) {
    const evaluated = await rpc('Runtime.evaluate', { expression: 'window.verification', returnByValue: true }, attached.sessionId);
    result = evaluated.result?.value; if (result) break; await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(result, 'Browser checks did not finish'); assert.equal(result.passed, true, result.error);
  for (const message of result.results) console.log('PASS ' + message);
} finally { for (const waiter of pending.values()) clearTimeout(waiter.timer); socket?.close(); chrome?.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
