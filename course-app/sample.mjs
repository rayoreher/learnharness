import { validateCourse, TYPES } from './schema.mjs';

export function sampleCourse() {
  return validateCourse({ title: 'How learning sticks', goal: 'Understand and use active recall and spaced practice.', level: 'beginner', summary: 'Three small lessons about remembering, understanding, and making practice work for you.', settings: { exerciseTypes: TYPES }, lessons: [
    { id: 'recall', title: 'Retrieve before you reveal', summary: 'Give your memory a chance to work.', objectives: [{ id: 'active-recall', title: 'Explain active recall' }], blocks: [
      { type: 'paragraph', text: 'Reading an answer can make it feel familiar. Active recall adds a different step: try to produce the answer before looking. That attempt shows you what you can retrieve without help.' },
      { type: 'heading', text: 'A small experiment' },
      { type: 'paragraph', role: 'example', text: 'Close your notes and explain yesterday’s main idea in two sentences. Then compare your explanation with the notes. A gap is useful information: it gives your next practice a clear target.' },
      { type: 'bullets', items: ['Try first, even when you are unsure.', 'Check the answer and understand the explanation.', 'Bring the missed idea back in a later question.'] },
      { type: 'diagram', text: 'A practice loop: attempt recall, use feedback, then return later.', diagram: { nodes: [{ id: 'learn', label: 'Learn the idea' }, { id: 'try', label: 'Try recall' }, { id: 'feedback', label: 'Read feedback' }, { id: 'return', label: 'Return later' }], edges: [{ from: 'learn', to: 'try' }, { from: 'try', to: 'feedback' }, { from: 'feedback', to: 'return' }, { from: 'return', to: 'try' }] } }
    ], exercises: [
      { id: 'recall-choice', type: 'multiple-choice', conceptIds: ['active-recall'], question: 'Which action gives you evidence of what you can retrieve?', options: ['Highlighting an answer', 'Explaining the idea with the notes closed', 'Reading the same page again'], answer: 'Explaining the idea with the notes closed', explanation: 'An explanation produced without notes makes retrieval visible. Looking at the answer first removes that opportunity.' },
      { id: 'recall-open', type: 'open', conceptIds: ['active-recall'], question: 'Why should you try answering before revealing the solution?', answer: 'Trying first exercises retrieval and exposes gaps that looking at the solution can hide.', explanation: 'The attempt gives you evidence about recall. The revealed solution then provides corrective feedback.', rubric: 'Accept an explanation mentioning retrieval or testing memory and finding gaps. Exact wording is unnecessary.' },
      { id: 'recall-card', type: 'flashcard', conceptIds: ['active-recall'], question: 'What is active recall?', answer: 'Trying to retrieve information from memory before checking a source.', explanation: 'Think of your answer before revealing this card, then rate whether you recalled the idea.' }
    ] },
    { id: 'spacing', title: 'Leave room between attempts', summary: 'Return to ideas over time.', objectives: [{ id: 'spaced-practice', title: 'Explain spaced practice' }], blocks: [
      { type: 'paragraph', text: 'Spaced practice distributes encounters with an idea across time. Instead of repeating one answer immediately until it sounds familiar, return after other questions or on another day.' },
      { type: 'paragraph', role: 'example', text: 'Imagine practicing ten vocabulary words. After a miss, check the answer, try several other words, then return. A later successful retrieval gives you different evidence from simply repeating the solution you just saw.' },
      { type: 'bullets', items: ['Keep moving after feedback.', 'Return to missed concepts.', 'Use later practice to check retention.'] }
    ], exercises: [
      { id: 'spacing-blank', type: 'fill-blank', conceptIds: ['spaced-practice'], question: 'Practice distributed across time is called _____ practice. Enter one word.', answer: 'spaced', explanation: 'Spaced practice separates encounters with material across time.' },
      { id: 'spacing-choice', type: 'multiple-choice', conceptIds: ['spaced-practice'], question: 'After missing a question and reading its answer, what is a useful next step?', options: ['Treat the revealed answer as proof of mastery', 'Return to the concept after other practice', 'Remove the concept from all future practice'], answer: 'Return to the concept after other practice', explanation: 'A later attempt tests retrieval after the immediate answer is less available.' },
      { id: 'spacing-true', type: 'true-false', conceptIds: ['spaced-practice'], question: 'Spaced practice distributes encounters with an idea across time.', options: ['True', 'False'], answer: 'True', explanation: 'The time between encounters is part of spaced practice.' },
      { id: 'spacing-order', type: 'ordering', conceptIds: ['spaced-practice'], question: 'Arrange a useful practice cycle.', options: ['Return to the concept', 'Try recall', 'Check feedback'], answer: JSON.stringify(['Try recall', 'Check feedback', 'Return to the concept']), explanation: 'Attempt retrieval, check feedback, then return later.' }
    ] },
    { id: 'transfer', title: 'Recognize the idea in a new setting', summary: 'Practice the concept through more than one question.', objectives: [{ id: 'concept-transfer', title: 'Distinguish a concept from its question wording' }], blocks: [
      { type: 'paragraph', text: 'A question is one way to test a concept. The same idea can appear as a definition, a choice between examples, or an explanation of a new situation. Trying another form can expose gaps that a repeated wording misses.' },
      { type: 'paragraph', text: 'Course completion records what you have covered. Your review queue records the concepts that need another attempt. Both records matter: you can finish a lesson and still have useful practice waiting.' }
    ], exercises: [
      { id: 'transfer-choice', type: 'multiple-choice', conceptIds: ['concept-transfer'], question: 'You missed a definition question. Which review could test the same concept in another way?', options: ['An unrelated question', 'A new situation requiring the same idea', 'A page-open counter'], answer: 'A new situation requiring the same idea', explanation: 'The objective stays the same while the context changes.' },
      { id: 'transfer-card', type: 'flashcard', conceptIds: ['concept-transfer'], question: 'Does completing a lesson mean every concept is mastered?', answer: 'No. Completion records coverage; recall and review history provide separate evidence about understanding.', explanation: 'You can continue through the course while keeping missed concepts in the review queue.' }
    ] }
  ] });
}
