// Component QA only: real plugin modules/CSS, controlled native-widget stand-ins.
// Does not start the original React app, connect a model or load learner data.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { BUILTIN_THEMES, themeVars } from '/themes.ts';
assert.equal(process.env.LH_UI_ISOLATED, '1');
for (const directory of ['/home', '/run', '/var/run']) await assert.rejects(access(directory));
const themes = Object.fromEntries(['default', 'catppuccin-latte'].map(id => { const theme = BUILTIN_THEMES.find(t => t.id === id); return [id, themeVars(theme.colors, theme.mode)]; }));
const fixture = `import {activate} from '/lesson.js';import {activate as activateViewer} from '/viewer.js';
const tools=new Map(),fences=new Map(),questions=new Map(),themes=${JSON.stringify(themes)};
const ui={mountButton(container,initial){const props={...initial},b=document.createElement('button');container.append(b);const draw=()=>{b.textContent=props.label;b.disabled=!!props.disabled;b.dataset.variant=props.variant??'default'};b.onclick=()=>props.onClick();draw();return{update(p){Object.assign(props,p);draw()},dispose(){b.remove()}}},
mountMarkdown(container,initial){const root=document.createElement('div');root.className='fixture-markdown';container.append(root);const draw=text=>{root.replaceChildren();if(text.startsWith(String.fromCharCode(96).repeat(3))){const pre=document.createElement('pre');pre.dataset.streamdown='code-block';pre.textContent=text.slice(text.indexOf('\\n')+1,text.lastIndexOf('\\n'));root.append(pre);return}for(const part of text.split(/\\n\\n/)){const p=document.createElement('p');for(const token of part.split(/(\\*\\*[^*]+\\*\\*)/)){const n=document.createElement(token.startsWith('**')?'strong':'span');n.textContent=token.startsWith('**')?token.slice(2,-2):token;p.append(n)}root.append(p)}};draw(initial.text);return{update(p){draw(p.text)},dispose(){root.remove()}}}};
const scope=new AbortController();activate({signal:scope.signal,ui,registerQuestionRenderer(d){questions.set(d.id,d);return()=>{}},registerToolRenderer(d){tools.set(d.toolName,d);return()=>{}},registerSettings(){return()=>{}},registerAction(){return()=>{}},placeAction(){return()=>{}}});
activateViewer({ui,registerCodeBlock(d){fences.set(d.language,d);return()=>{}}});
window.theme=id=>{for(const[k,v]of Object.entries(themes[id]))document.documentElement.style.setProperty(k,v);document.documentElement.style.colorScheme=id==='default'?'dark':'light'};
theme('default');
tools.get('lesson_begin').mount(document.querySelector('#lesson'),{state:'output-available',output:{showExplanation:true,lesson:{id:'step',nodeId:'landmark',title:'Learn one idea at a time',text:'A useful lesson focuses on one step you can explain in your own words.\\n\\nTry recalling the idea before checking the answer. Your next question responds to what you understood.',settings:{output:'slides'}}},signal:scope.signal});
tools.get('lesson_correction').mount(document.querySelector('#feedback'),{state:'output-available',output:{result:'incorrect',reference:'Recall before checking.',explanation:'First make an attempt. Feedback then shows the part that needs more practice.'},signal:scope.signal});
fences.get('javascript').mount(document.querySelector('#code'),{language:'javascript',source:'const steps = ["Read", "Recall", "Review"];\\n\\nfunction nextStep(current) {\\n  return steps[steps.indexOf(current) + 1];\\n}',meta:'',incomplete:false,signal:scope.signal});
window.ready=true;`;
const baseCSS = `*{box-sizing:border-box}:root{--font-prose:system-ui;--font-ui:system-ui;--font-mono:ui-monospace,monospace;--lh-prose-size:1rem;--lh-prose-leading:1.65}body{margin:0;background:var(--background);color:var(--foreground);font-family:system-ui}main{width:100%;max-width:760px;margin:auto;padding:32px 24px}h1{font-size:14px;font-weight:500;color:var(--foreground);margin:0 0 24px}#feedback,#code{margin-top:20px}button{font:500 .8125rem/1.4 system-ui;min-height:32px;padding:6px 12px;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--foreground);cursor:pointer}button:hover:not(:disabled){background:var(--accent)}button:disabled{opacity:.45;cursor:default}button[data-variant=default]{background:var(--primary);color:var(--primary-foreground)}.fixture-markdown p{margin:0 0 .875rem}.fixture-markdown p:last-child{margin-bottom:0}pre{margin:0;padding:16px;font: .875rem/1.65 ui-monospace,monospace;overflow:auto}.fixture-samples{margin-top:24px}.fixture-samples input[type=range]{width:100%;min-height:32px}.offscreen{position:absolute;left:-9999px}@media(max-width:480px){main{padding:20px 16px}}`;
const page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LearnHarness component preview</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/polish.css"><link rel="stylesheet" href="/lesson.css"><link rel="stylesheet" href="/viewer.css"></head><body><aside id="closed" class="offscreen" inert><button>Hidden navigation</button></aside><main><h1>LearnHarness · Component preview</h1><div id="lesson"></div><div id="feedback"></div><div id="code"></div><div class="fixture-samples" hidden><div class="lh-confidence-track"><input class="lh-confidence-input" type="range" aria-label="Confidence" min="0" max="100" value="70"></div></div></main><script type="module" src="/fixture.js"></script></body></html>';
const files = { '/lesson.js': '/plugin/src/main.js', '/viewer.js': '/viewer/src/main.js', '/lesson.css': '/plugin/src/styles.css', '/viewer.css': '/viewer/src/styles.css', '/polish.css': '/polish.css' };
const server = http.createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(page); }
  else if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(fixture); }
  else if (req.url === '/base.css') { res.setHeader('content-type', 'text/css'); res.end(baseCSS); }
  else if (files[req.url]) { res.setHeader('content-type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(files[req.url])); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let chrome, socket, serial = 0; const pending = new Map(), results = [];
try {
  const address = await new Promise((resolve, reject) => {
    chrome = spawn('/opt/chrome/chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=/tmp/ui-component-browser', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  for (const width of [1440, 768, 320]) for (const theme of ['default', 'catppuccin-latte']) {
    await rpc('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, attached.sessionId);
    await evaluate(`theme(${JSON.stringify(theme)});document.documentElement.style.fontSize='16px'`);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, `Component overflow at ${width}/${theme}`);
    const contrast = await evaluate(`(()=>{const rgb=c=>{const x=document.createElement('canvas').getContext('2d');x.fillStyle=c;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)},lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return ['.lh-lesson-eyebrow','.lh-lesson-page-count','.lh-lesson-feedback-status'].map(s=>{const e=document.querySelector(s),bg=e.closest('.lh-lesson-content,.lh-lesson-feedback');return ratio(lum(getComputedStyle(e).color),lum(getComputedStyle(bg).backgroundColor))})})()`);
    assert(contrast.every(value => value >= 4.5), `Scoped text contrast at ${theme}: ${contrast}`);
    results.push({ width, theme, overflow: false, minimum_scoped_text_contrast: Math.min(...contrast) });
  }
  console.log('PASS real plugin/CSS composition fits 320/768/1440 CSS pixels in two native preset palettes; scoped lesson labels exceed 4.5:1 contrast');
  await rpc('Emulation.setDeviceMetricsOverride', { width: 320, height: 1000, deviceScaleFactor: 1, mobile: true }, attached.sessionId);
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }, attached.sessionId);
  assert.equal(await evaluate('matchMedia("(pointer:coarse)").matches'), true);
  assert.equal(await evaluate('[...document.querySelectorAll(".lh-lesson-controls button,.lh-code-viewer button")].every(b=>b.getBoundingClientRect().height>=44)'), true);
  await evaluate(`document.documentElement.style.fontSize='32px'`);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, 'Component overflow with larger text');
  await evaluate(`document.querySelector('#closed button').focus()`); assert.equal(await evaluate('document.activeElement===document.querySelector("#closed button")'), false);
  await rpc('Emulation.setTouchEmulationEnabled', { enabled: false }, attached.sessionId);
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, attached.sessionId);
  await evaluate(`theme('default');document.documentElement.style.fontSize='16px';document.activeElement.blur()`);
  await rpc('Page.bringToFront', {}, attached.sessionId);
  await rpc('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, attached.sessionId);
  await rpc('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, attached.sessionId);
  assert.equal(await evaluate('document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineWidth === "2px"'), true);
  await rpc('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, attached.sessionId);
  assert.equal(await evaluate('parseFloat(getComputedStyle(document.querySelector(".lh-code-viewer button")).transitionDuration)<=0.00001'), true);
  console.log('PASS scoped touch buttons are at least 44px; larger text stays in bounds; inert navigation cannot take focus; keyboard outline and reduced motion work');
  await evaluate('document.activeElement.blur()');
  for (const [name, width, theme] of [['desktop-dark',1440,'default'],['desktop-light',1440,'catppuccin-latte'],['narrow',320,'default']]) {
    await rpc('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, attached.sessionId);
    await evaluate(`theme(${JSON.stringify(theme)})`);
    const height = await evaluate('Math.max(innerHeight,document.documentElement.scrollHeight)');
    const shot = await rpc('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } }, attached.sessionId);
    await writeFile(`/artifacts/${name}.png`, Buffer.from(shot.data, 'base64'));
  }
  await writeFile('/artifacts/results.json', JSON.stringify({ scope: 'Component browser QA with real plugin modules/CSS and controlled host widget substitutes; native preset palettes. Not full React/model verification.', results, touch_minimum_height:44, larger_text:'passed at 320px with 32px root text', keyboard_focus:'passed', inert_focus:'passed', reduced_motion:'passed' }, null, 2)+'\n');
  console.log('PASS saved labeled component preview screenshots and scoped results');
} finally { for (const waiter of pending.values()) clearTimeout(waiter.timer); socket?.close(); chrome?.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
