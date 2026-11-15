export function validateDiagram(value) {
  if (!value || !Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > 24 || !Array.isArray(value.edges) || value.edges.length > 48) throw new Error('A flow diagram needs 1–24 nodes and at most 48 edges.');
  const ids = new Set();
  const nodes = value.nodes.map(n => {
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(n.id) || ids.has(n.id) || typeof n.label !== 'string' || !n.label.trim() || n.label.length > 100) throw new Error('Diagram nodes need unique IDs and short text labels.');
    ids.add(n.id); return { id: n.id, label: n.label.trim() };
  });
  const seen = new Set();
  const edges = value.edges.map(e => {
    const key = JSON.stringify([e?.from, e?.to]);
    if (!e || !ids.has(e.from) || !ids.has(e.to) || seen.has(key)) throw new Error('Diagram edges must reference known nodes without duplicates.');
    seen.add(key); return { from: e.from, to: e.to };
  });
  return { nodes, edges };
}
export function diagramLayout(source) {
  const diagram = validateDiagram(source);
  const degrees = new Map(diagram.nodes.map(n => [n.id, 0])), levels = new Map(diagram.nodes.map(n => [n.id, 0]));
  for (const edge of diagram.edges) degrees.set(edge.to, degrees.get(edge.to) + 1);
  const queue = diagram.nodes.filter(n => degrees.get(n.id) === 0).map(n => n.id); let processed = 0;
  while (queue.length) {
    const id = queue.shift(); processed++;
    for (const edge of diagram.edges.filter(e => e.from === id)) { levels.set(edge.to, Math.max(levels.get(edge.to), levels.get(id) + 1)); degrees.set(edge.to, degrees.get(edge.to) - 1); if (degrees.get(edge.to) === 0) queue.push(edge.to); }
  }
  if (processed !== diagram.nodes.length) diagram.nodes.forEach((n, i) => levels.set(n.id, i % 3));
  const columns = new Map(); for (const n of diagram.nodes) { const level = levels.get(n.id); if (!columns.has(level)) columns.set(level, []); columns.get(level).push(n); }
  const rows = Math.max(...[...columns.values()].map(c => c.length));
  const nodes = diagram.nodes.map(n => { const column = columns.get(levels.get(n.id)), row = column.findIndex(x => x.id === n.id); return { ...n, x: 25 + levels.get(n.id) * 230, y: 25 + ((rows - column.length) / 2 + row) * 115, width: 155, height: 76 }; });
  return { nodes, edges: diagram.edges, width: 50 + (Math.max(...levels.values()) + 1) * 230 - 75, height: 80 + rows * 115 - 39 };
}
export function diagramEdgePath(layout, edge) {
  const a = layout.nodes.find(n => n.id === edge.from), b = layout.nodes.find(n => n.id === edge.to);
  if (a.x >= b.x) { const bottom = layout.height - 10, x1 = a.x + a.width / 2, x2 = b.x + b.width / 2; return `M ${x1} ${a.y + a.height} C ${x1 + (a.id === b.id ? 40 : 0)} ${bottom},${x2 - (a.id === b.id ? 40 : 0)} ${bottom},${x2} ${b.y + b.height}`; }
  const x1 = a.x + a.width, y1 = a.y + a.height / 2, x2 = b.x, y2 = b.y + b.height / 2;
  return `M ${x1} ${y1} C ${x1 + 45} ${y1},${x2 - 45} ${y2},${x2} ${y2}`;
}
export function diagramSVG(source, prefix = 'diagram') {
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error('Invalid diagram export identifier.');
  const layout = diagramLayout(source), escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Flow diagram"><defs><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#446b50"/></marker></defs>${layout.edges.map(e => `<path d="${diagramEdgePath(layout, e)}" fill="none" stroke="#446b50" stroke-width="2" marker-end="url(#${prefix}-arrow)"/>`).join('')}${layout.nodes.map(n => `<g><title>${escape(n.label)}</title><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="9" fill="#e6eddf" stroke="#8aa282"/>${(n.label.match(/.{1,21}/gu) ?? []).slice(0, 3).map((line, i) => `<text x="${n.x + n.width / 2}" y="${n.y + 25 + i * 18}" text-anchor="middle" fill="#224f40" font-family="sans-serif" font-size="13">${escape(line)}</text>`).join('')}</g>`).join('')}</svg>`;
}
export function diagramText(source) {
  const d = validateDiagram(source), labels = new Map(d.nodes.map(n => [n.id, n.label.replace(/\s+/g, ' ')]));
  const connected = new Set(d.edges.flatMap(e => [e.from, e.to]));
  return [...d.edges.map(e => `[${labels.get(e.from)}] -> [${labels.get(e.to)}]`), ...d.nodes.filter(n => !connected.has(n.id)).map(n => `[${labels.get(n.id)}]`)].join('\n');
}
export function diagramMermaid(source) {
  const d = validateDiagram(source), ids = new Map(d.nodes.map((n, i) => [n.id, `n${i}`]));
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\s+/g, ' ');
  return ['flowchart LR', ...d.nodes.map(n => `  ${ids.get(n.id)}["${escape(n.label)}"]`), ...d.edges.map(e => `  ${ids.get(e.from)} --> ${ids.get(e.to)}`)].join('\n');
}
