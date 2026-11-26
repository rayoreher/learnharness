'use strict';
const { assert, settings } = require('./domain.cjs');
const fields = { workflow: 'workflow', output: 'output', visual: 'diagram' };
const formatsFor = (value, catalog) => catalog.filter(f => Object.keys(fields).some(field => value[field] === f.key && f.format.kind === fields[field]) || (value.quizTypes.includes(f.key) && f.format.kind === 'quiz'));
function selectedSettings(input, previous, catalog, requireAvailable = false) {
  const next = settings(input, previous);
  for (const [field, kind] of Object.entries(fields)) if (next[field].includes(':') && (requireAvailable || next[field] !== previous[field])) {
    assert(catalog.some(f => f.key === next[field] && f.format.kind === kind), `The selected ${kind} plugin is unavailable. Enable it or choose another format.`);
  }
  for (const key of next.quizTypes) if (key.includes(':') && (requireAvailable || !previous.quizTypes.includes(key))) {
    assert(catalog.some(f => f.key === key && f.format.kind === 'quiz'), 'The selected quiz plugin is unavailable. Enable it or choose another format.');
  }
  return next;
}
const afterFirstAnswer = lesson => lesson.settings.workflow === 'practice-first' || lesson.formats?.some(f => f.key === lesson.settings.workflow && f.format.kind === 'workflow' && f.format.explanation === 'after-first-answer');
module.exports = { formatsFor, selectedSettings, afterFirstAnswer };
