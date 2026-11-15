import { diagramText, diagramMermaid, validateDiagram } from './diagrams.js';
import { prepareTextSource, mindSparkCourse } from './sources.js';
import { registerLocalPlugins } from './extensions.js';

export const PLUGIN_API = 1;
export const SLOTS = Object.freeze(['output', 'workflow', 'template', 'visual', 'exercise', 'grader', 'review', 'source']);
const idPattern = /^[a-z][a-z0-9.-]{0,79}$/;
export class PluginRegistry {
  #entries = new Map();
  register(manifest, implementation) {
    if (!manifest || manifest.apiVersion !== PLUGIN_API || !SLOTS.includes(manifest.slot) || !idPattern.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version) || typeof manifest.label !== 'string' || !manifest.label.trim()) throw new Error('Invalid or incompatible plugin manifest.');
    if (!Array.isArray(manifest.requires) || manifest.requires.some(r => typeof r !== 'string')) throw new Error('Declare plugin capability requirements.');
    const key = `${manifest.slot}:${manifest.id}`;
    if (this.#entries.has(key)) throw new Error(`Plugin contribution already exists: ${key}`);
    if (typeof implementation !== 'object' || implementation === null) throw new Error('A plugin needs an implementation.');
    const entry = Object.freeze({ manifest: Object.freeze({ ...manifest, requires: Object.freeze([...manifest.requires]) }), implementation: Object.freeze({ ...implementation }) });
    this.#entries.set(key, entry); return () => { if (this.#entries.get(key) === entry) this.#entries.delete(key); };
  }
  get(slot, id) { return this.#entries.get(`${slot}:${id}`); }
  list(slot) { return [...this.#entries.values()].filter(e => !slot || e.manifest.slot === slot); }
  select(slot, id, capabilities = [], fallback = null) {
    const selected = this.get(slot, id);
    const missing = selected ? selected.manifest.requires.filter(r => !capabilities.includes(r)) : ['plugin-not-installed'];
    if (selected && !missing.length) return { ...selected, fallback: false, reason: null };
    const replacement = fallback ? this.get(slot, fallback) : null;
    if (!replacement || replacement.manifest.requires.some(r => !capabilities.includes(r))) throw new Error(`Plugin unavailable: ${slot}/${id}`);
    return { ...replacement, fallback: true, reason: `The saved ${slot} “${id}” is unavailable (${missing.join(', ')}). Showing ${replacement.manifest.label}.` };
  }
}
export const registry = new PluginRegistry();
function builtin(slot, id, label, implementation, requires = []) {
  registry.register({ apiVersion: PLUGIN_API, id, slot, label, version: '1.0.0', requires }, implementation);
}
export function lessonScenes(lesson) {
  const scenes = [{ title: lesson.title, text: lesson.summary }];
  let heading = lesson.title;
  for (const block of lesson.blocks) {
    if (block.type === 'heading') { heading = block.text; continue; }
    if (block.type === 'diagram') { scenes.push({ title: heading, text: block.text, diagram: block.diagram }); continue; }
    const text = block.type === 'bullets' ? block.items.map(item => `• ${item}`).join('\n') : block.text;
    // Bounded scenes remain readable in slides and captioned video.
    const chunks = String(text).match(/[\s\S]{1,360}(?:\s|$)|[\s\S]{1,360}/g) ?? [];
    for (const chunk of chunks) scenes.push({ title: heading, text: chunk.trim() });
  }
  return scenes;
}
builtin('output', 'text', 'Text lesson', { project: lesson => ({ type: 'text', blocks: lesson.blocks }) });
builtin('output', 'slides', 'Slide deck', { project: lesson => ({ type: 'slides', scenes: lessonScenes(lesson) }) });
builtin('output', 'video', 'Captioned video', { project: lesson => ({ type: 'video', scenes: lessonScenes(lesson), secondsPerScene: 5 }) }, ['canvas', 'media-recorder', 'canvas-stream']);
builtin('output', 'interactive', 'Interactive walkthrough', { project: lesson => ({ type: 'interactive', scenes: lessonScenes(lesson) }) });
builtin('workflow', 'lesson-quiz', 'Lesson, then practice', { practiceFirst: false });
builtin('workflow', 'practice-first', 'Try, then explore', { practiceFirst: true });
builtin('template', 'guided', 'Guided explanation', { arrange: lesson => lesson });
builtin('template', 'example-first', 'Example first', { arrange: lesson => ({ ...lesson, blocks: [...lesson.blocks.filter(b => b.role === 'example'), ...lesson.blocks.filter(b => b.role !== 'example')] }) });
builtin('template', 'reference', 'Reference sheet', { arrange: lesson => ({ ...lesson, blocks: [{ type: 'bullets', items: lesson.objectives.map(o => o.title) }, ...lesson.blocks] }) });
builtin('visual', 'svg', 'Flow diagram', { project: diagram => ({ kind: 'svg', diagram: validateDiagram(diagram) }) });
builtin('visual', 'ascii', 'Plain-text diagram', { project: diagram => ({ kind: 'text', source: diagramText(diagram) }) });
builtin('visual', 'mermaid', 'Diagram + Mermaid source', { project: diagram => ({ kind: 'mermaid', diagram: validateDiagram(diagram), source: diagramMermaid(diagram) }) });
for (const [id, label, input, grader] of [
  ['multiple-choice', 'Multiple choice', 'choice', 'answer-key'], ['open', 'Open question', 'text', 'codex-rubric'],
  ['fill-blank', 'Fill in the blank', 'text', 'answer-key'], ['flashcard', 'Flashcards', 'recall', 'self-assessment'],
  ['true-false', 'True or false', 'choice', 'answer-key'], ['ordering', 'Put in order', 'ordered', 'ordered-key']
]) builtin('exercise', id, label, { input, grader, ...(id === 'true-false' ? { validate: exercise => { if (exercise.options.length !== 2 || !exercise.options.includes('True') || !exercise.options.includes('False')) throw new Error('True-false exercises need exactly True and False.'); } } : {}) });
const normalized = value => value.normalize('NFKC').toLocaleLowerCase('en').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
builtin('grader', 'answer-key', 'Answer key', { grade: async ({ exercise, answer }) => ({ result: normalized(answer) === normalized(exercise.answer) ? 'correct' : 'incorrect', feedback: exercise.explanation }) });
builtin('grader', 'ordered-key', 'Ordered answer key', { grade: async ({ exercise, answer }) => ({ result: JSON.stringify(JSON.parse(answer)) === JSON.stringify(JSON.parse(exercise.answer)) ? 'correct' : 'incorrect', feedback: exercise.explanation }) });
builtin('grader', 'codex-rubric', 'Codex rubric', { grade: async ({ exercise, answer }, context) => context.assess(exercise, answer) }, ['codex-chatgpt']);
builtin('grader', 'self-assessment', 'Self assessment', { grade: async ({ exercise }) => ({ result: 'pending', feedback: exercise.explanation }) });
builtin('review', 'session', 'Return to missed concepts', { delayAttempts: 2, delayMs: 30000, requiredCorrect: 1 });
builtin('review', 'reinforced', 'Two successful returns', { delayAttempts: 2, delayMs: 30000, requiredCorrect: 2 });
builtin('review', 'spaced', 'Session review + spaced recall', { delayAttempts: 2, delayMs: 30000, requiredCorrect: 1, spacedDays: [1, 3, 7, 14, 30] });
builtin('source', 'goal', 'Learning goal', {});
builtin('source', 'sample', 'Included sample', {});
builtin('source', 'text', 'Text notes', { prepare: prepareTextSource });
builtin('source', 'markdown', 'Markdown notes', { prepare: prepareTextSource });
builtin('source', 'mindspark', 'MindSpark study records', { prepare: mindSparkCourse });
registerLocalPlugins(registry);

export function presentationSettings(input = {}, defaults = {}) {
  const settings = { format: input.format ?? defaults.format ?? 'text', workflow: input.workflow ?? defaults.workflow ?? 'lesson-quiz', template: input.template ?? defaults.template ?? 'guided', visual: input.visual ?? defaults.visual ?? 'svg', review: input.review ?? defaults.review ?? 'session' };
  for (const [field, slot] of [['format', 'output'], ['workflow', 'workflow'], ['template', 'template'], ['visual', 'visual'], ['review', 'review']]) {
    if (!registry.get(slot, settings[field])) throw new Error(`Unsupported ${field}: ${settings[field]}`);
  }
  return settings;
}
export function projectLesson(lesson, settings, capabilities = []) {
  const template = registry.select('template', settings.template, capabilities, 'guided');
  const output = registry.select('output', settings.format, capabilities, 'text');
  return { ...output.implementation.project(template.implementation.arrange(lesson)), warning: output.reason || template.reason, plugin: output.manifest };
}
