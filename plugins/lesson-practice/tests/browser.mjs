// Run only in the reviewed credential-free bubblewrap environment.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
assert.equal(process.env.LH_NATIVE_BROWSER_ISOLATED, '1');
for (const privatePath of ['/home', '/run', '/var/run']) await assert.rejects(access(privatePath));
const formats = [];
createRequire(import.meta.url)('/example/backend.cjs').activate({ registerQuestionType: () => () => {}, registerLessonFormat(format) { formats.push({ pluginId: 'lesson-formats', key: 'lesson-formats:' + format.id, format }); return () => {}; } });
const fixture = `import {activate} from '/main.js';import {activate as activateFormats} from '/example.js';
const catalog=${JSON.stringify(formats)}, fences=new Map(), extraQuestions=new Map(), markdownProps=[];
const questions=new Map(),tools=new Map(),actions=new Map();let settingsMount;
const config={workflow:'lesson-quiz',output:'text',visual:'mermaid',quizTypes:['multiple-choice','open','fill-blank','flashcard']};
const lessons=[{id:'first-step',title:'First lesson',settings:structuredClone(config)},{id:'second-step',title:'Second lesson',settings:structuredClone(config)}];let lastSettingsTarget=null;
const ui={
 mountButton(container,initial,{signal}){let props={...initial};const b=document.createElement('button');container.append(b);const paint=()=>{b.textContent=props.label;b.disabled=!!props.disabled};b.onclick=()=>props.onClick();paint();const h={update(p){Object.assign(props,p);paint()},dispose(){b.remove()}};signal.addEventListener('abort',()=>h.dispose(),{once:true});return h},
 mountMarkdown(container,initial,{signal}){markdownProps.push(initial);const p=document.createElement('p');container.append(p);p.textContent=initial.text;const h={update(v){p.textContent=v.text},dispose(){p.remove()}};signal.addEventListener('abort',()=>h.dispose(),{once:true});return h},
 mountSettingsRows(container,initial){let props=initial;const root=document.createElement('div');container.append(root);const paint=()=>{root.replaceChildren();for(const row of props.rows){const label=document.createElement('label');label.textContent=row.label;const input=document.createElement(row.type==='dropdown'?'select':'input');input.dataset.key=row.key;if(row.type==='dropdown'){for(const o of row.options){const opt=document.createElement('option');opt.value=o.value;opt.textContent=o.label;input.append(opt)}input.value=row.value}else{input.type='checkbox';input.checked=row.value}input.onchange=()=>row.onChange(row.type==='dropdown'?input.value:input.checked);label.append(input);root.append(label)}};paint();return{update(p){props=p;paint()},dispose(){root.remove()}}},
 openDialog(){throw new Error('No unrelated dialog is opened during activation')}
};
const scope=new AbortController();activate({signal:scope.signal,ui,registerQuestionRenderer(d){questions.set(d.id,d);return()=>questions.delete(d.id)},registerToolRenderer(d){tools.set(d.toolName,d);return()=>tools.delete(d.toolName)},registerSettings(m){settingsMount=m;return()=>{}},registerAction(a){actions.set(a.id,a);return()=>{}},placeAction(p){if(p.location!=='top-bar')throw new Error('Unexpected new navigation');return()=>{}},async call(name,input){if(name==='formats')return structuredClone(catalog);if(name==='session')return {settings:structuredClone(config),session:{lessons:structuredClone(lessons)}};if(name==='lesson-settings'){await new Promise(r=>setTimeout(r,50));lastSettingsTarget=input.lessonId;const item=lessons.find(l=>l.id===input.lessonId);Object.assign(item.settings,input.settings);return structuredClone(item)}if(name==='get-settings')return structuredClone(config);if(name==='save-settings'){Object.assign(config,input);return structuredClone(config)}throw new Error('Unexpected operation '+name)}});
activateFormats({ui,registerQuestionRenderer(d){extraQuestions.set(d.id,d);return()=>extraQuestions.delete(d.id)},registerCodeBlock(d){fences.set(d.language,d);return()=>fences.delete(d.language)}});
window.fixture={questions,tools,actions,ui,config,lessons,catalog,fences,extraQuestions,markdownProps,getLastTarget:()=>lastSettingsTarget,settings:settingsMount,scope};window.ready=true;`;
const page = '<!doctype html><html><head><meta charset="utf-8"><title>Native plugin contract fixture</title></head><body><main id="slot"></main><script type="module" src="/fixture.js"></script></body></html>';
const server = http.createServer(async (req, res) => { if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(page); } else if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(fixture); } else if (req.url === '/example.js') { res.setHeader('content-type', 'text/javascript'); res.end(await readFile('/example/main.js', 'utf8')); } else if (req.url === '/main.js') { res.setHeader('content-type', 'text/javascript'); res.end(await readFile(new URL('../src/main.js', import.meta.url))); } else { res.statusCode = 404; res.end(); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let chrome, socket; const pending = new Map(); let serial = 0;
try {
  const address = await new Promise((resolve, reject) => {
    chrome = spawn('/opt/chrome/chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=/tmp/native-plugin-browser', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 15000);
    chrome.stderr.on('data', chunk => { const found = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (found) { clearTimeout(timer); resolve(found[1]); } }); chrome.on('error', reject);
  });
  socket = new WebSocket(address); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const message = JSON.parse(event.data), waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); clearTimeout(waiter.timer); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); };
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(() => reject(new Error('Browser timeout: ' + method)), 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const target = await rpc('Target.createTarget', { url: 'about:blank' }), attached = await rpc('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const evaluate = async expression => { const value = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, attached.sessionId); if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text); return value.result?.value; };
  const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('UI condition failed: ' + expression); };
  await rpc('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }, attached.sessionId); await wait('window.ready');
  assert.deepEqual(await evaluate('[...fixture.questions.keys()]'), ['lesson-fill-blank', 'lesson-flashcard']);
  await evaluate(`window.scope=new AbortController();window.answer=null;window.editor=fixture.questions.get('lesson-fill-blank').mountAnswerEditor(document.querySelector('#slot'),{active:true,answer:{status:'empty'},input:{payload:{reference:'Recall',explanation:'Try recall first.'}},questionId:'fill',signal:scope.signal,onChange(value){answer=value}})`);
  await evaluate(`document.querySelector('textarea').value='Recall';document.querySelector('textarea').dispatchEvent(new Event('input'))`); assert.equal(await evaluate('answer.status'), 'ready'); assert.equal(await evaluate('answer.value.value'), 'Recall');
  await evaluate('editor.update({active:false,answer});'); assert.equal(await evaluate('document.querySelector("textarea").disabled'), true); await evaluate('scope.abort()'); assert.equal(await evaluate('document.querySelector("#slot").children.length'), 0);
  console.log('PASS added fill-blank editor uses native controlled answer and cleanup contract');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.tools.get('lesson_correction').mount(document.querySelector('#slot'),{state:'output-available',output:{result:'incorrect',reference:'Recall',explanation:'Retrieval comes before feedback.'},signal:scope.signal})`);
  assert.equal(await evaluate('document.querySelector("#slot").innerText.includes("Correct answer")'), true);
  assert.equal(await evaluate('document.querySelector("#slot").innerText.includes("Recall")'), true);
  assert.equal(await evaluate('document.querySelector("#slot").innerText.includes("Retrieval comes before feedback.")'), true);
  assert.equal(await evaluate('fixture.markdownProps.at(-1).allowPluginFences'), true);
  await evaluate('cleanup();scope.abort()');
  console.log('PASS lesson correction visibly shows the committed answer and explanation without opening the native Why control');
  await evaluate(`window.scope=new AbortController();window.answer=null;window.editor=fixture.questions.get('lesson-flashcard').mountAnswerEditor(document.querySelector('#slot'),{active:true,answer:{status:'empty'},input:{payload:{reference:'REFERENCE SECRET',explanation:'Recall first.'}},questionId:'card',signal:scope.signal,onChange(value){answer=value}})`);
  assert.equal(await evaluate('document.body.innerText.includes("REFERENCE SECRET")'), false);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Reveal answer').click()`); assert.equal(await evaluate('document.body.innerText.includes("REFERENCE SECRET")'), true); assert.equal(await evaluate('answer.status'), 'unready');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Answer revealed').disabled`), true);
  await evaluate('editor.update({active:true,answer})');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Answer revealed').disabled`), true);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='I recalled it').click()`); assert.equal(await evaluate('answer.value.value'), 'good'); await evaluate('scope.abort()');
  console.log('PASS flashcard reveal alone cannot publish successful recall');
  await evaluate(`(async()=>{window.scope=new AbortController();window.cleanup=await fixture.settings(document.querySelector('#slot'),scope.signal)})()`);
  await evaluate(`const select=document.querySelector('select[data-key="output"]');select.value='slides';select.dispatchEvent(new Event('change'))`); await wait('fixture.config.output === "slides"'); await evaluate('cleanup();scope.abort()');
  console.log('PASS native settings rows save lesson-output preference');
  await evaluate(`fixture.ui.openDialog=(props)=>{const scope=new AbortController(),slot=document.createElement('div');document.body.append(slot);window.dialogScope=scope;window.dialogDispose=()=>{scope.abort();window.dialogCleanup?.();slot.remove()};Promise.resolve(props.content(slot,scope.signal)).then(cleanup=>window.dialogCleanup=cleanup);return {dispose:window.dialogDispose}};fixture.actions.get('lesson-options').run({surface:'session',sessionId:'native-session'})`);
  await wait('!!document.querySelector("select[data-key=lesson]")');
  await evaluate(`(()=>{let select=document.querySelector('select[data-key=lesson]');select.value='first-step';select.dispatchEvent(new Event('change'));select=document.querySelector('select[data-key=output]');select.value='video';select.dispatchEvent(new Event('change'));select=document.querySelector('select[data-key=lesson]');select.value='second-step';select.dispatchEvent(new Event('change'))})()`);
  await wait('fixture.getLastTarget() === "first-step"');
  assert.equal(await evaluate('document.querySelector("select[data-key=output]").value'), 'text');
  await evaluate(`(()=>{const select=document.querySelector('select[data-key=lesson]');select.value='first-step';select.dispatchEvent(new Event('change'))})()`);
  assert.equal(await evaluate('document.querySelector("select[data-key=output]").value'), 'video');
  await evaluate(`for(const key of ['open','flashcard']){const input=document.querySelector('input[data-key="'+key+'"]');input.checked=false;input.dispatchEvent(new Event('change'))}`);
  await wait('fixture.lessons[0].settings.quizTypes.length === 2');
  assert.deepEqual(await evaluate('fixture.lessons[0].settings.quizTypes'), ['multiple-choice', 'fill-blank']);
  for (const [field, key] of [['workflow', 'reflection'], ['output', 'deck'], ['visual', 'flow']]) {
    await evaluate(`(()=>{const select=document.querySelector('select[data-key=${field}]');select.value='lesson-formats:${key}';select.dispatchEvent(new Event('change'))})()`);
    await wait(`fixture.lessons[0].settings.${field} === 'lesson-formats:${key}'`);
  }
  await evaluate(`(()=>{const input=document.querySelector('input[data-key="lesson-formats:numeric"]');input.checked=true;input.dispatchEvent(new Event('change'))})()`);
  await wait('fixture.lessons[0].settings.quizTypes.includes("lesson-formats:numeric")');
  await evaluate('dialogDispose()');
  console.log('PASS any lesson can be selected; concurrent saves retain the target; a separate plugin supplies selectable quiz, structure, output and diagram choices');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.tools.get('lesson_begin').mount(document.querySelector('#slot'),{state:'output-available',output:{showExplanation:true,lesson:{id:'step',nodeId:'landmark',title:'A small lesson',text:${JSON.stringify('First paragraph.\n\nSecond paragraph.')},settings:{output:'slides'}}},signal:scope.signal})`);
  assert.equal(await evaluate('document.body.innerText.includes("First paragraph")'), true); await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Next').click()`); assert.equal(await evaluate('document.body.innerText.includes("Second paragraph")'), true); await evaluate('cleanup();scope.abort()');
  console.log('PASS slides render in a native tool card without creating a replacement page');
  const diagramLesson = 'Before.\n\n```mermaid\ngraph TD\n\nA-->B\n```\n\nAfter.';
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.tools.get('lesson_begin').mount(document.querySelector('#slot'),{state:'output-available',output:{showExplanation:true,lesson:{id:'step',nodeId:'landmark',title:'Diagram',text:${JSON.stringify(diagramLesson)},settings:{output:'slides'}}},signal:scope.signal});[...document.querySelectorAll('button')].find(b=>b.textContent==='Next').click()`);
  assert.equal(await evaluate(`document.querySelector('#slot p').textContent.includes(${JSON.stringify('```mermaid\ngraph TD\n\nA-->B\n```')})`), true);
  await evaluate('cleanup();scope.abort()');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.tools.get('lesson_begin').mount(document.querySelector('#slot'),{state:'output-available',output:{showExplanation:true,lesson:{id:'step',nodeId:'landmark',title:'Custom output',text:${JSON.stringify(diagramLesson)},settings:{output:'lesson-formats:deck'},formats:fixture.catalog}},signal:scope.signal})`);
  assert.equal(await evaluate('fixture.markdownProps.at(-1).allowPluginFences'), true);
  assert.equal(await evaluate(`fixture.markdownProps.at(-1).text.startsWith(${JSON.stringify('````lesson-deck\n')})`), true);
  await evaluate('cleanup();scope.abort()');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.fences.get('lesson-deck').mount(document.querySelector('#slot'),{source:${JSON.stringify('First slide.\n---\nSecond slide.')},signal:scope.signal})`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Next slide').click()`);
  assert.equal(await evaluate('document.querySelector("#slot").innerText.includes("Second slide")'), true);
  await evaluate('cleanup();scope.abort()');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.fences.get('lesson-flow').mount(document.querySelector('#slot'),{source:JSON.stringify({nodes:[{id:'a',label:'Recall'},{id:'b',label:'Feedback'}],edges:[['a','b']]}),signal:scope.signal})`);
  assert.equal(await evaluate('document.querySelectorAll("svg rect").length'), 2);
  assert.equal(await evaluate('document.querySelector("svg path[marker-end]").getAttribute("d")'), 'M 250 65 L 250 110');
  await evaluate('cleanup();scope.abort()');
  assert.equal(await evaluate('document.querySelectorAll("svg").length'), 0);
  console.log('PASS fenced diagrams stay intact in slides; custom output opts into native fences; contributed slide and SVG renderers mount and clean up');
  await evaluate(`window.scope=new AbortController();window.cleanup=fixture.tools.get('lesson_begin').mount(document.querySelector('#slot'),{state:'output-available',output:{showExplanation:true,lesson:{id:'step',nodeId:'landmark',title:'A small lesson',text:'Recall the idea before checking the answer.',settings:{output:'video'}}},signal:scope.signal})`);
  assert.equal(await evaluate('document.querySelector("canvas").hidden'), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop video').disabled`), true);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Create captioned video').click()`); await wait('document.querySelector("video")?.videoWidth === 1280'); assert.equal(await evaluate('document.querySelector("a[download]").getAttribute("href").startsWith("blob:")'), true); await evaluate('cleanup();scope.abort()');
  console.log('PASS native lesson-card video encodes, decodes and exposes a download');
} finally { for (const entry of pending.values()) clearTimeout(entry.timer); socket?.close(); chrome?.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
