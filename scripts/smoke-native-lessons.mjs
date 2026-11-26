// Full native app; only the normal OpenAI-compatible model endpoint is scripted.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);const {launch}=require('puppeteer-core');
const chrome=process.env.CHROME_PATH;if(!chrome)throw Error('Set CHROME_PATH to the reviewed browser executable.');
const appPort=await new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const origin='http://127.0.0.1:'+appPort;
const isolatedEnv=Object.fromEntries(['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','FONTCONFIG_PATH'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
const out=process.argv[2]?path.resolve(process.argv[2]):fs.mkdtempSync(path.join(os.tmpdir(),'lh-native-lessons-evidence-'));fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'lh-native-lessons-profile-'));
fs.cpSync(path.join(root,'examples/plugins/lesson-formats/dist'),path.join(profile,'data/plugins/lesson-formats/dist'),{recursive:true});
const calls=[];const errors=[];let stage=0,sequence=0,quizId,openId;let phase='start',browser,page,app;
let responseMode='normal', heldAborted=false, failedRequests=0;
const extraDecisions=[];
const lessonText="A derivative tells you the local rate of change. A positive slope means the function rises as x increases.\n\nFor f(x) = x², the derivative is 2x. At x = 3, the slope is 6. To lower the function, take a small step in the opposite direction.\n\n```python\ndef slope(x):\n    return 2 * x\n\nprint(slope(3))\n```\n\n```mermaid\nflowchart LR\n  A[Measure the slope] --> B[Move in the opposite direction]\n  B --> C[Check the new value]\n```";
function choose(body) {
  const names=(body.tools??[]).map(t=>t.function.name);
  const tool=(name,args)=>{assert.ok(names.includes(name),'Native tool is available: '+name);const id='qa-call-'+(++sequence);if(name==='quiz'&&stage===4)quizId=id;if(name==='explain')openId=id;return {name,args,id};};
  if(!names.length)return {text:'Gradients, step by step'};
  if(!names.includes('plan_init')) {
    const concluded=body.messages.some(m=>m.tool_calls?.some(c=>c.function.name==='probe_done'));
    return concluded?{text:'Your starting point is clear. Let’s build the plan.'}:tool('probe_done',{assessment:{strands:[{strand:'Rates of change',assessment:'The learner knows squares and wants to connect slope to a gradient update.'}],summary:'Learn one small step at a time with mixed practice.'}});
  }
  if(extraDecisions.length){const next=extraDecisions.shift();return next.text?next:tool(next.name,next.args);}
  const step=stage++;
  if(step===0)return tool('plan_init',{mermaid:'graph LR\n  slope[Read a slope] --> update[Choose a direction]\n  update --> step[Choose a step size]\n  step --> repeat[Repeat an update]\n  repeat --> check[Check progress]'});
  if(step===1)return {text:'We’ll start with slope, then choose a direction and a step size. Each small lesson has its own practice. Ready to begin?'};
  if(step===2)return tool('lesson_begin',{lessonId:'slope-1',nodeId:'slope',title:'Read the slope',text:lessonText});
  if(step===3)return tool('quiz',{type:'check',nodeId:'slope',question:'For f(x) = x² at x = 3, which move initially lowers f(x)?',options:[{label:'Decrease x',value:'decrease'},{label:'Increase x',value:'increase'},{label:'Keep x unchanged',value:'same'}],explanation:'The derivative is 2x = 6. Moving opposite this positive slope means decreasing x.',correctAnswer:'decrease'});
  if(step===4)return tool('lesson_correction',{questionId:quizId});
  if(step===5)return tool('explain',{type:'check',nodeId:'slope',question:'In one sentence, what does the derivative tell us?',correctAnswer:'The derivative measures the instantaneous rate of change: how the function changes for a small change in its input.'});
  if(step===6)return tool('lesson_feedback',{questionId:openId,result:'correct',explanation:'Yes. The derivative measures the local rate of change, including its direction.'});
  if(step===7)return tool('lesson_blank',{type:'check',nodeId:'slope',question:'A derivative measures the instantaneous ____.',payload:{quizType:'fill-blank',lessonId:'slope-1',conceptId:'slope-1',reference:'rate of change',explanation:'A derivative describes how the output changes locally as the input changes.',options:[],review:false}});
  if(step===8)return tool('lesson_card',{type:'check',nodeId:'slope',question:'Which direction should a small gradient step take to reduce a function?',payload:{quizType:'flashcard',lessonId:'slope-1',conceptId:'slope-1',reference:'Move opposite the gradient.',explanation:'The gradient points uphill, so its opposite points toward a lower value.',options:[],review:false}});
  if(step===9)return tool('lesson_finish',{lessonId:'slope-1'});
  if(step===10)return tool('lesson_begin',{lessonId:'direction-1',nodeId:'update',title:'Choose a direction',text:'A gradient update subtracts a small multiple of the slope.\n\nSubtracting a positive slope moves x lower. This connects the slope to an actual update.',settings:{quizTypes:['multiple-choice'],output:'slides'}});
  if(step===11)return tool('quiz',{type:'check',nodeId:'update',question:'In x_new = x − α × slope, what does α control?',options:[{label:'The step size',value:'size'},{label:'The number of variables',value:'variables'}],explanation:'The learning rate α scales the size of the update.',correctAnswer:'size'});
  if(step===12)return tool('lesson_finish',{lessonId:'direction-1'});
  if(step===13)return tool('lesson_revisit',{lessonId:'slope-1'});
  if(step===14)return tool('quiz',{type:'check',nodeId:'slope',question:'Review: with a positive slope, which direction lowers the function locally?',options:[{label:'Move x lower',value:'lower'},{label:'Move x higher',value:'higher'}],explanation:'A small move opposite a positive slope lowers the function.',correctAnswer:'lower'});
  if(step===15)return tool('lesson_status',{});
  return {text:'You completed both small lessons and corrected the earlier missed concept. Your review queue is now clear.'};
}
const model=http.createServer(async(request,response)=>{
  try {
    if(request.method==='GET'&&request.url==='/v1/models'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({data:[{id:'native-qa',context_length:131072,max_output_tokens:8192}]}));return;}
    if(request.method!=='POST'||request.url!=='/v1/chat/completions'){response.writeHead(404);response.end();return;}
    const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('Fixture request bound');chunks.push(chunk);}
    assert.ok(calls.length<80,'No runaway fixture calls');const body=JSON.parse(Buffer.concat(chunks).toString());
    if(responseMode==='fail') {
      failedRequests++;
      response.writeHead(400,{'Content-Type':'application/json'});
      response.end(JSON.stringify({error:{message:'Offline recovery check: model temporarily unavailable.',type:'fixture_error'}}));return;
    }
    if(responseMode==='hold') {
      response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      response.write('data: '+JSON.stringify({id:'qa-cancel',object:'chat.completion.chunk',model:'native-qa',choices:[{index:0,delta:{role:'assistant',content:'Preparing the next explanation…'},finish_reason:null}]})+'\n\n');
      response.once('close',()=>{heldAborted=true;});return;
    }
    const decision=choose(body);calls.push({stage,body,decision});fs.writeFileSync(out+'/model-calls.json',JSON.stringify(calls,null,2));
    const message=decision.text?{role:'assistant',content:decision.text}:{role:'assistant',content:null,tool_calls:[{id:decision.id,type:'function',function:{name:decision.name,arguments:JSON.stringify(decision.args)}}]};
    if(!body.stream){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({id:'qa-'+calls.length,object:'chat.completion',model:'native-qa',choices:[{index:0,message,finish_reason:decision.text?'stop':'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}}));return;}
    response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    const delta=decision.text?message:{...message,tool_calls:message.tool_calls.map(call=>({index:0,...call}))};delete delta.content;if(decision.text)delta.content=decision.text;
    const chunk=(delta,finish_reason=null)=>({id:'qa-'+calls.length,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'native-qa',choices:[{index:0,delta,finish_reason}]});
    response.write('data: '+JSON.stringify(chunk(delta))+'\n\n');response.write('data: '+JSON.stringify({...chunk({},decision.text?'stop':'tool_calls'),usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})+'\n\n');response.end('data: [DONE]\n\n');
  } catch(error){errors.push(String(error));response.writeHead(500);response.end(JSON.stringify({error:{message:String(error)}}));}
});
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
const log=fs.openSync(out+'/server.log','w');
app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{cwd:root,env:{...isolatedEnv,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'production',LH_DATA_DIR:profile+'/data',LH_AUTH_FILE:profile+'/auth.json',LH_IGNORE_ENV_KEYS:'1'},stdio:['ignore',log,log]});
try {
  for(let attempt=0;attempt<200;attempt++){if(app.exitCode!==null)throw Error('App exited');try{if((await fetch(origin+'/chat/new')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await launch({executablePath:chrome,headless:true,args:[
    ...(process.env.LH_QA_EXTERNAL_ISOLATION==='1'?['--no-sandbox']:[]),
    '--disable-dev-shm-usage',
  ],userDataDir:profile+'/browser'});
  page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(origin+'/chat/new',{waitUntil:'networkidle2'});
  phase='configure normal provider and plugins';
  const configured=await page.evaluate(async baseUrl=>{
    const get=await fetch('/api/custom-provider');const revision=get.headers.get('etag');
    const provider=await fetch('/api/custom-provider',{method:'POST',headers:{'Content-Type':'application/json','if-match':revision},body:JSON.stringify({baseUrl,authMode:'keyless'})});
    const models=await fetch('/api/settings/models',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(['strong','cheap','vision'].map(slot=>[slot,{model:{provider:'custom',id:'native-qa'},thinkingLevel:'off'}])))});
    return {provider:{status:provider.status,body:await provider.json()},models:{status:models.status,body:await models.json()}};
  },'http://127.0.0.1:'+model.address().port+'/v1');
  fs.writeFileSync(out+'/configuration.json',JSON.stringify(configured,null,2));assert.equal(configured.provider.status,200);assert.equal(configured.models.status,200);
  await page.reload({waitUntil:'networkidle2'});
  phase='enable and configure through actual Settings';
  await page.locator('[data-testid="settings-entry"]').click();
  await page.locator('[data-testid="settings-nav-core-plugins"]').click();
  for(const id of ['lesson-practice','code-viewer']) {
    await page.locator(`[data-testid="plugin-${id}"] [role="switch"][aria-checked="false"]`).click();
    await page.waitForSelector(`[data-testid="plugin-${id}"] [role="switch"][aria-checked="true"]:not(:disabled)`);
  }
  await page.locator('[aria-label="Settings for Lessons and mixed practice"]').click();
  await page.waitForSelector('[aria-label="Lesson output"]');
  await page.select('[aria-label="Lesson output"]','slides');
  await page.waitForSelector('[aria-label="Lesson output"]:not(:disabled)');
  assert.equal(await page.$eval('[aria-label="Lesson output"]',control=>control.value),'slides');
  await page.select('[aria-label="Lesson output"]','text');
  await page.waitForSelector('[aria-label="Lesson output"]:not(:disabled)');
  await page.locator('[data-testid="settings-nav-plugins"]').click();
  await page.locator('[data-testid="plugin-lesson-formats"] [role="switch"][aria-checked="false"]').click();
  await page.waitForSelector('[data-testid="plugin-lesson-formats"] [role="switch"][aria-checked="true"]:not(:disabled)');
  await page.screenshot({path:out+'/settings-activation.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="settings-dialog"]',{hidden:true});
  await page.reload({waitUntil:'networkidle2'});
  phase='start native session';await page.locator('[contenteditable="true"]').fill('I want to learn gradient descent through small lessons and mixed quizzes. I know squares but I am new to derivatives.');await page.locator('[aria-label="Send"]').click();
  await page.waitForFunction(()=>document.body.innerText.includes('Ready to begin?'),{timeout:45000});
  await page.screenshot({path:out+'/plan.png',fullPage:true});
  phase='accept plan';await page.locator('[contenteditable="true"]').fill('Start the lessons.');await page.locator('[aria-label="Send"]').click();
  await page.waitForFunction(()=>document.body.innerText.includes('which move initially lowers f(x)?'),{timeout:45000});
  phase='open first native quiz';await page.locator('[data-testid="teach-check-reveal"]').click();
  await page.waitForSelector('[role="radio"]');
  await page.screenshot({path:out+'/first-lesson-question.png',fullPage:true});
  fs.writeFileSync(out+'/first-question-dom.json',JSON.stringify(await page.evaluate(()=>({text:document.body.innerText,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText,label:b.getAttribute('aria-label'),role:b.getAttribute('role'),testid:b.getAttribute('data-testid'),html:b.getAttribute('role')==='radio'?b.outerHTML:null})),inputs:[...document.querySelectorAll('input,textarea,[contenteditable]')].map(e=>e.outerHTML.slice(0,1500))})),null,2));
  const sessionId=page.url().split('/').pop();
  async function state() {
    const result=await page.evaluate(async chatId=>{const response=await fetch('/api/plugins/lesson-practice/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'session',input:{chatId}})});return {status:response.status,body:await response.json()};},sessionId);
    assert.equal(result.status,200);return result.body.result;
  }
  async function question(text) {
    await page.waitForFunction(value=>document.body.innerText.includes(value),{timeout:30000},text);
    const reveal=await page.$('[data-testid="teach-check-reveal"]');if(reveal&&await reveal.isVisible())await page.locator('[data-testid="teach-check-reveal"]').click();
  }
  async function submit(){await page.locator('aria/Submit answer').click();}
  phase='wrong native answer with confidence';
  await page.locator('aria/Increase x').click();
  await page.locator('[data-testid="confidence-slider"]').click();await page.keyboard.press('End');
  assert.equal(await page.$eval('[data-testid="confidence-slider"]',element=>element.value),'100');
  await submit();
  await question('In one sentence, what does the derivative tell us?');
  await page.waitForFunction(()=>document.body.innerText.includes('Correct answer'));
  const wrong=await state();assert.equal(wrong.session.reviews.length,1);assert.equal(wrong.session.attempts[0].result,'incorrect');assert.equal(wrong.session.attempts[0].confidence,100);
  await page.screenshot({path:out+'/wrong-answer-correction.png',fullPage:true});
  phase='accepted open response';
  await page.locator('[data-testid="answer-field"] [contenteditable="true"]').fill('It tells us the instantaneous rate of change of the function.');await submit();
  await question('A derivative measures the instantaneous');
  phase='plugin disable and recover pending blank';
  await page.waitForSelector('.lh-lesson-answer-editor textarea');
  async function enabled(value){const result=await page.evaluate(async enabled=>{const response=await fetch('/api/plugins/lesson-practice',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});return response.status;},value);assert.equal(result,200);}
  await enabled(false);await page.waitForFunction(()=>document.body.innerText.includes('Question unavailable'));
  await enabled(true);await page.waitForSelector('.lh-lesson-answer-editor textarea');
  await page.locator('.lh-lesson-answer-editor textarea').fill('rate of change');await submit();
  await question('Which direction should a small gradient step take');
  const afterBlank=await state();assert.equal(afterBlank.session.reviews.length,1,'Correct first-pass answers cannot clear the earlier miss');
  phase='flashcard recall';await page.locator('aria/Reveal answer').click();await page.locator('aria/I recalled it').click();await submit();
  await question('In x_new = x − α × slope, what does α control?');
  await page.locator('aria/The step size').click();await submit();
  await question('Review: with a positive slope');
  const beforeReview=await state();assert.equal(beforeReview.session.reviews.length,1);assert.deepEqual(beforeReview.session.completed,['slope-1','direction-1']);
  phase='later correct review';await page.locator('aria/Move x lower').click();await submit();
  await page.waitForFunction(()=>document.body.innerText.includes('Your review queue is now clear.'),{timeout:30000});
  const final=await state();assert.equal(final.session.reviews.length,0);assert.equal(final.session.attempts.length,6);assert.equal(final.session.attempts.at(-1).review,true);
  await page.waitForFunction(()=>document.body.innerText.includes('Practice progress'));
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/LESSON_FINISH|LESSON_REVISIT|LESSON_STATUS/);
  await page.screenshot({path:out+'/completed-review.png',fullPage:true});
  const learningCalls=calls.length;
  async function sendText(text){await page.locator('[data-testid="composer"] [contenteditable="true"]').fill(text);await page.locator('[data-testid="composer"] [aria-label="Send"]').click();}
  phase='cancel an actual in-flight model stream';responseMode='hold';
  await sendText('Explain the next step slowly.');
  await page.waitForFunction(()=>document.body.innerText.includes('Preparing the next explanation'));
  await page.locator('[data-testid="composer"] [aria-label="Stop"]').click();
  await page.waitForSelector('[data-testid="composer"] [aria-label="Send"]');
  await page.waitForFunction(async chatId=>!(await(await fetch('/api/chats/'+chatId)).json()).turnInFlight,{},sessionId);
  assert.equal(heldAborted,true,'Stop closes the actual provider connection');
  assert.deepEqual((await state()).session.attempts,final.session.attempts,'Cancellation preserves accepted practice');
  await page.screenshot({path:out+'/cancelled-stream.png',fullPage:true});
  phase='visible model failure and ordinary retry';responseMode='fail';
  await sendText('Continue after the cancelled explanation.');
  await page.waitForSelector('[data-testid="retry-failed-turn"]',{visible:true});
  assert.ok(failedRequests>0);
  await page.waitForFunction(()=>document.body.innerText.includes('The model couldn’t finish its reply.'));
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerText),/fixture_error|model temporarily unavailable/,'Technical diagnostics start collapsed');
  await page.screenshot({path:out+'/model-error.png',fullPage:true});
  await page.setViewport({width:320,height:740});
  const errorCard=await page.$('[role="alert"]');await errorCard.scrollIntoView();
  const errorLayout=await page.$eval('[role="alert"]',element=>({width:element.clientWidth,scroll:element.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(errorLayout.scroll<=errorLayout.width&&errorLayout.page<=errorLayout.viewport,'Narrow model error stays readable without horizontal overflow');
  assert.equal(await errorCard.isIntersectingViewport({threshold:0.9}),true,'The narrow recovery message is visible');
  assert.ok(await page.$eval('[data-testid="retry-failed-turn"]',button=>button.getBoundingClientRect().height>=44),'Phone retry has a comfortable touch target');
  await page.screenshot({path:out+'/model-error-phone.png',fullPage:true});
  await page.setViewport({width:1440,height:1000});
  await page.locator('aria/Show details').click();
  await page.waitForFunction(()=>document.body.innerText.includes('model temporarily unavailable'));
  await page.screenshot({path:out+'/model-error-details.png',fullPage:true});
  responseMode='normal';await page.locator('[data-testid="retry-failed-turn"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-testid="retry-failed-turn"]')&&!!document.querySelector('[data-testid="composer"] [aria-label="Send"]'));
  assert.deepEqual((await state()).session.attempts,final.session.attempts,'Retry preserves accepted practice');
  await page.screenshot({path:out+'/model-recovered.png',fullPage:true});
  phase='native contributed deck, SVG and numeric question';
  extraDecisions.push(
    {name:'lesson_begin',args:{lessonId:'extension-1',nodeId:'step',title:'Choose a small step',text:'Start with a small learning rate.\n\n```lesson-flow\n{"nodes":[{"id":"start","label":"Measure slope"},{"id":"next","label":"Take a small step"}],"edges":[["start","next"]]}\n```\n\n---\n\nAt x = 3, the slope is 6.',settings:{output:'lesson-formats:deck',visual:'lesson-formats:flow',quizTypes:['lesson-formats:numeric']}}},
    {name:'lesson_numeric',args:{type:'check',nodeId:'step',question:'What is twice three?',payload:{lessonId:'extension-1',lessonFormat:'lesson-formats:numeric',reference:'6',explanation:'The derivative of x² is 2x, so at x = 3 it is 6.',review:false}}},
    {text:'The contributed numeric response is accepted.'},
  );
  await sendText('Show an example using the optional lesson formats.');
  await question('What is twice three?');
  await page.waitForSelector('[aria-label="Lesson flow diagram"]');
  await page.locator('aria/Next slide').click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Lesson: Choose a small step"]')?.innerText.includes('At x = 3, the slope is 6.'));
  await page.locator('aria/Previous slide').click();
  await page.waitForSelector('[aria-label="Lesson flow diagram"]');
  await question('What is twice three?');
  await page.locator('aria/Your number').fill('6');await submit();
  await page.waitForFunction(()=>document.body.innerText.includes('The contributed numeric response is accepted.'));
  const contributed=await state();assert.equal(contributed.session.attempts.length,7);assert.equal(contributed.session.attempts.at(-1).provenance,'numeric-answer-key');assert.equal(contributed.session.attempts.at(-1).result,'correct');
  await page.screenshot({path:out+'/contributed-formats.png',fullPage:true});
  phase='native captioned video';
  extraDecisions.push({name:'lesson_begin',args:{lessonId:'video-1',nodeId:'repeat',title:'Repeat an update',text:'Each update measures the slope again, then takes a small step in the opposite direction.',settings:{output:'video',quizTypes:['multiple-choice']}}},{text:'The captioned version is ready to create in the lesson.'});
  await sendText('Present the next small lesson as a captioned video.');
  await page.waitForFunction(()=>document.body.innerText.includes('The captioned version is ready to create in the lesson.')&&!!document.querySelector('[data-testid="composer"] [aria-label="Send"]'));
  await page.waitForSelector('[aria-label="Lesson: Repeat an update"]');
  assert.equal(await page.$eval('[aria-label="Lesson: Repeat an update"] canvas',canvas=>canvas.hidden),true);
  await page.locator('aria/Create captioned video').click();
  await page.waitForFunction(()=>document.body.innerText.includes('Creating scene'));
  await page.waitForFunction(()=>document.querySelector('[aria-label="Lesson: Repeat an update"] video')?.videoWidth===1280,{timeout:20000});
  assert.equal(await page.$eval('[aria-label="Lesson: Repeat an update"] a[download]',link=>link.href.startsWith('blob:')),true);
  await page.screenshot({path:out+'/captioned-video.png',fullPage:true});
  const presentation={contributedDeck:true,svg:true,numericAccepted:true,videoEncodedAndDecoded:true};
  phase='per-lesson options in the native dialog';
  await page.locator('[aria-label="More plugin actions"]').click();
  await page.locator('[data-plugin-action="lesson-practice/lesson-options-topbar"]').click();
  await page.waitForSelector('[role="dialog"][aria-label="Lesson options"]');
  await page.select('[aria-label="Apply to"]','slope-1');
  await page.select('[aria-label="Lesson output"]','slides');
  await page.waitForSelector('[aria-label="Lesson output"]:not(:disabled)');
  const optionsState=await state();
  assert.equal(optionsState.session.lessons.find(lesson=>lesson.id==='slope-1').settings.output,'slides');
  assert.equal(optionsState.settings.output,'text','Per-lesson options preserve defaults');
  assert.equal(optionsState.session.lessons.find(lesson=>lesson.id==='direction-1').settings.output,'slides');
  assert.deepEqual(optionsState.session.attempts,contributed.session.attempts,'Changing presentation preserves accepted answers');
  await page.screenshot({path:out+'/per-lesson-options.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"][aria-label="Lesson options"]',{hidden:true});
  fs.writeFileSync(out+'/journey-evidence.json',JSON.stringify({sessionId,wrong,afterBlank,beforeReview,final,contributed,presentation,settingsUI:{activation:true,defaultOutput:true,perLessonOutput:true,answersPreserved:true},phase,stage,learningCalls,calls:calls.length,recovery:{streamAborted:heldAborted,visibleFailure:true,failedRequests,retry:true,acceptedPracticePreserved:true},errors,profile,url:page.url(),boundary:'Real original Next/React/server/SDK/tools/acceptance/persistence and plugin frontend; only normal custom model endpoint scripted. No real ChatGPT/model-quality claim.'},null,2));
  console.log(JSON.stringify({phase,stage,calls:calls.length,attempts:final.session.attempts.length,reviews:final.session.reviews.length,errors,url:page.url()}));
} catch(error) {
  if(page){await page.screenshot({path:out+'/failure.png',fullPage:true});fs.writeFileSync(out+'/failure.json',JSON.stringify({phase,stage,errors,error:String(error),text:await page.evaluate(()=>document.body.innerText)},null,2));}
  throw error;
} finally {
  if(browser)await browser.close();app.kill('SIGTERM');await new Promise(resolve=>app.exitCode!==null?resolve():app.once('exit',resolve));fs.closeSync(log);await new Promise(resolve=>model.close(resolve));
}
