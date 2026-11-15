import { registry } from './plugin-registry.js';
import { mountLessonOutput } from './lesson-outputs.js';
import { lessonMarkdown } from './exports.js';
import { PendingReceipts } from './receipts.js';

const root = document.querySelector('#app');
const notice = document.querySelector('#notice');
const names = Object.fromEntries(registry.list('exercise').map(entry => [entry.manifest.id, entry.manifest.label]));
let state, connection = { connected: false }, route = { view: 'home' }, feedback = null, selected = '', answer = '', review = null, busy = false, noticeTimer, modelOptions = [], signInUrl = null, signInCode = null, lessonSurface = null;
const polling = new Set();
const receipts = new PendingReceipts(sessionStorage), practiceDrafts = new Map();
const draft = { goal: '', level: 'beginner', types: Object.keys(names), presentation: { format: 'text', template: 'guided', workflow: 'lesson-quiz' }, source: null };
let lastRenderedRoute = null, reviewRequest = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = value;
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function message(text) { notice.textContent = text; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.textContent = ''; }, 7000); }
function download(value, filename, mime = 'application/json') {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, value.format === 'learnharness-workspace' ? 0 : 2)], { type: mime });
  const url = URL.createObjectURL(blob), link = el('a', { href: url, download: filename }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function readFile(file, max) {
  if (!file || file.size > max) throw new Error(`Choose a file smaller than ${Math.round(max / 1024)} KB.`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error('This file is not UTF-8 text.'); }
}
async function api(path, input) {
  const response = await fetch(`/api/course-studio/${path}`, { method: input === undefined ? 'GET' : 'POST', headers: input === undefined ? {} : { 'Content-Type': 'application/json', 'X-Course-Token': state?.token ?? '' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), cache: 'no-store' });
  const data = await response.json(); if (!response.ok) { const error = new Error(data.error || 'The request failed.'); error.status = response.status; throw error; } return data;
}
async function refresh() { state = await api('state'); }
async function submitOnce(scope, path, input) { const receipt = receipts.prepare(scope, path, input); try { const result = await api(path, receipt.input); receipts.accept(scope); return result; } catch (error) { if (error.status >= 400 && error.status < 500) receipts.accept(scope); throw error; } }
async function retryReceipt(entry) {
  const result = await api(entry.path, entry.input); receipts.accept(entry.scope); await refresh();
  if (entry.path === 'attempts') { go('course', entry.input.courseId, entry.input.lessonId); feedback = result; }
  else { void watchJob(result.id); message('Generation request confirmed.'); }
}
async function action(work) { if (busy) return; busy = true; render(); try { await work(); } catch (error) { message(error.message); } finally { busy = false; render(); } }
function button(text, work, className = '', attrs = {}) { return el('button', { type: 'button', class: className, disabled: busy, onClick: () => { void action(work); }, ...attrs }, text); }
function go(view, courseId, lessonId) {
  route = { view, courseId, lessonId }; feedback = null; selected = ''; answer = ''; review = null;
  location.hash = [view, courseId, lessonId].filter(Boolean).join('/');
  render();
}
function routeFromHash() {
  const [view = 'home', courseId, lessonId] = location.hash.slice(1).split('/');
  route = { view: ['home', 'course', 'review', 'review-all', 'settings'].includes(view) ? view : 'home', courseId, lessonId };
}
function course() { return state.courses.find(c => c.id === route.courseId); }
function progress(c) { return state.progress[c.id]; }
function lesson(c) { return c.lessons.find(l => l.id === route.lessonId) ?? c.lessons.find(l => l.id === progress(c).lastLessonId) ?? c.lessons[0]; }
function typesControl(types, chosen, callback) {
  return el('div', { class: 'types' }, types.map(type => el('label', {}, el('input', { type: 'checkbox', value: type, checked: chosen.includes(type), onChange: callback }), names[type])));
}
function pluginSelect(slot, field, value, callback, scope) {
  const id = `plugin-${scope}-${field}`;
  const select = el('select', { id, 'aria-label': field, onChange: callback }, registry.list(slot).map(entry => el('option', { value: entry.manifest.id, selected: entry.manifest.id === value }, entry.manifest.label)));
  return el('div', { class: 'field' }, el('label', { for: id }, field[0].toUpperCase() + field.slice(1)), select);
}
function presentationControls(settings, onChange, scope = 'create') {
  return el('div', { class: 'presentation-controls' }, [['output', 'format', 'text'], ['template', 'template', 'guided'], ['workflow', 'workflow', 'lesson-quiz'], ['review', 'review', 'session'], ['visual', 'visual', 'svg']].map(([slot, field, fallback]) => pluginSelect(slot, field, settings[field] ?? fallback, event => { onChange(field, event.target.value); }, scope)));
}
function lessonOutput(c, l, settings) {
  const key = [c.id, c.version, l.id, settings.format, settings.template, settings.visual].join(':');
  if (lessonSurface?.key !== key) { lessonSurface?.dispose(); lessonSurface = { key, ...mountLessonOutput(l, settings) }; }
  return lessonSurface.element;
}
function shell(body) {
  const c = course();
  const unconfirmed = receipts.list().map(entry => el('div', { class: 'job', role: 'status' }, el('p', {}, 'A request has not been confirmed. Retrying uses the same receipt to avoid duplicate work.'), button('Retry unconfirmed request', () => retryReceipt(entry), 'quiet')));
  body = el('div', {}, unconfirmed, body);
  return el('div', { class: 'shell' },
    el('aside', { class: 'sidebar' },
      el('button', { class: 'brand', onClick: () => go('home') }, el('span', { class: 'mark', 'aria-hidden': 'true' }, 'h'), el('span', {}, el('strong', {}, 'learnharness'), el('small', {}, 'COURSE STUDIO'))),
      el('nav', { 'aria-label': 'Main navigation' }, el('p', { class: 'sidebar-label' }, 'Your workspace'),
        button('◫  My learning', () => go('home'), route.view === 'home' || route.view === 'course' ? 'active' : ''),
        ...(state.courses.length ? [button(`↺  Review${state.courses.reduce((sum, course) => sum + progress(course).reviews.length, 0) ? ` · ${state.courses.reduce((sum, course) => sum + progress(course).reviews.length, 0)}` : ''}`, () => openReview(), route.view === 'review' || route.view === 'review-all' ? 'active' : '')] : []),
        button('⚙  Connection', () => go('settings'), route.view === 'settings' ? 'active' : '')),
      el('div', { class: 'sidebar-footer' }, el('p', {}, 'Small lessons. Thoughtful practice. Understanding that carries forward.'), el('span', {}, `Version ${state.version} · saved locally`), el('a', { href: 'https://github.com/rayoreher/learnharness', target: '_blank', rel: 'noopener noreferrer' }, 'Project on GitHub ↗'))),
    el('main', { id: 'main', tabIndex: '-1' }, el('div', { class: 'topline' }, el('span', { class: 'eyebrow' }, route.view === 'home' ? 'A little further, every day' : 'Your learning workspace'), button(connection.connected ? '● ChatGPT connected' : '○ Connect Codex', () => go('settings'), `pill ${connection.connected ? 'connected' : ''}`)), body));
}
function render() {
  if (!state) return;
  const routeKey = JSON.stringify(route), sameRoute = routeKey === lastRenderedRoute;
  const focused = document.activeElement;
  const focus = sameRoute && root.contains(focused) ? { id: focused.id, aria: focused.getAttribute('aria-label'), itemId: focused.closest('.ordering li')?.id, tag: focused.tagName, text: focused.tagName === 'BUTTON' ? focused.textContent : '', start: focused.selectionStart, end: focused.selectionEnd } : null;
  const expanded = sameRoute ? [...root.querySelectorAll('details')].map(d => d.open) : [];
  if (route.view !== 'course' && lessonSurface) { lessonSurface.dispose(); lessonSurface = null; }
  let body;
  if (route.view === 'settings') body = settingsView();
  else if (route.view === 'course' && course()) body = courseView(course());
  else if (route.view === 'review' && course()) body = reviewView(course());
  else if (route.view === 'review-all') body = globalReviewView();
  else body = homeView();
  root.replaceChildren(shell(body));
  root.querySelectorAll('details').forEach((d, index) => { if (expanded[index]) d.open = true; });
  let nextFocus = focus?.id ? document.getElementById(focus.id) : focus?.aria ? [...root.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === focus.aria) : focus?.text ? [...root.querySelectorAll('button')].find(b => b.textContent === focus.text) : null;
  if (nextFocus?.disabled && focus.itemId) nextFocus = document.getElementById(focus.itemId);
  if (nextFocus && !nextFocus.disabled) { nextFocus.focus({ preventScroll: true }); if (typeof nextFocus.setSelectionRange === 'function' && focus.start !== null) nextFocus.setSelectionRange(focus.start, focus.end); }
  else if (!sameRoute) document.getElementById('main')?.focus({ preventScroll: true });
  lastRenderedRoute = routeKey;
}
function homeView() {
  const goalInput = el('textarea', { id: 'goal', placeholder: 'I want to understand how neural networks learn…', required: '', maxLength: '2000', 'aria-label': 'What would you like to learn?', onInput: event => { draft.goal = event.target.value; } }, draft.goal);
  const levelInput = el('select', { id: 'level', onChange: event => { draft.level = event.target.value; } }, ['beginner', 'intermediate', 'advanced'].map(v => el('option', { value: v, selected: v === draft.level }, v[0].toUpperCase() + v.slice(1))));
  const typeInputs = typesControl(Object.keys(names), draft.types, event => { draft.types = [...event.target.closest('.types').querySelectorAll('input:checked')].map(x => x.value); });
  const presentation = draft.presentation;
  const sourceArea = el('textarea', { id: 'source-notes', placeholder: 'Paste a short excerpt, or choose a text/Markdown file…', maxLength: '24000', onInput: event => { draft.source = event.target.value.trim() ? { kind: 'text', name: draft.source?.name || 'Pasted notes', content: event.target.value } : null; } }, draft.source?.content ?? '');
  const sourceFile = el('input', { type: 'file', accept: '.txt,.md,.markdown', 'aria-label': 'Choose source notes', onChange: event => { const file = event.target.files[0]; void action(async () => { const content = await readFile(file, 24000); draft.source = { kind: /\.md|\.markdown$/i.test(file.name) ? 'markdown' : 'text', name: file.name, content }; message('Source notes added. They will be used when you create the course.'); }); } });
  const form = el('form', { class: 'goalbox', onSubmit: event => {
    event.preventDefault(); const goal = goalInput.value, level = levelInput.value;
    const types = [...typeInputs.querySelectorAll('input:checked')].map(x => x.value);
    void action(async () => {
      if (!goal.trim()) throw new Error('Describe what you want to learn.');
      if (!types.length) throw new Error('Choose at least one exercise format.');
      if (!connection.connected) { go('settings'); throw new Error('Connect Codex with ChatGPT to generate your course.'); }
      const job = await submitOnce('generate', 'generate', { goal, level, types, presentation, ...(draft.source ? { source: draft.source } : {}) }); draft.goal = ''; await refresh(); watchJob(job.id); message('Your course is being prepared. You can keep exploring.');
    });
  } }, el('label', { for: 'goal' }, 'What would you like to understand?'), goalInput,
  el('div', { class: 'goal-options' }, el('div', { class: 'field' }, el('label', { for: 'level' }, 'Starting level'), levelInput), el('span', { class: 'small' }, 'A focused course, one small lesson at a time.'), el('button', { type: 'submit', class: 'primary', disabled: busy }, 'Create my course →')),
  el('details', {}, el('summary', { class: 'small' }, 'Choose practice and lesson formats'), typeInputs, presentationControls(presentation, (field, value) => { presentation[field] = value; })),
  el('details', {}, el('summary', { class: 'small' }, draft.source ? `Source: ${draft.source.name}` : 'Add source notes'), el('label', { for: 'source-notes' }, 'Study material'), sourceArea, sourceFile, el('p', { class: 'small' }, 'Use a short excerpt, up to 24 KB. These notes are included in the course-generation request.'), draft.source && button('Remove source', () => { draft.source = null; }, 'quiet')));
  return el('div', {}, el('section', { class: 'hero' }, el('p', { class: 'eyebrow' }, 'Learn with intention'), el('h1', {}, 'Make it make sense.'), el('p', {}, 'Start with a question. Build understanding through small lessons, varied practice, and another chance at the ideas that need it.')), form,
    state.jobs.filter(j => ['running', 'queued', 'interrupted', 'failed'].includes(j.status)).map(j => el('div', { class: 'job', role: 'status' }, el('strong', {}, j.goal), el('p', { class: 'small' }, ['running', 'queued'].includes(j.status) ? 'Preparing your lessons and exercises…' : j.error), ['failed', 'interrupted'].includes(j.status) && j.input && button('Retry generation', async () => { const retry = await api(`jobs/${j.id}/retry`, {}); await refresh(); void watchJob(retry.id); }))),
    el('div', { class: 'sectionhead' }, el('h2', {}, 'Your learning paths'), button('Explore a sample ↗', async () => { const c = await api('sample', {}); await refresh(); openCourse(c); }, 'quiet')),
    state.courses.length ? el('div', { class: 'cards' }, state.courses.map(c => {
      const p = progress(c), done = p.completedLessons.length;
      return el('button', { class: 'course-card', onClick: () => { void action(() => openCourse(c)); } }, el('span', { class: 'eyebrow' }, `${c.level} · ${c.lessons.length} lessons`), el('h3', {}, c.title), el('p', {}, c.summary), el('div', { class: 'foot' }, el('progress', { max: c.lessons.length, value: done, 'aria-label': `${done} of ${c.lessons.length} lessons completed` }), el('div', { class: 'row spread' }, el('span', {}, `${done}/${c.lessons.length} completed`), el('span', {}, p.reviews.length ? `${p.reviews.length} to revisit ↺` : 'Continue →'))));
    })) : el('div', { class: 'empty' }, el('h3', {}, 'Your next idea starts here.'), el('p', {}, 'Create a course with Codex, or explore the sample to try lessons, mixed practice, and the review loop. No account is needed for the sample.')));
}
async function openCourse(c, id) {
  const l = c.lessons.find(l => l.id === id) ?? c.lessons.find(l => l.id === progress(c).lastLessonId) ?? c.lessons[0];
  await api(`courses/${c.id}/lessons/${l.id}/visit`, {}); await refresh(); go('course', c.id, l.id);
}
function courseView(c) {
  const l = lesson(c), p = progress(c);
  const selectedTypes = p.lessonSettings[l.id]?.exerciseTypes ?? c.settings.exerciseTypes;
  const presentation = { format: 'text', template: 'guided', workflow: 'lesson-quiz', ...c.settings, ...p.lessonSettings[l.id] };
  const exercises = l.exercises.filter(e => selectedTypes.includes(e.type));
  const pendingRating = [...p.attempts].reverse().find(a => a.lessonId === l.id && a.result === 'pending' && exercises.some(e => e.id === a.exerciseId));
  if (!feedback && pendingRating) feedback = pendingRating;
  const unanswered = exercises.filter(e => !p.attempts.some(a => a.exerciseId === e.id));
  const current = feedback ? exercises.find(e => e.id === feedback.exerciseId) : unanswered[0];
  const settings = el('details', {}, el('summary', { class: 'small' }, 'Formats for this lesson'), presentationControls(presentation, (field, value) => { void action(async () => { await api(`courses/${c.id}/lessons/${l.id}/settings`, { [field]: value }); await refresh(); }); }, 'lesson'),
    p.lessonSettings[l.id] && button('Use course defaults', async () => { await api(`courses/${c.id}/lessons/${l.id}/settings`, { inherit: true }); await refresh(); }, 'quiet'),
    typesControl([...new Set(l.exercises.map(e => e.type))], selectedTypes, async event => {
    const container = event.target.closest('.types'); const values = [...container.querySelectorAll('input:checked')].map(x => x.value);
    await action(async () => { await api(`courses/${c.id}/lessons/${l.id}/settings`, { exerciseTypes: values }); feedback = null; await refresh(); });
  }));
  const practiceKey = `${c.id}:${l.id}`, additionalTypes = practiceDrafts.get(practiceKey) ?? Object.keys(names).filter(type => !l.exercises.some(e => e.type === type));
  settings.append(el('details', {}, el('summary', {}, 'Add new practice'), el('p', { class: 'small' }, 'Create more questions from this saved lesson. Existing answers stay saved. New practice reopens lesson coverage.'), typesControl(Object.keys(names), additionalTypes, event => { practiceDrafts.set(practiceKey, [...event.target.closest('.types').querySelectorAll('input:checked')].map(e => e.value)); }), button('Generate more exercises', async () => {
    const types = practiceDrafts.get(practiceKey) ?? additionalTypes;
    if (!types.length) throw new Error('Choose at least one practice format.');
    if (!connection.connected) throw new Error('Connect ChatGPT in Connection to generate additional exercises.');
    const job = await submitOnce(`practice:${practiceKey}`, `courses/${c.id}/lessons/${l.id}/exercises`, { types }); await refresh(); void watchJob(job.id); message('Additional practice is being prepared.');
  }, 'primary')));
  return el('div', {}, el('div', { class: 'row spread' }, button('← All learning paths', () => go('home'), 'quiet'), button(`Review ${p.reviews.length} concept${p.reviews.length === 1 ? '' : 's'} ↺`, () => openReview(c.id), 'quiet')),
    el('header', { class: 'lesson-heading' }, el('p', { class: 'eyebrow' }, c.title), el('h1', {}, l.title), el('p', {}, l.summary), c.source && el('p', { class: 'small' }, `Based on ${c.source.name}`)),
    el('div', { class: 'row' }, button('Export lesson notes', () => download(lessonMarkdown(l), `lesson-${l.id}.md`, 'text/markdown'), 'quiet'), button('Export course', async () => download(await api('export', { courseId: c.id }), `course-${c.id}.json`), 'quiet')),
    el('details', {}, el('summary', { class: 'small' }, 'Default formats for this course'), presentationControls(c.settings, (field, value) => { void action(async () => { await api(`courses/${c.id}/settings`, { [field]: value }); await refresh(); }); }, 'course')),
    el('nav', { class: 'lesson-nav', 'aria-label': 'Course lessons' }, c.lessons.map((item, i) => button(`${p.completedLessons.includes(item.id) ? '✓' : i + 1}  ${item.title}`, () => openCourse(c, item.id), item.id === l.id ? 'active' : ''))),
    el('div', { class: 'lesson-layout' }, el('article', { class: 'reading' }, el('span', { class: 'eyebrow' }, 'The lesson'), el('div', { class: 'objectives' }, l.objectives.map(o => el('p', {}, o.title))),
      registry.get('workflow', presentation.workflow)?.implementation.practiceFirst && !p.attempts.some(a => a.lessonId === l.id) ? el('div', {}, el('h2', {}, 'Try what you know.'), el('p', {}, 'Start with an exercise. The lesson opens after your first attempt, so you can explore the idea with feedback in mind.')) : lessonOutput(c, l, presentation)),
      el('section', { class: 'practice', 'aria-label': 'Lesson practice' }, el('div', { class: 'row spread' }, el('span', { class: 'eyebrow' }, 'Put it into practice'), el('span', { class: 'small' }, `${exercises.length - unanswered.length}/${exercises.length}`)), settings,
        current ? questionView(c, l, current) : el('div', {}, el('h2', {}, 'A little further.'), el('p', {}, 'You have tried this lesson’s exercises. Any concepts that need another attempt stay in your review queue.'), button(p.completedLessons.includes(l.id) ? 'Continue to the next lesson →' : 'Complete lesson & continue →', async () => {
          await api(`courses/${c.id}/lessons/${l.id}/complete`, {}); await refresh(); const next = c.lessons[c.lessons.findIndex(x => x.id === l.id) + 1];
          if (next) await openCourse(c, next.id); else { message('Course covered. Your review queue is ready when you are.'); await openReview(c.id); }
        }, 'primary'), el('p', { class: 'small' }, 'Completion records coverage. Review records what needs another try.')))));
}
function renderBlock(b) {
  if (b.type === 'heading') return el('h3', {}, b.text);
  if (b.type === 'bullets') return el('ul', {}, b.items.map(i => el('li', {}, i)));
  if (b.type === 'code') return el('pre', {}, el('code', {}, b.text));
  return el('p', {}, b.text);
}
function questionView(c, l, q) {
  const saved = feedback?.exerciseId === q.id ? feedback : null;
  const mechanic = registry.get('exercise', q.type)?.implementation;
  if (!mechanic) return el('p', { class: 'error' }, 'The saved exercise plugin is unavailable. Its history has been preserved.');
  const mode = mechanic.input;
  const readable = value => { if (mode !== 'ordered') return value; try { return JSON.parse(value).join(' → '); } catch { return value; } };
  async function submit(actionName) {
    if (mode === 'ordered' && !answer) answer = JSON.stringify(q.options);
    const result = await submitOnce(`attempt:${c.id}:${q.id}`, 'attempts', { courseId: c.id, lessonId: l.id, exerciseId: q.id, action: actionName, answer: mode === 'choice' ? selected : answer, assisted: false, context: ['review', 'review-all'].includes(route.view) ? 'review' : 'lesson' });
    feedback = result; await refresh();
  }
  const content = el('div', {}, el('h2', {}, names[q.type]), el('p', { class: 'question' }, q.question));
  if (!saved) {
    if (mode === 'choice') content.append(el('div', { class: 'options', role: 'group', 'aria-label': 'Answer choices' }, q.options.map((option, i) => el('button', { type: 'button', class: `option ${selected === option ? 'selected' : ''}`, disabled: busy, 'aria-pressed': String(selected === option), onClick: () => { selected = option; render(); } }, el('span', { 'aria-hidden': 'true' }, String.fromCharCode(65 + i)), el('span', {}, option)))));
    else if (mode === 'ordered') {
      let values; try { values = answer ? JSON.parse(answer) : [...q.options]; } catch { values = [...q.options]; }
      content.append(el('p', { class: 'small' }, 'Move the items into the correct order.'), el('ol', { class: 'ordering' }, values.map((value, index) => {
        const move = delta => { const next = [...values]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; answer = JSON.stringify(next); render(); };
        return el('li', { id: `order-${q.id}-${q.options.indexOf(value)}`, tabIndex: '-1' }, el('span', {}, value), el('div', { class: 'row' }, el('button', { type: 'button', 'aria-label': `Move ${value} up`, disabled: busy || index === 0, onClick: () => move(-1) }, '↑'), el('button', { type: 'button', 'aria-label': `Move ${value} down`, disabled: busy || index === values.length - 1, onClick: () => move(1) }, '↓')));
      })));
    }
    else if (mode !== 'recall') content.append(el('label', { for: 'answer' }, 'Your answer'), el('textarea', { id: 'answer', maxLength: '10000', placeholder: mechanic.grader === 'codex-rubric' ? 'Explain it in your own words…' : 'Enter your answer…', onInput: event => { answer = event.target.value; } }, answer));
    else content.append(el('p', { class: 'small' }, 'Try to recall the answer before revealing it.'));
    content.append(el('div', { class: 'row' }, button(mode === 'recall' ? 'Reveal answer' : 'Check my answer', () => submit(mode === 'recall' ? 'reveal' : 'answer'), 'primary'), ...(mode === 'recall' ? [] : [button('I don’t know yet', () => submit('unknown'), 'quiet')])));
    if (mechanic.grader === 'codex-rubric' && !connection.connected) content.append(el('p', { class: 'small' }, 'Compare with the reference and self-assess, or connect Codex for rubric-based feedback.'));
  } else {
    const labels = { correct: saved.grader === 'self-assessment' ? 'Recalled · self-assessed' : 'You’ve got it.', incorrect: 'A useful place to return to.', partial: 'You’re part of the way there.', pending: 'Compare your answer' };
    content.append(el('div', { class: `feedback ${saved.result}`, role: 'status' }, el('p', { class: 'verdict' }, labels[saved.result]), saved.answer && el('p', { class: 'small' }, `Your answer: ${readable(saved.answer)}`), el('div', { class: 'solution' }, el('strong', {}, 'Reference answer'), el('p', {}, readable(saved.solution))), el('p', { class: 'small' }, saved.feedback), saved.feedback !== saved.explanation && el('p', { class: 'small' }, saved.explanation)));
    if (saved.result === 'pending') content.append(el('p', { class: 'small' }, 'Did you recall this before seeing the answer?'), el('div', { class: 'row' }, ...[['again', 'Needs practice'], ['good', 'I recalled it']].map(([rating, label]) => button(label, async () => { feedback = await api(`courses/${c.id}/attempts/${saved.id}/rate`, { rating }); await refresh(); }, rating === 'good' ? 'primary' : ''))));
    else content.append(button('Continue →', async () => {
      feedback = null; selected = ''; answer = '';
      if (route.view === 'review' || route.view === 'review-all') await fetchReview(route.view === 'review-all' ? null : c.id);
    }, 'primary'), el('p', { class: 'small' }, saved.result === 'correct' ? 'Progress saved locally.' : 'This concept stays in your review queue. Keep going.'));
  }
  return content;
}
async function fetchReview(id) { const current = ++reviewRequest, context = JSON.stringify(route); const next = await api(id ? `courses/${id}/review` : 'review'); if (current === reviewRequest && context === JSON.stringify(route)) { review = next; render(); } }
async function openReview(id) { go(id ? 'review' : 'review-all', id); await fetchReview(id); }
function globalReviewView() {
  if (!review && !busy) void fetchReview().catch(e => message(e.message));
  const c = review?.courseId ? state.courses.find(c => c.id === review.courseId) : null, q = review?.question;
  return el('div', {}, el('section', { class: 'hero' }, el('p', { class: 'eyebrow' }, 'Across all your learning paths'), el('h1', {}, 'Keep the connections alive.'), el('p', {}, 'Return to missed concepts and due spaced reviews across your courses.')),
    el('p', { class: 'small' }, `${review?.remaining ?? 0} outstanding · ${review?.scheduled ?? 0} concepts on a spaced schedule`),
    c && q ? el('section', { class: 'panel' }, el('p', { class: 'eyebrow' }, `${c.title} · ${q.lessonTitle}`), questionView(c, { id: q.lessonId }, q)) : el('section', { class: 'panel' }, el('h2', {}, review?.waiting ? 'Let the idea settle.' : 'Your queue is clear for now.'), el('p', {}, review?.waiting ? 'Continue a lesson or return shortly for another retrieval attempt.' : 'Future spaced reviews will appear when they are due.'), button('Check again', () => fetchReview()), button('Continue learning', () => go('home'), 'primary')));
}
function reviewView(c) {
  const p = progress(c), q = review?.question;
  if (!review && !busy) { void fetchReview(c.id).catch(e => message(e.message)); }
  return el('div', {}, button('← Back to your lessons', () => openCourse(c), 'quiet'), el('section', { class: 'hero' }, el('p', { class: 'eyebrow' }, 'Another chance to make it click'), el('h1', {}, 'Return. Recall. Connect.'), el('p', {}, 'Keep practicing the ideas that need attention. Your queue follows concepts, so an idea can return in another question format.')),
    el('div', { class: 'stats' }, el('div', {}, el('strong', {}, p.reviews.length), el('span', {}, 'concepts to revisit')), el('div', {}, el('strong', {}, p.attempts.filter(a => a.result === 'correct').length), el('span', {}, 'successful attempts')), el('div', {}, el('strong', {}, `${p.completedLessons.length}/${c.lessons.length}`), el('span', {}, 'lessons covered'))),
    q ? el('div', { class: 'panel' }, el('p', { class: 'eyebrow' }, q.lessonTitle), questionView(c, { id: q.lessonId }, q)) : el('div', { class: 'panel' }, el('h2', {}, review?.waiting ? 'Let the idea settle.' : 'Your queue is clear.'), el('p', {}, review?.waiting ? 'Try two other exercises, finish the lesson, or return in about 30 seconds. This gives you a chance to retrieve the idea after feedback.' : 'You have no outstanding concepts in this course. Later practice can still help you check retention.'), review?.waiting && button('Check review queue', () => fetchReview(c.id), 'primary'), button('Continue learning →', () => openCourse(c), 'quiet')));
}
function settingsView() {
  const model = el('select', { id: 'model' }, ...(modelOptions.length ? modelOptions.map(m => el('option', { value: m.id, selected: m.id === state.settings.model }, m.name)) : [el('option', { value: '' }, state.settings.model || 'Codex default model')]));
  const loadModels = async () => { const data = await api('models'); modelOptions = data.models; };
  const importFile = el('input', { type: 'file', accept: '.json', id: 'learning-import', onChange: event => {
    const file = event.target.files[0]; void action(async () => {
      const raw = await readFile(file, 70 * 1024 * 1024); let data; try { data = JSON.parse(raw); } catch { throw new Error('Choose a valid JSON course, MindSpark record, or workspace backup.'); }
      const kind = data.format === 'learnharness-workspace' ? 'workspace' : data.format === 'learnharness-course' || data.lessons ? 'course' : 'mindspark';
      const result = await api('import', { kind, data }); await refresh(); message(`Imported ${result.imported} learning path${result.imported === 1 ? '' : 's'}. Existing learning was preserved.`);
    });
  } });
  return el('div', {}, el('section', { class: 'hero' }, el('p', { class: 'eyebrow' }, 'Your local connection'), el('h1', {}, 'A teacher on your terms.'), el('p', {}, 'Course Studio runs locally and connects to the installed Codex CLI. ChatGPT powers generation and open-answer feedback.')),
    el('section', { class: 'panel' }, el('h2', {}, 'Codex & ChatGPT'), el('p', {}, connection.connected ? 'Your ChatGPT account is connected through Codex.' : 'Sign in to ChatGPT through Codex to create a course.'), connection.error && el('p', { class: 'error' }, connection.error),
      el('div', { class: 'row' }, button(connection.pending ? 'Sign-in in progress…' : 'Sign in with ChatGPT ↗', async () => {
        const data = await api('login', { method: 'device' }); signInUrl = data.authUrl; signInCode = data.userCode; connection.pending = true; void watchConnection();
      }, 'primary'), button('Refresh connection', async () => { connection = await api('connection'); }, 'quiet')),
      el('div', { id: 'signin-link' }, signInUrl && !connection.connected && el('div', {}, signInCode && el('p', {}, 'Enter this code: ', el('strong', { class: 'device-code' }, signInCode)), el('a', { href: signInUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open ChatGPT sign-in ↗'))), el('p', { class: 'small' }, 'Credentials stay with Codex on the server. You can complete device sign-in from another machine. No API-key billing fallback is used.')),
    el('section', { class: 'panel' }, el('h2', {}, 'Generation model'), el('label', { for: 'model' }, 'Available through your Codex account'), model,
      el('div', { class: 'row' }, button('Load available models', loadModels), button('Save model', async () => { if (!model.value) throw new Error('Load and choose a model first.'); await api('settings', { model: model.value }); await refresh(); message('Model preference saved.'); }, 'primary'))),
    el('section', { class: 'panel' }, el('h2', {}, 'Your learning records'), el('p', {}, 'Lessons, attempts, completion, and the review queue are saved on this machine. Refreshing the browser or restarting the app preserves them.'), button('Export workspace backup', async () => download(await api('export', {}), 'learnharness-workspace.json'), 'primary'), el('label', { for: 'learning-import' }, 'Import a course, MindSpark record, or workspace backup'), importFile, el('p', { class: 'small' }, 'Imports add independent learning paths and preserve your existing records. Backups include learning history and exclude Codex credentials. Model requests send the relevant learning content to the connected service.')),
    el('section', { class: 'panel' }, el('h2', {}, 'Available plugins'), el('p', { class: 'small' }, 'Choose lesson and review contributions in course defaults or lesson settings. Plugin code is reviewed local application code.'), [...new Set(registry.list().map(e => e.manifest.slot))].map(slot => el('details', {}, el('summary', {}, `${slot[0].toUpperCase() + slot.slice(1)} · ${registry.list(slot).length}`), el('ul', {}, registry.list(slot).map(entry => el('li', {}, `${entry.manifest.label} · ${entry.manifest.version}${entry.manifest.requires.length ? ` · needs ${entry.manifest.requires.join(', ')}` : ''}`)))))));
}
async function watchJob(id) {
  if (polling.has(id)) return; polling.add(id);
  try {
    for (;;) {
      const job = await api(`jobs/${id}`);
      if (!['running', 'queued'].includes(job.status)) { await refresh(); render(); message(job.status === 'succeeded' ? 'Your course is ready in My learning.' : job.error || 'Generation stopped.'); break; }
      await new Promise(resolve => setTimeout(resolve, 1800));
    }
  } catch (error) { message(error.message); } finally { polling.delete(id); }
}
async function watchConnection() {
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try { connection = await api('connection'); if (route.view === 'settings') render(); if (connection.connected || !connection.pending) break; }
    catch (error) { message(error.message); break; }
  }
}
window.addEventListener('hashchange', () => { const previous = JSON.stringify(route); routeFromHash(); if (previous !== JSON.stringify(route)) { feedback = null; selected = ''; answer = ''; review = null; } render(); });
try {
  await refresh(); routeFromHash();
  for (const entry of receipts.list()) {
    if (entry.path === 'attempts') {
      const saved = state.progress[entry.input.courseId]?.attempts.find(a => a.requestId === entry.input.requestId);
      if (saved) { receipts.accept(entry.scope); route = { view: 'course', courseId: entry.input.courseId, lessonId: entry.input.lessonId }; history.replaceState(null, '', `#course/${route.courseId}/${route.lessonId}`); feedback = saved; }
    } else if (state.jobs.some(j => j.requestId === entry.input.requestId)) receipts.accept(entry.scope);
  }
  render();
  state.jobs.filter(j => ['queued', 'running'].includes(j.status)).forEach(j => { void watchJob(j.id); });
  connection = await api('connection'); render();
} catch (error) { root.replaceChildren(el('main', { id: 'main', class: 'boot' }, el('h1', {}, 'Your workspace couldn’t open.'), el('p', {}, error.message), el('button', { onClick: () => location.reload() }, 'Try again'))); }
