import { registry } from './plugin-registry.js';
import { diagramLayout, diagramEdgePath } from './diagrams.js';

export function mountDiagram(diagram, visual = 'svg') {
  const selected = registry.select('visual', visual, [], 'svg'), projected = selected.implementation.project(diagram);
  const root = document.createElement('figure'); root.className = 'diagram';
  if (projected.kind === 'text') { const pre = document.createElement('pre'); pre.textContent = projected.source; root.append(pre); }
  else {
    const layout = diagramLayout(diagram), namespace = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs = {}, text) => { const e = document.createElementNS(namespace, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, String(value)); if (text !== undefined) e.textContent = text; return e; };
    const svg = make('svg', { viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height, role: 'img', 'aria-label': 'Flow diagram: ' + layout.nodes.map(n => n.label).join(', ') });
    const markerId = `arrow-${crypto.randomUUID()}`;
    const defs = make('defs'), marker = make('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(make('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#446b50' })); defs.append(marker); svg.append(defs);
    for (const edge of layout.edges) {
      svg.append(make('path', { d: diagramEdgePath(layout, edge), fill: 'none', stroke: '#446b50', 'stroke-width': 2, 'marker-end': `url(#${markerId})` }));
    }
    for (const n of layout.nodes) {
      const group = make('g'); group.append(make('title', {}, n.label), make('rect', { x: n.x, y: n.y, width: n.width, height: n.height, rx: 9, fill: '#e6eddf', stroke: '#8aa282' }));
      const lines = n.label.match(/.{1,21}/gu) ?? [''];
      lines.slice(0, 3).forEach((line, index) => group.append(make('text', { x: n.x + n.width / 2, y: n.y + 30 - (Math.min(lines.length, 3) - 1) * 7 + index * 18, 'text-anchor': 'middle', fill: '#224f40', 'font-family': 'system-ui,sans-serif', 'font-size': 13 }, line + (index === 2 && lines.length > 3 ? '…' : ''))));
      svg.append(group);
    }
    const wrapper = document.createElement('div'); wrapper.className = 'diagram-scroll'; wrapper.append(svg); root.append(wrapper);
  }
  if (projected.source) { const details = document.createElement('details'), title = document.createElement('summary'), source = document.createElement('pre'); title.textContent = projected.kind === 'mermaid' ? 'Mermaid source' : 'Diagram text'; source.textContent = projected.source; details.append(title, source); root.append(details); }
  if (selected.reason) { const caption = document.createElement('figcaption'); caption.textContent = selected.reason; root.append(caption); }
  return root;
}
