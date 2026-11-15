'use strict';
const { TYPES } = require('./domain.cjs');
const string = (maxLength = 12000) => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const settingsSchema = { type: 'object', properties: {
  workflow: { enum: ['lesson-quiz', 'practice-first'] }, output: { enum: ['text', 'slides', 'video'] }, visual: { enum: ['mermaid', 'ascii'] },
  quizTypes: { type: 'array', minItems: 1, maxItems: TYPES.length, uniqueItems: true, items: { enum: TYPES } }
}, additionalProperties: false };
const questionSchema = type => object({ quizType: { const: type }, lessonId: string(128), conceptId: string(128), reference: string(6000), explanation: string(6000), options: { type: 'array', maxItems: 8, items: string(1000) }, review: { type: 'boolean' } });
const answerSchema = object({ value: { type: 'string', maxLength: 10000 }, known: { type: 'boolean' }, assisted: { type: 'boolean' } });
const beginSchema = { ...object({ lessonId: string(128), nodeId: string(128), title: string(200), text: string() }), properties: { lessonId: string(128), nodeId: string(128), title: string(200), text: string(), settings: settingsSchema } };
module.exports = { string, object, settingsSchema, questionSchema, answerSchema, beginSchema };
