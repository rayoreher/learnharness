const names = { 'multiple-choice': 'Multiple choice', open: 'Open response', 'fill-blank': 'Fill in the blank', flashcard: 'Flashcards' };
const node = (document, tag, text) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; };
const fence = (language, text) => { const marker = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1))); return `${marker}${language}\n${text}\n${marker}`; };
function slideScenes(text) {
  const scenes = []; let lines = [], code = null, math = false;
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) { if (!code) code = marker[1]; else if (marker[1][0] === code[0] && marker[1].length >= code.length && !marker[2].trim()) code = null; }
    if (!code && line.trim() === '$$') math = !math;
    if (!line.trim() && !code && !math) { if (lines.length) scenes.push(lines.join('\n')); lines = []; } else lines.push(line);
  }
  if (lines.length) scenes.push(lines.join('\n')); return scenes.length ? scenes : [text];
}

function editor(type, container, props, ui) {
  const document = container.ownerDocument, root = node(document, 'div'); root.className = 'lh-lesson-practice lh-lesson-answer-editor'; container.append(root);
  let active = props.active, disposed = false, value = props.answer.status === 'empty' ? { value: '', known: true, assisted: false } : structuredClone(props.answer.value), revealed = false;
  const controls = [], cleanups = [];
  const publish = () => { if (!disposed && !props.signal.aborted) props.onChange({ status: !value.known || value.value.trim() ? 'ready' : 'unready', value: structuredClone(value) }); };
  const button = (label, work, variant = 'outline') => { const slot = node(document, 'span'); root.append(slot); const handle = ui.mountButton(slot, { label, variant, size: 'sm', disabled: !active, onClick: work }, { signal: props.signal }); controls.push(handle); cleanups.push(() => handle.dispose()); return handle; };
  let input, reveal;
  if (type === 'flashcard') {
    const reference = node(document, 'div'); reference.hidden = true; root.append(reference);
    reveal = button('Reveal answer', () => { if (revealed || !active) return; revealed = true; reveal.update({ label: 'Answer revealed', disabled: true }); reference.hidden = false; const rendered = ui.mountMarkdown(reference, { text: props.input.payload.reference }, { signal: props.signal }); cleanups.push(() => rendered.dispose());
      button('Needs practice', () => { value = { value: 'again', known: true, assisted: false }; publish(); });
      button('I recalled it', () => { value = { value: 'good', known: true, assisted: false }; publish(); }, 'default');
    }, 'default');
    root.append(node(document, 'p', 'Try to recall the answer before revealing it. Then rate your recall.'));
  } else {
    const label = node(document, 'label', 'Your answer'); input = node(document, 'textarea'); input.value = value.value; input.disabled = !active; input.maxLength = 10000; label.append(input); root.append(label);
    input.addEventListener('input', () => { value = { value: input.value, known: true, assisted: false }; publish(); });
  }
  button('I don’t know', () => { value = { value: '', known: false, assisted: false }; publish(); });
  const update = next => {
    active = next.active;
    if (next.answer.status !== 'empty') value = structuredClone(next.answer.value);
    if (input?.tagName === 'TEXTAREA') { if (input.value !== value.value) input.value = value.value; input.disabled = !active; }
    for (const handle of controls) handle.update({ disabled: !active });
    if (revealed) reveal.update({ disabled: true });
  };
  const dispose = () => { if (disposed) return; disposed = true; props.signal.removeEventListener('abort', dispose); for (const cleanup of cleanups.reverse()) cleanup(); root.remove(); };
  props.signal.addEventListener('abort', dispose, { once: true }); publish();
  return { update, focus: () => root.querySelector('textarea,input,button')?.focus(), appendTranscript: text => { if (input?.tagName === 'TEXTAREA' && active) { input.value += text; value = { value: input.value, known: true, assisted: false }; publish(); } }, dispose };
}

