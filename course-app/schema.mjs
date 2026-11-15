import { randomUUID } from 'node:crypto';

export const VERSION = '0.1.0';
export const TYPES = ['multiple-choice', 'open', 'fill-blank', 'flashcard'];
export class Problem extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new Problem(message, status);
}
export function text(value, name, max = 20000) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name} must contain between 1 and ${max} characters.`);
  return value.trim();
}
export function exerciseTypes(value) {
  check(Array.isArray(value) && value.length > 0 && value.length <= TYPES.length && value.every(x => TYPES.includes(x)) && new Set(value).size === value.length, 'Choose at least one supported exercise type.');
  return value;
}
export function validateCourse(input) {
  check(input && typeof input === 'object', 'A course must be an object.');
  const goal = text(input.goal, 'Learning goal', 2000);
  const settings = { exerciseTypes: exerciseTypes(input.settings?.exerciseTypes ?? TYPES), format: 'text', workflow: 'lesson-quiz' };
  check(Array.isArray(input.lessons) && input.lessons.length >= 1 && input.lessons.length <= 20, 'A course needs 1–20 small lessons.');
  const ids = new Set();
  const unique = (value, label) => { const id = text(value, label, 100); check(/^[a-zA-Z0-9_-]+$/.test(id) && !['__proto__', 'prototype', 'constructor'].includes(id) && !ids.has(id), `${label} must be a unique simple identifier.`); ids.add(id); return id; };
  const lessons = input.lessons.map(l => {
    const id = unique(l.id, 'Lesson ID');
    check(Array.isArray(l.objectives) && l.objectives.length > 0 && l.objectives.length <= 8, 'Each lesson needs 1–8 learning objectives.');
    const objectives = l.objectives.map(o => ({ id: unique(o.id, 'Concept ID'), title: text(o.title, 'Objective', 400) }));
    const concepts = new Set(objectives.map(o => o.id));
    check(Array.isArray(l.blocks) && l.blocks.length > 0 && l.blocks.length <= 40, 'Each lesson needs explanatory content.');
    const blocks = l.blocks.map(b => {
      check(['paragraph', 'heading', 'bullets', 'code'].includes(b.type), 'Unsupported lesson block.');
      if (b.type === 'bullets') {
        check(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 20, 'A list needs items.');
        return { type: b.type, items: b.items.map(x => text(x, 'List item', 2000)) };
      }
      return { type: b.type, text: text(b.text, 'Lesson text') };
    });
    check(Array.isArray(l.exercises) && l.exercises.length > 0 && l.exercises.length <= 40, 'Each lesson needs exercises.');
    const exercises = l.exercises.map(e => {
      check(TYPES.includes(e.type), 'Unsupported exercise type.');
      check(Array.isArray(e.conceptIds) && e.conceptIds.length > 0 && e.conceptIds.every(c => concepts.has(c)), 'Exercises must reference their lesson objectives.');
      const options = e.type === 'multiple-choice' ? e.options : [];
      check(Array.isArray(options) && options.length <= 8, 'Invalid answer options.');
      if (e.type === 'multiple-choice') check(options.length >= 2 && options.every(x => typeof x === 'string' && x.length > 0 && x.length <= 2000) && new Set(options).size === options.length && options.includes(e.answer), 'Multiple-choice exercises need distinct options including the correct answer.');
      return { id: unique(e.id, 'Exercise ID'), type: e.type, conceptIds: [...new Set(e.conceptIds)], question: text(e.question, 'Question', 4000), answer: text(e.answer, 'Answer', 6000), explanation: text(e.explanation, 'Explanation', 6000), rubric: typeof e.rubric === 'string' ? e.rubric.slice(0, 6000) : '', options };
    });
    check(objectives.every(o => exercises.some(e => e.conceptIds.includes(o.id))), 'Every objective needs at least one exercise.');
    return { id, title: text(l.title, 'Lesson title', 200), summary: text(l.summary, 'Lesson summary', 1000), objectives, blocks, exercises };
  });
  return { id: randomUUID(), version: 1, title: text(input.title, 'Course title', 200), summary: text(input.summary, 'Course summary', 2000), goal, level: text(input.level ?? 'beginner', 'Level', 100), settings, lessons, createdAt: new Date().toISOString() };
}
export function publicExercise(exercise) {
  const { answer, explanation, rubric, ...safe } = exercise;
  return safe;
}
export function publicCourse(course) {
  return { ...course, lessons: course.lessons.map(l => ({ ...l, exercises: l.exercises.map(publicExercise) })) };
}

// All fields are required for structured generation; semantic validation remains server-owned.
const string = { type: 'string' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = items => ({ type: 'array', items });
export const COURSE_SCHEMA = object({
  title: string, summary: string, goal: string, level: string,
  lessons: array(object({ id: string, title: string, summary: string,
    objectives: array(object({ id: string, title: string })),
    blocks: array(object({ type: { enum: ['paragraph', 'heading', 'bullets', 'code'] }, text: string, items: array(string) })),
    exercises: array(object({ id: string, type: { enum: TYPES }, conceptIds: array(string), question: string, answer: string, explanation: string, rubric: string, options: array(string) }))
  }))
});
export const GRADE_SCHEMA = object({ result: { enum: ['correct', 'partial', 'incorrect'] }, feedback: string });
