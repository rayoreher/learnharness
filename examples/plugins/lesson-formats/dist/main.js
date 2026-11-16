const element = (document, tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
export function activate(ctx) {
  const off = [];
  off.push(ctx.registerQuestionRenderer({ id: 'numeric', supportedContractVersions: [1],
    mountAnswerEditor(container, props) {
      const document = container.ownerDocument, root = element(document, 'label', 'Your number'), input = element(document, 'input'); input.inputMode = 'decimal'; input.maxLength = 200;
      let active = props.active, answer = props.answer.status === 'empty' ? { value: '', known: true, assisted: false } : structuredClone(props.answer.value);
      input.value = answer.value; input.disabled = !active; root.append(input); container.append(root);
      const publish = () => { if (!props.signal.aborted && active) props.onChange({ status: !answer.known || (answer.value.trim() && Number.isFinite(Number(answer.value))) ? 'ready' : 'unready', value: structuredClone(answer) }); };
      input.oninput = () => { answer = { value: input.value, known: true, assisted: false }; publish(); };
      const button = ctx.ui.mountButton(root, { label: 'I don’t know', size: 'sm', variant: 'outline', disabled: !active, onClick() { if (active) { answer = { value: '', known: false, assisted: false }; publish(); } } }, { signal: props.signal }); publish();
      return { update(next) { active = next.active; if (next.answer.status !== 'empty') answer = structuredClone(next.answer.value); input.value = answer.value; input.disabled = !active; button.update({ disabled: !active }); }, focus() { input.focus(); }, dispose() { button.dispose(); root.remove(); } };
    },
    mountAnswered(container, props) { const h = ctx.ui.mountMarkdown(container, { text: `Your answer: ${props.answer.known ? props.answer.value : 'I don’t know'}\n\n**Reference**\n\n${props.input.payload.reference}\n\n${props.input.payload.explanation}` }, { signal: props.signal }); return () => h.dispose(); }
  }));
  off.push(ctx.registerCodeBlock({ language: 'lesson-deck', mount(container, block) {
    const document = container.ownerDocument, body = element(document, 'section'), page = element(document, 'div'), count = element(document, 'p'); body.append(page, count); container.append(body);
    // A separator inside a fenced diagram/code block belongs to that block.
    let marker = null, lines = []; const pages = [];
    for (const line of block.source.split('\n')) {
      const match = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
      if (match) { if (!marker) marker = match[1]; else if (match[1][0] === marker[0] && match[1].length >= marker.length && !match[2].trim()) marker = null; }
      if (!marker && line.trim() === '---') { pages.push(lines.join('\n')); lines = []; } else lines.push(line);
    }
    pages.push(lines.join('\n')); let index = 0;
    const content = ctx.ui.mountMarkdown(page, { text: pages[0], allowPluginFences: true }, { signal: block.signal });
    const draw = () => { content.update({ text: pages[index] }); count.textContent = `${index + 1} / ${pages.length}`; previous.update({ disabled: index === 0 }); next.update({ disabled: index === pages.length - 1 }); };
    const previous = ctx.ui.mountButton(body, { label: 'Previous slide', size: 'sm', variant: 'outline', onClick() { if (index > 0) { index--; draw(); } } }, { signal: block.signal });
    const next = ctx.ui.mountButton(body, { label: 'Next slide', size: 'sm', variant: 'outline', onClick() { if (index < pages.length - 1) { index++; draw(); } } }, { signal: block.signal }); draw();
    return () => { content.dispose(); previous.dispose(); next.dispose(); body.remove(); };
  } }));
  off.push(ctx.registerCodeBlock({ language: 'lesson-flow', mount(container, block) {
    const data = JSON.parse(block.source);
    if (!Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 12 || !Array.isArray(data.edges) || data.edges.length > 24) throw new Error('Use 1–12 nodes and at most 24 edges.');
    const document = container.ownerDocument, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), positions = new Map();
    const make = (tag, attrs, parent = svg) => { const item = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value)); parent.append(item); return item; };
    const markerId = 'lesson-arrow-' + crypto.randomUUID(); svg.setAttribute('viewBox', `0 0 520 ${data.nodes.length * 90 + 20}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Lesson flow diagram');
    const defs = make('defs', {}), marker = make('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs); make('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor' }, marker);
    data.nodes.forEach((node, index) => { if (!node || typeof node.id !== 'string' || positions.has(node.id) || typeof node.label !== 'string' || node.label.length > 60) throw new Error('Use unique node IDs and short text labels.'); positions.set(node.id, index); });
    for (const edge of data.edges) {
      if (!Array.isArray(edge) || edge.length !== 2 || !positions.has(edge[0]) || !positions.has(edge[1])) throw new Error('Every arrow must reference two known nodes.');
      const from = positions.get(edge[0]), to = positions.get(edge[1]), y1 = from * 90 + 65, y2 = to * 90 + 20;
      make('path', { d: to === from + 1 ? `M 250 ${y1} L 250 ${y2}` : `M 400 ${y1 - 22} C 510 ${y1 - 22} 510 ${y2 + 22} 400 ${y2 + 22}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'marker-end': `url(#${markerId})` });
    }
    data.nodes.forEach((node, index) => { make('rect', { x: 100, y: index * 90 + 20, width: 300, height: 45, rx: 8, fill: 'var(--background, white)', stroke: 'currentColor' }); const label = make('text', { x: 250, y: index * 90 + 48, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 14 }); label.textContent = node.label; });
    container.append(svg); return () => svg.remove();
  } }));
  return () => { for (const dispose of off.reverse()) dispose(); };
}
