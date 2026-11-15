import { lessonScenes } from './plugin-registry.js';
import { diagramMermaid, diagramSVG } from './diagrams.js';

const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function slideDocument(lesson) {
  const scenes = lessonScenes(lesson);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(lesson.title)}</title><style>html{scroll-snap-type:y mandatory}body{margin:0;background:#f5f4ef;color:#224f40;font:clamp(18px,2vw,30px)/1.6 system-ui,sans-serif}section{min-height:100vh;box-sizing:border-box;padding:8vw;display:flex;flex-direction:column;justify-content:center;scroll-snap-align:start}h1{font:clamp(32px,5vw,72px)/1.2 Georgia,serif}p{white-space:pre-wrap}svg{max-width:100%;max-height:48vh}nav{display:flex;justify-content:space-between;gap:20px;font-size:16px;margin-top:30px}a{color:inherit}pre{font-size:14px;white-space:pre-wrap}@media print{section{break-after:page;min-height:auto;height:100vh}nav{display:none}}</style></head><body>${scenes.map((scene, index) => `<section id="scene-${index}"><small>${index + 1} / ${scenes.length}</small><h1>${escape(scene.title)}</h1><p>${escape(scene.text)}</p>${scene.diagram ? diagramSVG(scene.diagram, `slide-${index}`) : ''}<nav>${index ? `<a href="#scene-${index - 1}">Previous</a>` : '<span></span>'}${index < scenes.length - 1 ? `<a href="#scene-${index + 1}">Next</a>` : '<span>End of lesson</span>'}</nav></section>`).join('')}</body></html>`;
}
export function lessonMarkdown(lesson) {
  const lines = [`# ${lesson.title}`, '', lesson.summary, '', '## Learning objectives', ...lesson.objectives.map(o => `- ${o.title}`), ''];
  for (const b of lesson.blocks) {
    if (b.type === 'heading') lines.push(`## ${b.text}`);
    else if (b.type === 'bullets') lines.push(...b.items.map(i => `- ${i}`));
    else if (b.type === 'diagram') lines.push(b.text, '', '```mermaid', diagramMermaid(b.diagram), '```');
    else if (b.type === 'code') { const fence = '`'.repeat(Math.max(3, ...(b.text.match(/`+/g) ?? []).map(s => s.length + 1))); lines.push(fence, b.text, fence); }
    else lines.push(b.text);
    lines.push('');
  }
  return lines.join('\n');
}