function mountExplanation(container, lesson, ctx, signal) {
  const document = container.ownerDocument, root = node(document, 'section'); root.className = 'lh-lesson-practice lh-lesson-content'; root.setAttribute('aria-label', `Lesson: ${lesson.title}`); container.append(root);
  const handles = [], releases = []; let stopped = false;
  const markdown = (parent, text) => { const handle = ctx.ui.mountMarkdown(parent, { text, allowPluginFences: true }, { signal }); handles.push(handle); return handle; };
  let controls;
  const control = (label, work) => { if (!controls) { controls = node(document, 'div'); controls.className = 'lh-lesson-controls'; root.append(controls); } const span = node(document, 'span'); controls.append(span); const h = ctx.ui.mountButton(span, { label, size: 'sm', variant: 'outline', onClick: work }, { signal }); handles.push(h); return h; };
  const header = node(document, 'header'); header.className = 'lh-lesson-header';
  const eyebrow = node(document, 'span', 'Lesson'); eyebrow.className = 'lh-lesson-eyebrow';
  const title = node(document, 'h3', lesson.title); title.className = 'lh-lesson-title'; header.append(eyebrow, title); root.append(header);
  if (lesson.settings.output === 'text') markdown(root, lesson.text);
  else if (!['slides', 'video'].includes(lesson.settings.output)) {
    const format = lesson.formats?.find(f => f.key === lesson.settings.output && f.format.kind === 'output');
    if (format) markdown(root, fence(format.format.language, lesson.text));
    else { root.append(node(document, 'p', 'This presentation plugin is unavailable. Your saved lesson remains readable.')); markdown(root, lesson.text); }
  }
  else {
    const scenes = lesson.settings.output === 'video' ? (lesson.text.match(/[\s\S]{1,500}(?:\s|$)|[\s\S]{1,500}/g) ?? [lesson.text]) : slideScenes(lesson.text), page = node(document, 'div'), count = node(document, 'p'); let index = 0;
    page.className = 'lh-lesson-slide'; page.setAttribute('role', 'group'); page.setAttribute('aria-label', 'Lesson slide');
    count.className = 'lh-lesson-page-count'; count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
    root.append(page, count); const content = markdown(page, scenes[0] ?? lesson.text);
    let previous, next;
    const draw = () => { content.update({ text: scenes[index] }); count.textContent = `Slide ${index + 1} of ${scenes.length}`; previous.update({ disabled: index === 0 }); next.update({ disabled: index === scenes.length - 1 }); };
    previous = control('Previous', () => { if (index > 0) { index--; draw(); } }); next = control('Next', () => { if (index < scenes.length - 1) { index++; draw(); } }); draw();
    if (lesson.settings.output === 'video') {
      const canvas = node(document, 'canvas'); canvas.width = 1280; canvas.height = 720; canvas.hidden = true; canvas.setAttribute('aria-label', 'Captioned lesson video'); root.append(canvas);
      const status = node(document, 'p', 'Captioned video, generated locally without narration.'); status.setAttribute('role', 'status'); root.append(status);
      if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') status.textContent = 'This browser cannot encode video. The same lesson remains readable above.';
      else {
        let recorder, stream, timer, videoURL, stopVideo, cancelled = false; const media = node(document, 'div'); root.append(media);
        const finish = () => { clearInterval(timer); if (recorder?.state === 'recording') recorder.stop(); stream?.getTracks().forEach(t => t.stop()); stopVideo?.update({ disabled: true }); };
        releases.push(() => { finish(); if (videoURL) URL.revokeObjectURL(videoURL); });
        control('Create captioned video', () => {
          if (recorder?.state === 'recording') return;
          const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)); if (!mime) { status.textContent = 'Video encoding is unavailable; use the readable lesson above.'; return; }
          const context = canvas.getContext('2d'), chunks = []; cancelled = false; canvas.hidden = false; stopVideo.update({ disabled: false }); stream = canvas.captureStream(10); recorder = new MediaRecorder(stream, { mimeType: mime });
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = () => { if (stopped || cancelled || !chunks.length) return; canvas.hidden = true; if (videoURL) URL.revokeObjectURL(videoURL); videoURL = URL.createObjectURL(new Blob(chunks, { type: mime })); const video = node(document, 'video'); video.controls = true; video.src = videoURL; const download = node(document, 'a', 'Download lesson video'); download.href = videoURL; download.download = `lesson-${lesson.nodeId}.${mime.includes('mp4') ? 'mp4' : 'webm'}`; media.replaceChildren(video, download); status.textContent = 'Your captioned video is ready.'; };
          recorder.onerror = () => { finish(); status.textContent = 'Video creation failed; your lesson remains readable above.'; };
          let frame = 0;
          const drawFrame = () => {
            context.fillStyle = '#f7f7f3'; context.fillRect(0, 0, 1280, 720); context.fillStyle = '#202020'; context.font = '32px sans-serif'; context.fillText(lesson.title.slice(0, 65), 60, 80);
            context.font = '25px sans-serif'; const words = scenes[frame].replace(/[`#*_]/g, '').split(/\s+/); let line = '', y = 160;
            for (const word of words) { if (context.measureText(line + ' ' + word).width > 1120) { context.fillText(line, 60, y); y += 38; line = word; } else line += (line ? ' ' : '') + word; if (y > 650) break; } if (y <= 650) context.fillText(line, 60, y);
            status.textContent = `Creating scene ${frame + 1} / ${scenes.length}; keep this session open.`;
          };
          drawFrame(); recorder.start(1000); timer = setInterval(() => { frame++; if (frame >= scenes.length) finish(); else drawFrame(); }, 5000);
        });
        stopVideo = control('Stop video', () => { cancelled = true; finish(); canvas.hidden = true; status.textContent = 'Video creation stopped.'; }); stopVideo.update({ disabled: true });
      }
    }
  }
  return () => { stopped = true; for (const release of releases) release(); for (const handle of handles.reverse()) handle.dispose(); root.remove(); };
}

async function mountSettings(container, ctx, signal, chatId) {
  const [snapshot, catalog] = await Promise.all([ctx.call(chatId ? 'session' : 'get-settings', chatId ? { chatId } : {}), ctx.call('formats', {})]); if (signal.aborted) return;
  let defaults = structuredClone(snapshot.settings ?? snapshot), lesson = chatId ? snapshot.session.lessons.at(-1) : null, value = structuredClone(lesson?.settings ?? defaults), pendingSave = Promise.resolve();
  const save = update => {
    const target = lesson;
    const operation = pendingSave.catch(() => {}).then(async () => {
      if (signal.aborted) return;
      const patch = typeof update === 'function' ? update(target?.settings ?? defaults) : update;
      const result = await ctx.call(target ? 'lesson-settings' : 'save-settings', target ? { chatId, lessonId: target.id, settings: patch } : patch);
      const accepted = target ? result.settings : result;
      if (target) target.settings = accepted; else defaults = accepted;
      if (signal.aborted || lesson !== target) return; value = accepted; handle.update({ rows: rows() });
    });
    pendingSave = operation; return operation;
  };
  const options = entries => entries.map(([value, label]) => ({ value, label }));
  const choices = (kind, builtins, selected) => {
    const entries = [...builtins, ...catalog.filter(f => f.format.kind === kind).map(f => [f.key, f.format.label])];
    for (const key of selected) if (!entries.some(([id]) => id === key)) entries.push([key, `${lesson?.formats?.find(f => f.key === key)?.format.label ?? key.split(':').at(-1).replaceAll('-', ' ')} (unavailable)`]);
    return entries;
  };
  const rows = () => [
    ...(chatId ? [{ key: 'lesson', type: 'dropdown', label: 'Apply to', value: lesson?.id ?? '', options: [{ value: '', label: 'Defaults for new lessons' }, ...snapshot.session.lessons.map(item => ({ value: item.id, label: item.title }))], onChange: id => {
      lesson = snapshot.session.lessons.find(item => item.id === id) ?? null;
      value = structuredClone(lesson?.settings ?? defaults); handle.update({ rows: rows() });
    } }] : []),
    { key: 'workflow', type: 'dropdown', label: 'Lesson structure', value: value.workflow, options: options(choices('workflow', [['lesson-quiz', 'Lesson, then quizzes'], ['practice-first', 'Question, then lesson']], [value.workflow])), onChange: workflow => save({ workflow }) },
    { key: 'output', type: 'dropdown', label: 'Lesson output', value: value.output, options: options(choices('output', [['text', 'Text'], ['slides', 'Slides'], ['video', 'Captioned video']], [value.output])), onChange: output => save({ output }) },
    { key: 'visual', type: 'dropdown', label: 'Diagrams', value: value.visual, options: options(choices('diagram', [['mermaid', 'Native Mermaid diagrams'], ['ascii', 'Plain text']], [value.visual])), onChange: visual => save({ visual }) },
    ...choices('quiz', Object.entries(names), value.quizTypes).map(([type, label]) => ({ key: type, type: 'toggle', label, value: value.quizTypes.includes(type), onChange: selected => save(current => ({ quizTypes: selected ? [...new Set([...current.quizTypes, type])] : current.quizTypes.filter(t => t !== type) })) }))
  ];
  const handle = ctx.ui.mountSettingsRows(container, { rows: rows() }, { signal });
  return () => handle.dispose();
}

export function activate(ctx) {
  const disposers = [];
  for (const type of ['fill-blank', 'flashcard']) disposers.push(ctx.registerQuestionRenderer({
    id: `lesson-${type}`, supportedContractVersions: [1], mountAnswerEditor: (container, props) => editor(type, container, props, ctx.ui),
    mountAnswered(container, props) {
      const handles = [], document = container.ownerDocument, root = node(document, 'div'); root.className = 'lh-lesson-practice lh-lesson-answer-record'; container.append(root);
      const outcome = props.grading && 'result' in props.grading ? props.grading.result : null;
      root.append(node(document, 'p', `Your answer: ${props.answer.known ? (type === 'flashcard' ? props.answer.value === 'good' ? 'Recalled · self-assessed' : 'Needs practice · self-assessed' : props.answer.value) : 'I don’t know'}`));
      if (outcome?.result === 'needs-feedback' || props.grading?.error) root.append(node(document, 'p', 'Teacher feedback follows in this session.'));
      else if (outcome) root.append(node(document, 'p', outcome.result === 'correct' ? 'Correct.' : 'Keep going; this concept will return in later practice.'));
      handles.push(ctx.ui.mountMarkdown(root, { text: `**Reference answer**\n\n${props.input.payload.reference}\n\n${props.input.payload.explanation}`, allowPluginFences: true }, { signal: props.signal }));
      return () => { for (const h of handles) h.dispose(); root.remove(); };
    }
  }));
  for (const toolName of ['lesson_begin', 'lesson_show']) disposers.push(ctx.registerToolRenderer({ toolName, mount(container, block) {
    if (block.state !== 'output-available' || !block.output?.lesson) return;
    if (!block.output.showExplanation) { const h = ctx.ui.mountMarkdown(container, { text: 'Try the first question. The explanation follows your answer.' }, { signal: block.signal }); return () => h.dispose(); }
    return mountExplanation(container, block.output.lesson, ctx, block.signal);
  } }));
  for (const toolName of ['lesson_feedback', 'lesson_correction']) disposers.push(ctx.registerToolRenderer({ toolName, mount(container, block) {
    if (block.state !== 'output-available' || !block.output?.reference) return;
    const value = block.output, document = container.ownerDocument, root = node(document, 'section'); root.className = 'lh-lesson-practice lh-lesson-feedback'; root.dataset.result = value.result; root.setAttribute('aria-label', 'Answer feedback');
    const status = node(document, 'span', value.result === 'correct' ? 'Correct' : value.result === 'partial' ? 'Partly correct' : 'Needs practice'); status.className = 'lh-lesson-feedback-status'; root.append(status); container.append(root);
    const h = ctx.ui.mountMarkdown(root, { text: `**Correct answer**\n\n${value.reference}\n\n${value.explanation}`, allowPluginFences: true }, { signal: block.signal }); return () => { h.dispose(); root.remove(); };
  } }));
  disposers.push(ctx.registerSettings((container, signal) => mountSettings(container, ctx, signal)));
  disposers.push(ctx.registerAction({ id: 'lesson-options', name: 'Lesson options', run(context) {
    if (context.surface !== 'session') return;
    ctx.ui.openDialog({ title: 'Lesson options', content: (container, signal) => mountSettings(container, ctx, signal, context.sessionId) }, { signal: ctx.signal });
  } }));
  disposers.push(ctx.placeAction({ id: 'lesson-options-topbar', actionId: 'lesson-options', location: 'top-bar', sessions: ['teaching'] }));
  return () => { for (const dispose of disposers.reverse()) dispose(); };
}
