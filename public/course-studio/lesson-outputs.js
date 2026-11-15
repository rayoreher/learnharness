import { projectLesson, registry } from './plugin-registry.js';
import { mountDiagram } from './diagram-view.js';
import { diagramLayout, diagramEdgePath } from './diagrams.js';
import { slideDocument } from './exports.js';

function node(tag, value, className) { const e = document.createElement(tag); if (value !== undefined) e.textContent = value; if (className) e.className = className; return e; }
function control(label, work) { const b = node('button', label); b.type = 'button'; b.addEventListener('click', work); return b; }
function block(b, settings) {
  if (b.type === 'diagram') { const figure = mountDiagram(b.diagram, settings.visual); figure.append(node('figcaption', b.text)); return figure; }
  if (b.type === 'heading') return node('h3', b.text);
  if (b.type === 'code') { const p = node('pre'); p.append(node('code', b.text)); return p; }
  if (b.type === 'bullets') { const list = node('ul'); for (const item of b.items) list.append(node('li', item)); return list; }
  return node('p', b.text);
}
function capabilities() {
  const canvas = document.createElement('canvas');
  return ['canvas', ...(typeof MediaRecorder !== 'undefined' ? ['media-recorder'] : []), ...(typeof canvas.captureStream === 'function' ? ['canvas-stream'] : [])];
}
export function mountLessonOutput(lesson, settings) {
  const view = projectLesson(lesson, settings, capabilities());
  const container = node('div', undefined, `lesson-output output-${view.type}`);
  const cleanup = [];
  if (view.warning) { const warning = node('p', view.warning, 'small'); warning.setAttribute('role', 'status'); container.append(warning); }
  if (view.type === 'text') container.append(...view.blocks.map(b => block(b, settings)));
  if (view.type === 'slides' || view.type === 'interactive') {
    let index = 0, revealed = view.type !== 'interactive';
    const scene = node('section', undefined, 'slide'); scene.setAttribute('aria-live', 'polite');
    const controls = node('div', undefined, 'row spread');
    const counter = node('span', undefined, 'small');
    const previous = control('← Previous', () => { index--; revealed = view.type !== 'interactive'; draw(); });
    const next = control('Next →', () => { index++; revealed = view.type !== 'interactive'; draw(); });
    const draw = () => {
      const item = view.scenes[index]; scene.replaceChildren(node('p', `Scene ${index + 1}`, 'eyebrow'), node('h3', item.title));
      if (revealed) { scene.append(node('p', item.text)); if (item.diagram) scene.append(mountDiagram(item.diagram, settings.visual)); }
      else scene.append(node('p', 'Before revealing this step, consider what you already know and what you expect to learn.', 'small'), control('Explore this step', () => { revealed = true; draw(); }));
      previous.disabled = index === 0; next.disabled = index === view.scenes.length - 1 || !revealed;
      counter.textContent = `${index + 1} / ${view.scenes.length}`;
    };
    controls.append(previous, counter, next); container.append(scene, controls); draw();
    if (view.type === 'slides') {
      const exportDeck = control('Download slide deck', () => { const blob = new Blob([slideDocument(lesson)], { type: 'text/html' }), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `lesson-${lesson.id}-slides.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); });
      container.append(exportDeck);
    }
  }
  if (view.type === 'video') {
    const canvas = node('canvas'); canvas.width = 1280; canvas.height = 720; canvas.setAttribute('aria-label', 'Captioned lesson video preview');
    const description = node('p', 'A captioned visual lesson. No narration or external video service is used.', 'small');
    const status = node('p', 'Ready to create your video.', 'small'); status.setAttribute('role', 'status');
    const player = node('video'); player.controls = true; player.hidden = true;
    let recording = false, recorder, stream, timer, url, alive = true;
    const ctx = canvas.getContext('2d');
    const lines = (text, width) => {
      const result = []; let current = '';
      for (const paragraph of text.split('\n')) {
        for (const word of paragraph.split(/\s+/)) { const candidate = current ? `${current} ${word}` : word; if (ctx.measureText(candidate).width > width && current) { result.push(current); current = word; } else current = candidate; }
        if (current) result.push(current); current = '';
      }
      return result;
    };
    const draw = (index, fraction = 1) => {
      const scene = view.scenes[index];
      ctx.fillStyle = '#f5f4ef'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#224f40'; ctx.font = '20px sans-serif'; ctx.fillText('LEARNHARNESS · COURSE STUDIO', 80, 74);
      ctx.font = '42px Georgia'; let y = 170;
      for (const line of lines(scene.title, 1100)) { ctx.fillText(line, 80, y); y += 52; }
      ctx.fillStyle = '#37463b'; ctx.font = '30px sans-serif'; y += 28;
      for (const line of lines(scene.text, 1100).slice(0, scene.diagram ? 2 : 9)) { ctx.fillText(line, 80, y); y += 44; }
      if (scene.diagram) {
        const visual = registry.select('visual', settings.visual ?? 'svg', [], 'svg').implementation.project(scene.diagram);
        if (visual.kind === 'text') { ctx.font = '21px monospace'; for (const line of lines(visual.source, 1100).slice(0, 7)) { ctx.fillText(line, 80, y); y += 30; } }
        else {
        const layout = diagramLayout(scene.diagram), scale = Math.min(1100 / layout.width, Math.max(80, 610 - y) / layout.height);
        ctx.save(); ctx.translate(80, y + 8); ctx.scale(scale, scale); ctx.strokeStyle = '#446b50'; ctx.lineWidth = 2;
        for (const edge of layout.edges) { const a = layout.nodes.find(n => n.id === edge.from), b = layout.nodes.find(n => n.id === edge.to), back = a.x >= b.x, x = back ? b.x + b.width / 2 : b.x, edgeY = back ? b.y + b.height : b.y + b.height / 2; ctx.stroke(new Path2D(diagramEdgePath(layout, edge))); ctx.beginPath(); ctx.moveTo(x, edgeY); ctx.lineTo(x + (back ? -5 : -8), edgeY + (back ? 8 : -5)); ctx.lineTo(x + (back ? 5 : -8), edgeY + (back ? 8 : 5)); ctx.closePath(); ctx.fillStyle = '#446b50'; ctx.fill(); }
        for (const n of layout.nodes) { ctx.fillStyle = '#dfebd9'; ctx.fillRect(n.x, n.y, n.width, n.height); ctx.strokeRect(n.x, n.y, n.width, n.height); ctx.fillStyle = '#224f40'; ctx.font = '14px sans-serif'; const label = n.label.match(/.{1,21}/gu) ?? ['']; label.slice(0, 3).forEach((line, i) => ctx.fillText(line, n.x + 8, n.y + 24 + i * 18)); }
        ctx.restore();
        }
      }
      ctx.fillStyle = '#cbd8c3'; ctx.fillRect(80, 650, 1120, 5); ctx.fillStyle = '#224f40'; ctx.fillRect(80, 650, 1120 * (index + fraction) / view.scenes.length, 5);
      ctx.font = '18px sans-serif'; ctx.fillText(`${index + 1} / ${view.scenes.length}`, 80, 690);
    };
    const stop = () => { clearInterval(timer); if (recorder?.state === 'recording') recorder.stop(); for (const track of stream?.getTracks() ?? []) track.stop(); recording = false; };
    const cancel = control('Cancel video', () => { stop(); status.textContent = 'Video creation stopped. You can create it again.'; }); cancel.hidden = true;
    const create = control('Create captioned video', () => {
      if (recording) return;
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(value => MediaRecorder.isTypeSupported(value));
      if (!mime) { status.textContent = 'This browser cannot encode a supported video. Choose the slide deck format.'; return; }
      const chunks = []; let cancelled = false;
      try {
        stream = canvas.captureStream(20); recorder = new MediaRecorder(stream, { mimeType: mime }); recording = true; create.disabled = true; cancel.hidden = false;
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => {
          if (!alive) return;
          create.disabled = false; cancel.hidden = true;
          if (cancelled || !chunks.length) return;
          if (url) URL.revokeObjectURL(url);
          const blob = new Blob(chunks, { type: mime }); url = URL.createObjectURL(blob); player.src = url; player.hidden = false;
          const link = node('a', 'Download lesson video ↓'); link.href = url; link.download = `lesson-${lesson.id}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
          downloads.replaceChildren(link); status.textContent = 'Your video is ready. Play it here or download it.';
        };
        recorder.onerror = () => { cancelled = true; stop(); status.textContent = 'This browser could not create the video. Your lesson and progress are saved.'; };
        cancel.onclick = () => { cancelled = true; stop(); status.textContent = 'Video creation stopped. You can create it again.'; };
        const start = performance.now(); recorder.start(1000);
        timer = setInterval(() => {
          const elapsed = (performance.now() - start) / 1000; const index = Math.floor(elapsed / view.secondsPerScene);
          if (index >= view.scenes.length) { stop(); return; }
          draw(index, (elapsed % view.secondsPerScene) / view.secondsPerScene);
          status.textContent = `Creating scene ${index + 1} of ${view.scenes.length}… keep this tab open.`;
        }, 50);
      } catch { stop(); create.disabled = false; cancel.hidden = true; status.textContent = 'Video recording is unavailable. Choose slides to continue.'; }
    });
    const downloads = node('div'); const controls = node('div', undefined, 'row'); controls.append(create, cancel);
    container.append(description, canvas, controls, status, player, downloads); draw(0);
    cleanup.push(() => { alive = false; stop(); if (url) URL.revokeObjectURL(url); });
  }
  return { element: container, dispose: () => cleanup.forEach(work => work()) };
}
