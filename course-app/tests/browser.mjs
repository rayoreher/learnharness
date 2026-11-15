// Run only in the explicit credential-free bubblewrap command documented in
// VERIFICATION.md. No third-party automation library or browser downloads.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, access, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../server.mjs';

assert.equal(process.env.LH_COURSE_ISOLATED_BROWSER, '1', 'Use the reviewed isolated browser command.');
for (const privatePath of ['/home', '/run', '/var/run']) await assert.rejects(access(privatePath), 'Host home and runtime directories must not be mounted.');
const directory = await mkdtemp('/tmp/lh-browser-data-');
const running = await startServer({ port: 0, directory, codex: { status: async () => ({ available: true, connected: false }), close: async () => {} } });
let chrome, socket;
const pending = new Map(); let counter = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser did not start.')), 12000);
    chrome = spawn(process.env.LH_COURSE_CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=/tmp/lh-browser-profile', 'about:blank'], { env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C.UTF-8' }, stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', chunk => { const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    chrome.on('error', error => { clearTimeout(timer); reject(error); });
    chrome.on('exit', code => { if (code) { clearTimeout(timer); reject(new Error(`Browser exited ${code}.`)); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data); const entry = pending.get(message.id); if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  };
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const target = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const command = (method, params) => rpc(method, params, sessionId);
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description ?? ''));
    return result.result?.value;
  };
  const wait = async (expression, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`UI condition did not become true: ${expression}\n${await evaluate('document.body.innerText')}`);
  };
  const click = async label => { await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => !x.disabled && x.textContent.includes(${JSON.stringify(label)})); if (!b) throw new Error('Button missing: '+${JSON.stringify(label)}); b.click(); })()`); };
  const chooseFormat = async value => { await evaluate(`(() => { const s = document.querySelector('.practice select[aria-label="format"]'); if (!s) throw new Error('Format selector missing'); s.value=${JSON.stringify(value)}; s.dispatchEvent(new Event('change',{bubbles:true})); })()`); };
  const screenshot = async name => { const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join('/artifacts', name), Buffer.from(image.data, 'base64')); };
  await command('Page.enable'); await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: running.url });
  await wait('document.querySelector(".hero h1")?.textContent === "Make it make sense."');
  await screenshot('course-home.png'); console.log('PASS: workspace loads in a real browser');
  await click('Explore a sample'); await wait('!!document.querySelector(".reading") && !document.querySelector(".option")?.disabled');
  await evaluate('[...document.querySelectorAll(".option")].find(x=>x.textContent.includes("Highlighting an answer")).focus()');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  assert.ok(await evaluate('document.activeElement.textContent.includes("Highlighting an answer")'), 'Keyboard choice must retain focus after rendering.');
  await click('Check my answer'); await wait('!!document.querySelector(".feedback.incorrect")');
  assert.match(await evaluate('document.querySelector(".feedback").innerText'), /Explaining the idea/);
  await click('Continue →'); await wait('!!document.querySelector("textarea#answer")');
  await evaluate('document.querySelector("#answer").value="Trying first shows what I remember.";document.querySelector("#answer").dispatchEvent(new Event("input",{bubbles:true}))');
  await click('Check my answer'); await wait('!![...document.querySelectorAll("button")].find(x=>x.textContent==="Needs practice" && !x.disabled)');
  await click('Needs practice'); await wait('!!document.querySelector(".feedback.incorrect")'); await click('Continue →');
  await wait('!![...document.querySelectorAll("button")].find(x=>x.textContent==="Reveal answer" && !x.disabled)');
  await click('Reveal answer'); await wait('!![...document.querySelectorAll("button")].find(x=>x.textContent==="I recalled it" && !x.disabled)');
  await click('I recalled it'); await wait('!!document.querySelector(".feedback.correct")'); await click('Continue →');
  await wait('!![...document.querySelectorAll("button")].find(x=>x.textContent.includes("Complete lesson") && !x.disabled)');
  await click('Complete lesson'); await wait('document.querySelector(".lesson-heading h1")?.textContent === "Leave room between attempts"');
  console.log('PASS: wrong/open/flashcard feedback and forward lesson progression');
  await click('Review 1 concept'); await wait('!!document.querySelector(".panel .options") && !document.querySelector(".option")?.disabled');
  await click('Explaining the idea with the notes closed'); await click('Check my answer'); await wait('!!document.querySelector(".feedback.correct")'); await click('Continue →');
  await wait('document.body.innerText.includes("Your queue is clear.")');
  await command('Page.reload'); await wait('document.body.innerText.includes("Your queue is clear.")');
  console.log('PASS: missed concepts return, clear after correct recall, and survive reload');
  await click('Back to your lessons'); await wait('!!document.querySelector(".reading")');
  const before = await evaluate('fetch("/api/course-studio/state").then(r=>r.json()).then(s=>Object.values(s.progress).map(p=>({attempts:p.attempts.length,completed:p.completedLessons.length,reviews:p.reviews.length})))');
  await chooseFormat('slides'); await wait('!!document.querySelector(".output-slides .slide")');
  await screenshot('course-slides.png');
  const firstScene = await evaluate('document.querySelector(".slide").innerText'); await click('Next →');
  assert.notEqual(await evaluate('document.querySelector(".slide").innerText'), firstScene);
  await chooseFormat('interactive'); await wait('!!document.querySelector(".output-interactive .slide")');
  await click('Explore this step'); await wait('!document.querySelector(".output-interactive .slide button") && !!document.querySelector(".output-interactive .slide p:last-child")');
  console.log('PASS: slide and interactive outputs use the saved lesson');
  await chooseFormat('video'); await wait('!!document.querySelector(".output-video canvas")');
  await click('Create captioned video');
  await wait('document.querySelector(".output-video video")?.getAttribute("src")?.startsWith("blob:")', 70000);
  await wait('document.querySelector(".output-video video")?.videoWidth === 1280 && document.querySelector(".output-video video")?.readyState >= 2');
  await mkdir('/tmp/video-exports');
  await rpc('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp/video-exports' });
  await evaluate('document.querySelector(".output-video a[download]").click()');
  let downloaded;
  for (let i = 0; i < 100; i++) { downloaded = (await readdir('/tmp/video-exports')).find(name => /\.(webm|mp4)$/.test(name)); if (downloaded) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(downloaded, 'A video artifact must be downloadable.');
  const video = await readFile(path.join('/tmp/video-exports', downloaded)); assert.ok(video.length > 1000);
  if (downloaded.endsWith('.webm')) assert.deepEqual([...video.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
  await writeFile(path.join('/artifacts', downloaded), video);
  console.log(`PASS: actual captioned video decoded and downloaded (${video.length} bytes)`);
  await screenshot('course-video.png');
  const after = await evaluate('fetch("/api/course-studio/state").then(r=>r.json()).then(s=>Object.values(s.progress).map(p=>({attempts:p.attempts.length,completed:p.completedLessons.length,reviews:p.reviews.length})))');
  assert.deepEqual(after, before);
  await chooseFormat('text'); await wait('!!document.querySelector(".output-text")');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('course-mobile.png');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile layout must not overflow horizontally.');
  assert.ok(await evaluate('[...document.querySelectorAll("nav[aria-label=\\"Main navigation\\"] button")].every(b=>b.getBoundingClientRect().right <= innerWidth)'), 'Main navigation should fit on mobile.');
  console.log('PASS: output switches preserve all learning records; mobile width fits');
  console.log('Browser acceptance complete.');
} finally {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Browser test finished.')); }
  socket?.close(); chrome?.kill('SIGTERM'); await running.close();
}
