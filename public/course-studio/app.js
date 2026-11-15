const root = document.querySelector('#app');
const notice = document.querySelector('#notice');
const names = { 'multiple-choice': 'Multiple choice', open: 'Open question', 'fill-blank': 'Fill in the blank', flashcard: 'Flashcards' };
let state, connection = { connected: false }, route = { view: 'home' }, feedback = null, selected = '', answer = '', review = null, busy = false, noticeTimer, modelOptions = [], signInUrl = null;
const polling = new Set();

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
async function api(path, input) {
  const response = await fetch(`/api/course-studio/${path}`, { method: input === undefined ? 'GET' : 'POST', headers: input === undefined ? {} : { 'Content-Type': 'application/json', 'X-Course-Token': state?.token ?? '' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), cache: 'no-store' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The request failed.'); return data;
}
async function refresh() { state = await api('state'); }
async function action(work) { if (busy) return; busy = true; render(); try { await work(); } catch (error) { message(error.message); } finally { busy = false; render(); } }
function button(text, work, className = '', attrs = {}) { return el('button', { type: 'button', class: className, disabled: busy, onClick: () => { void action(work); }, ...attrs }, text); }
function go(view, courseId, lessonId) {
  route = { view, courseId, lessonId }; feedback = null; selected = ''; answer = ''; review = null;
  location.hash = [view, courseId, lessonId].filter(Boolean).join('/');
  render();
}
function routeFromHash() {
  const [view = 'home', courseId, lessonId] = location.hash.slice(1).split('/');
  route = { view: ['home', 'course', 'review', 'settings'].includes(view) ? view : 'home', courseId, lessonId };
}
function course() { return state.courses.find(c => c.id === route.courseId); }
function progress(c) { return state.progress[c.id]; }
function lesson(c) { return c.lessons.find(l => l.id === route.lessonId) ?? c.lessons.find(l => l.id === progress(c).lastLessonId) ?? c.lessons[0]; }
function typesControl(types, chosen, callback) {
  return el('div', { class: 'types' }, types.map(type => el('label', {}, el('input', { type: 'checkbox', value: type, checked: chosen.includes(type), onChange: callback }), names[type])));
}
function shell(body) {
  const c = course();
  return el('div', { class: 'shell' },
    el('aside', { class: 'sidebar' },
      el('button', { class: 'brand', onClick: () => go('home') }, el('span', { class: 'mark', 'aria-hidden': 'true' }, 'h'), el('span', {}, el('strong', {}, 'learnharness'), el('small', {}, 'COURSE STUDIO'))),
      el('nav', { 'aria-label': 'Main navigation' }, el('p', { class: 'sidebar-label' }, 'Your workspace'),
        button('◫  My learning', () => go('home'), route.view === 'home' || route.view === 'course' ? 'active' : ''),
        ...(c ? [button(`↺  Review${progress(c).reviews.length ? ` · ${progress(c).reviews.length}` : ''}`, () => openReview(c.id), route.view === 'review' ? 'active' : '')] : []),
        button('⚙  Connection', () => go('settings'), route.view === 'settings' ? 'active' : '')),
      el('div', { class: 'sidebar-footer' }, el('p', {}, 'Small lessons. Thoughtful practice. Understanding that carries forward.'), el('span', {}, `Version ${state.version} · saved locally`), el('a', { href: 'https://github.com/rayoreher/learnharness', target: '_blank', rel: 'noopener noreferrer' }, 'Project on GitHub ↗'))),
    el('main', { id: 'main', tabIndex: '-1' }, el('div', { class: 'topline' }, el('span', { class: 'eyebrow' }, route.view === 'home' ? 'A little further, every day' : 'Your learning workspace'), button(connection.connected ? '● ChatGPT connected' : '○ Connect Codex', () => go('settings'), `pill ${connection.connected ? 'connected' : ''}`)), body));
}
function render() {
  if (!state) return;
  let body;
  if (route.view === 'settings') body = settingsView();
  else if (route.view === 'course' && course()) body = courseView(course());
  else if (route.view === 'review' && course()) body = reviewView(course());
  else body = homeView();
  root.replaceChildren(shell(body));
}
function homeView() {
  const goalInput = el('textarea', { id: 'goal', placeholder: 'I want to understand how neural networks learn…', required: '', maxLength: '2000', 'aria-label': 'What would you like to learn?' });
  const levelInput = el('select', { id: 'level' }, ['beginner', 'intermediate', 'advanced'].map(v => el('option', { value: v }, v[0].toUpperCase() + v.slice(1))));
  const typeInputs = typesControl(Object.keys(names), Object.keys(names));
  const form = el('form', { class: 'goalbox', onSubmit: event => {
    event.preventDefault(); const goal = goalInput.value, level = levelInput.value;
    const types = [...typeInputs.querySelectorAll('input:checked')].map(x => x.value);
    void action(async () => {
      if (!goal.trim()) throw new Error('Describe what you want to learn.');
      if (!types.length) throw new Error('Choose at least one exercise format.');
      if (!connection.connected) { go('settings'); throw new Error('Connect Codex with ChatGPT to generate your course.'); }
      const job = await api('generate', { goal, level, types }); await refresh(); watchJob(job.id); message('Your course is being prepared. You can keep exploring.');
    });
  } }, el('label', { for: 'goal' }, 'What would you like to understand?'), goalInput,
  el('div', { class: 'goal-options' }, el('div', { class: 'field' }, el('label', { for: 'level' }, 'Starting level'), levelInput), el('span', { class: 'small' }, 'A focused course, one small lesson at a time.'), el('button', { type: 'submit', class: 'primary', disabled: busy }, 'Create my course →')),
  el('details', {}, el('summary', { class: 'small' }, 'Choose practice formats'), typeInputs));
  return el('div', {}, el('section', { class: 'hero' }, el('p', { class: 'eyebrow' }, 'Learn with intention'), el('h1', {}, 'Make it make sense.'), el('p', {}, 'Start with a question. Build understanding through small lessons, varied practice, and another chance at the ideas that need it.')), form,
    state.jobs.filter(j => ['running', 'queued', 'interrupted', 'failed'].includes(j.status)).map(j => el('div', { class: 'job', role: 'status' }, el('strong', {}, j.goal), el('p', { class: 'small' }, ['running', 'queued'].includes(j.status) ? 'Preparing your lessons and exercises…' : j.error))),
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
  const exercises = l.exercises.filter(e => selectedTypes.includes(e.type));
  const unanswered = exercises.filter(e => !p.attempts.some(a => a.exerciseId === e.id));
  const current = feedback ? exercises.find(e => e.id === feedback.exerciseId) : unanswered[0];
  const settings = el('details', {}, el('summary', { class: 'small' }, 'Practice formats for this lesson'), typesControl([...new Set(l.exercises.map(e => e.type))], selectedTypes, async event => {
    const container = event.target.closest('.types'); const values = [...container.querySelectorAll('input:checked')].map(x => x.value);
    await action(async () => { await api(`courses/${c.id}/lessons/${l.id}/settings`, { exerciseTypes: values }); feedback = null; await refresh(); });
  }));
  return el('div', {}, el('div', { class: 'row spread' }, button('← All learning paths', () => go('home'), 'quiet'), button(`Review ${p.reviews.length} concept${p.reviews.length === 1 ? '' : 's'} ↺`, () => openReview(c.id), 'quiet')),
    el('header', { class: 'lesson-heading' }, el('p', { class: 'eyebrow' }, c.title), el('h1', {}, l.title), el('p', {}, l.summary)),
    el('nav', { class: 'lesson-nav', 'aria-label': 'Course lessons' }, c.lessons.map((item, i) => button(`${p.completedLessons.includes(item.id) ? '✓' : i + 1}  ${item.title}`, () => openCourse(c, item.id), item.id === l.id ? 'active' : ''))),
    el('div', { class: 'lesson-layout' }, el('article', { class: 'reading' }, el('span', { class: 'eyebrow' }, 'The lesson'), el('div', { class: 'objectives' }, l.objectives.map(o => el('p', {}, o.title))), l.blocks.map(renderBlock)),
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
  async function submit(actionName) {
    const result = await api('attempts', { courseId: c.id, lessonId: l.id, exerciseId: q.id, requestId: crypto.randomUUID(), action: actionName, answer: q.type === 'multiple-choice' ? selected : answer, assisted: false });
    feedback = result; await refresh();
  }
  const content = el('div', {}, el('h2', {}, names[q.type]), el('p', { class: 'question' }, q.question));
  if (!saved) {
    if (q.type === 'multiple-choice') content.append(el('div', { class: 'options', role: 'group', 'aria-label': 'Answer choices' }, q.options.map((option, i) => el('button', { type: 'button', class: `option ${selected === option ? 'selected' : ''}`, disabled: busy, 'aria-pressed': String(selected === option), onClick: () => { selected = option; render(); } }, el('span', { 'aria-hidden': 'true' }, String.fromCharCode(65 + i)), el('span', {}, option)))));
    else if (q.type !== 'flashcard') content.append(el('label', { for: 'answer' }, 'Your answer'), el('textarea', { id: 'answer', maxLength: '10000', placeholder: q.type === 'open' ? 'Explain it in your own words…' : 'Enter the missing term…', onInput: event => { answer = event.target.value; } }, answer));
    else content.append(el('p', { class: 'small' }, 'Try to recall the answer before revealing it.'));
    content.append(el('div', { class: 'row' }, button(q.type === 'flashcard' ? 'Reveal answer' : 'Check my answer', () => submit(q.type === 'flashcard' ? 'reveal' : 'answer'), 'primary'), ...(q.type === 'flashcard' ? [] : [button('I don’t know yet', () => submit('unknown'), 'quiet')])));
    if (q.type === 'open' && !connection.connected) content.append(el('p', { class: 'small' }, 'Sample mode: compare with the reference and self-assess. Connect Codex for rubric-based feedback.'));
  } else {
    const labels = { correct: saved.grader === 'self-assessment' ? 'Recalled · self-assessed' : 'You’ve got it.', incorrect: 'A useful place to return to.', partial: 'You’re part of the way there.', pending: 'Compare your answer' };
    content.append(el('div', { class: `feedback ${saved.result}`, role: 'status' }, el('p', { class: 'verdict' }, labels[saved.result]), saved.answer && el('p', { class: 'small' }, `Your answer: ${saved.answer}`), el('div', { class: 'solution' }, el('strong', {}, 'Reference answer'), el('p', {}, saved.solution)), el('p', { class: 'small' }, saved.feedback), saved.feedback !== saved.explanation && el('p', { class: 'small' }, saved.explanation)));
    if (saved.result === 'pending') content.append(el('p', { class: 'small' }, 'Did you recall this before seeing the answer?'), el('div', { class: 'row' }, ...[['again', 'Needs practice'], ['good', 'I recalled it']].map(([rating, label]) => button(label, async () => { feedback = await api(`courses/${c.id}/attempts/${saved.id}/rate`, { rating }); await refresh(); }, rating === 'good' ? 'primary' : ''))));
    else content.append(button('Continue →', async () => {
      feedback = null; selected = ''; answer = '';
      if (route.view === 'review') await fetchReview(c.id);
    }, 'primary'), el('p', { class: 'small' }, saved.result === 'correct' ? 'Progress saved locally.' : 'This concept stays in your review queue. Keep going.'));
  }
  return content;
}
async function fetchReview(id) { review = await api(`courses/${id}/review`); render(); }
async function openReview(id) { go('review', id); await fetchReview(id); }
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
  return el('div', {}, el('section', { class: 'hero' }, el('p', { class: 'eyebrow' }, 'Your local connection'), el('h1', {}, 'A teacher on your terms.'), el('p', {}, 'Course Studio runs locally and connects to the installed Codex CLI. ChatGPT powers generation and open-answer feedback.')),
    el('section', { class: 'panel' }, el('h2', {}, 'Codex & ChatGPT'), el('p', {}, connection.connected ? 'Your ChatGPT account is connected through Codex.' : 'Sign in to ChatGPT through Codex to create a course.'), connection.error && el('p', { class: 'error' }, connection.error),
      el('div', { class: 'row' }, button(connection.pending ? 'Sign-in in progress…' : 'Sign in with ChatGPT ↗', async () => {
        const data = await api('login', {}); signInUrl = data.authUrl; connection.pending = true; void watchConnection();
      }, 'primary'), button('Refresh connection', async () => { connection = await api('connection'); }, 'quiet')),
      el('div', { id: 'signin-link' }, signInUrl && !connection.connected && el('a', { href: signInUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open ChatGPT sign-in ↗')), el('p', { class: 'small' }, 'Credentials stay with Codex on the server. Its sign-in page opens on the machine running the app. No API-key billing fallback is used.')),
    el('section', { class: 'panel' }, el('h2', {}, 'Generation model'), el('label', { for: 'model' }, 'Available through your Codex account'), model,
      el('div', { class: 'row' }, button('Load available models', loadModels), button('Save model', async () => { if (!model.value) throw new Error('Load and choose a model first.'); await api('settings', { model: model.value }); await refresh(); message('Model preference saved.'); }, 'primary'))),
    el('section', { class: 'panel' }, el('h2', {}, 'Your learning records'), el('p', {}, 'Lessons, attempts, completion, and the review queue are saved on this machine. Refreshing the browser or restarting the app preserves them.'), el('p', { class: 'small' }, 'Model requests send the relevant learning content to the connected service. Local storage does not mean offline inference.')));
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
window.addEventListener('hashchange', () => { routeFromHash(); feedback = null; selected = ''; answer = ''; review = null; render(); });
try {
  await refresh(); routeFromHash(); render();
  state.jobs.filter(j => ['queued', 'running'].includes(j.status)).forEach(j => { void watchJob(j.id); });
  connection = await api('connection'); render();
} catch (error) { root.replaceChildren(el('main', { id: 'main', class: 'boot' }, el('h1', {}, 'Your workspace couldn’t open.'), el('p', {}, error.message), el('button', { onClick: () => location.reload() }, 'Try again'))); }
