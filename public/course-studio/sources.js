export function prepareTextSource(input) {
  if (!input || !['text', 'markdown'].includes(input.kind) || typeof input.content !== 'string' || !input.content.trim() || new TextEncoder().encode(input.content).length > 24000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.content)) throw new Error('Choose a UTF-8 text or Markdown excerpt of at most 24 KB.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('Give the source a name of at most 200 characters.');
  return { kind: input.kind, name: input.name.trim(), content: input.content.replace(/\r\n/g, '\n') };
}
export function mindSparkCourse(input) {
  const records = Array.isArray(input) ? input : [input];
  if (!records.length || records.length > 20) throw new Error('Import between 1 and 20 MindSpark study records.');
  const lessons = records.map((record, index) => {
    const data = record?.data ?? record, quiz = data?.quiz;
    if (!quiz || typeof quiz !== 'object') throw new Error('This is not a supported MindSpark study record.');
    const prefix = `study-${index}`, conceptId = `${prefix}-topic`;
    const title = String(record.name ?? data.title ?? `Study topic ${index + 1}`).slice(0, 200);
    const explanation = String(record.answer ?? data.answer ?? '');
    if (!explanation.trim()) throw new Error('MindSpark records need their original explanatory answer.');
    const blocks = [{ type: 'paragraph', text: explanation }, ...(data.tips ?? []).map(t => ({ type: 'paragraph', text: String(t) })), ...(quiz.micro_reels ?? []).map(r => ({ type: 'paragraph', text: String(r.text) }))];
    let serial = 0; const exercises = [];
    const add = e => exercises.push({ id: `${prefix}-question-${++serial}`, conceptIds: [conceptId], rubric: '', options: [], ...e });
    for (const q of quiz.open_questions ?? []) add({ type: 'open', question: q.question, answer: q.answer, explanation: q.answer, rubric: 'Accept equivalent wording that communicates the reference concepts.' });
    for (const [key, type] of [['multiple_choice_questions', 'multiple-choice'], ['fill_in_the_blank', 'fill-blank']]) {
      for (const q of quiz[key] ?? []) {
        if (!Array.isArray(q.answers)) throw new Error('MindSpark answer choices are missing.');
        const correct = q.answers.filter(a => a.is_correct === true).map(a => a.text);
        if (!correct.length) throw new Error('A MindSpark question has no reference answer.');
        if (correct.length > 1) add({ type: 'open', question: q.question, answer: correct.join('; '), explanation: correct.join('; '), rubric: 'The reference lists multiple correct concepts; accept semantically equivalent coverage.' });
        else add({ type, question: q.question, answer: correct[0], explanation: correct[0], options: type === 'multiple-choice' ? q.answers.map(a => a.text) : [] });
      }
    }
    for (const q of quiz.flashcards ?? []) add({ type: 'flashcard', question: q.front, answer: q.back, explanation: q.back });
    return { id: prefix, title, summary: String(record.question ?? data.question ?? title).slice(0, 1000), objectives: [{ id: conceptId, title }], blocks, exercises };
  });
  return { title: records.length === 1 ? lessons[0].title : 'Imported MindSpark learning path', summary: 'Your existing study material, with persistent concept review.', goal: 'Understand and retain the imported study material.', level: 'beginner', settings: { exerciseTypes: ['multiple-choice', 'open', 'fill-blank', 'flashcard'] }, lessons };
}
