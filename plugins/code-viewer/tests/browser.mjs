// Widget contract check, not a complete React/Next application run.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
assert.equal(process.env.LH_CODE_VIEWER_ISOLATED, '1');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const fixture = `import {activate} from '/main.js';
const renderers=new Map(), markdown=[];let live=0;
function handle(node,props,paint){let disposed=false;live++;return{update(p){Object.assign(props,p);paint?.()},dispose(){if(disposed)return;disposed=true;live--;node.remove()}}}
const ui={mountMarkdown(container,props){markdown.push(props);const pre=document.createElement('pre');pre.textContent=props.text.slice(props.text.indexOf('\\n')+1,props.text.lastIndexOf('\\n'));container.append(pre);return handle(pre,props)},mountButton(container,initial){const props={...initial},button=document.createElement('button');container.append(button);const paint=()=>{button.textContent=props.label;button.disabled=!!props.disabled};button.onclick=()=>props.onClick();paint();return handle(button,props,paint)}};
const stop=activate({ui,registerCodeBlock(renderer){renderers.set(renderer.language,renderer);return()=>renderers.delete(renderer.language)}});
window.fixture={renderers,markdown,ui,stop,get live(){return live}};window.ready=true;`;
const server = http.createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="slot"></main><script type="module" src="/fixture.js"></script></body></html>'); }
  else if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(fixture); }
  else if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(await readFile(new URL('../src/main.js', import.meta.url))); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let chrome, socket, serial = 0; const pending = new Map();
try {
  const address = await new Promise((resolve, reject) => {
    chrome = spawn('/opt/chrome/chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=/tmp/code-viewer-browser', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 15000);
    chrome.stderr.on('data', chunk => { const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); chrome.on('error', reject);
  });
  socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const result = JSON.parse(event.data), waiter = pending.get(result.id); if (!waiter) return; pending.delete(result.id); clearTimeout(waiter.timer); result.error ? waiter.reject(new Error(JSON.stringify(result.error))) : waiter.resolve(result.result); };
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => reject(new Error('Browser timeout: ' + method)), 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const target = await rpc('Target.createTarget', { url: 'about:blank' }), attached = await rpc('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const evaluate = async expression => { const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, attached.sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result?.value; };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('UI condition failed: ' + expression); };
  await rpc('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }, attached.sessionId); await wait('window.ready');
  const source = 'def example():\n    return "<b>code</b>"\n```\n';
  await evaluate(`window.scope=new AbortController();window.source=${JSON.stringify(source)};window.cleanup=fixture.renderers.get('python').mount(document.querySelector('#slot'),{source,language:'python',meta:'startLine=7',incomplete:false,signal:scope.signal})`);
  assert.equal(await evaluate(`document.querySelector('#slot section').getAttribute('aria-label')`), 'Python code');
  assert.equal(await evaluate(`document.querySelector('#slot pre').textContent`), source);
  assert.equal(await evaluate(`document.querySelector('#slot b')`), null);
  assert.equal(await evaluate('fixture.markdown[0].allowPluginFences'), undefined);
  assert.equal(await evaluate('fixture.markdown[0].text.startsWith("````python startLine=7\\n")'), true);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Expand code').click()`);
  assert.equal(await evaluate(`document.querySelector('section').classList.contains('lh-code-viewer-expanded')`), true);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Show less').click()`);
  assert.equal(await evaluate(`document.querySelector('section').classList.contains('lh-code-viewer-expanded')`), false);
  console.log('PASS editor-style code viewer uses native host-only Markdown, preserves source and expands accessibly');
  await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){window.copied=text}}});[...document.querySelectorAll('button')].find(b=>b.textContent==='Copy code').click()`);
  await wait(`document.querySelector('[role=status]').textContent==='Code copied.'`); assert.equal(await evaluate('window.copied'), source);
  await evaluate(`navigator.clipboard.writeText=async()=>{throw new Error('Clipboard unavailable')};[...document.querySelectorAll('button')].find(b=>b.textContent==='Copy code').click()`);
  await wait('!!document.querySelector("textarea")');
  assert.equal(await evaluate('document.querySelector("textarea").value'), source); assert.equal(await evaluate('document.querySelector("textarea").readOnly'), true);
  assert.equal(await evaluate('document.activeElement===document.querySelector("textarea")'), true);
  await evaluate('scope.abort();cleanup();cleanup()'); assert.equal(await evaluate('fixture.live'), 0); assert.equal(await evaluate('document.querySelector("#slot").children.length'), 0);
  console.log('PASS exact clipboard text, manual-copy fallback and idempotent abort cleanup');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.renderers.get('js').mount(document.querySelector('#slot'),{source:'const x =',language:'js',meta:'',incomplete:true,signal:scope.signal});navigator.clipboard.writeText=()=>new Promise(resolve=>window.finishCopy=resolve);[...document.querySelectorAll('button')].find(b=>b.textContent==='Copy code').click();scope.abort();finishCopy()`);
  assert.equal(await evaluate('fixture.live'), 0); assert.equal(await evaluate('document.querySelector("#slot").children.length'), 0);
  await evaluate(`fixture.ui.mountMarkdown=()=>{throw new Error('Host rendering failed')};window.scope=new AbortController();try{fixture.renderers.get('python').mount(document.querySelector('#slot'),{source:'x',language:'python',meta:'',signal:scope.signal})}catch(error){window.failed=error.message}`);
  assert.equal(await evaluate('window.failed'), 'Host rendering failed'); assert.equal(await evaluate('document.querySelector("#slot").children.length'), 0);
  await evaluate('fixture.stop();fixture.stop()'); assert.equal(await evaluate('fixture.renderers.size'), 0);
  console.log('PASS late clipboard completion cannot revive a disposed mount; failed native widgets clean up before host fallback');
} finally { for (const waiter of pending.values()) clearTimeout(waiter.timer); socket?.close(); chrome?.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
