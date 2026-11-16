const groups = [
  ['JavaScript', 'javascript', 'js', 'jsx'], ['TypeScript', 'typescript', 'ts', 'tsx'],
  ['Python', 'python', 'py'], ['Shell', 'bash', 'sh', 'shell', 'zsh'],
  ['HTML', 'html'], ['CSS', 'css', 'scss'], ['JSON', 'json', 'jsonc'],
  ['SQL', 'sql'], ['Java', 'java'], ['Kotlin', 'kotlin', 'kt'], ['Go', 'go'],
  ['Rust', 'rust', 'rs'], ['C', 'c'], ['C++', 'cpp', 'c++'], ['C#', 'csharp', 'cs'],
  ['Ruby', 'ruby', 'rb'], ['PHP', 'php'], ['Swift', 'swift'], ['R', 'r'],
  ['YAML', 'yaml', 'yml'], ['TOML', 'toml'], ['XML', 'xml'], ['Text', 'text', 'plaintext', 'txt']
];
export const languages = groups.flatMap(([label, ...aliases]) => aliases.map(language => ({ language, label })));
export function codeFence(block) {
  let size = 3;
  for (const match of block.source.matchAll(/`+/g)) size = Math.max(size, match[0].length + 1);
  const marker = '`'.repeat(size);
  const rawStart = /(?:^|\s)startLine=(\d+)(?:\s|$)/.exec(block.meta)?.[1], start = Number(rawStart);
  const meta = `${Number.isSafeInteger(start) && start > 0 ? ` startLine=${start}` : ''}${/(?:^|\s)noLineNumbers(?:\s|$)/.test(block.meta) ? ' noLineNumbers' : ''}`;
  return `${marker}${block.language}${meta}\n${block.source}\n${marker}`;
}
function mount(container, block, ctx, label) {
  if (block.signal.aborted) return;
  const document = container.ownerDocument;
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const root = element('section'); root.className = 'lh-code-viewer'; root.setAttribute('aria-label', `${label} code`);
  const header = element('div'); header.className = 'lh-code-viewer-header';
  const title = element('span', label); title.className = 'lh-code-viewer-language'; header.append(title);
  const state = element('span', block.incomplete ? 'Generating…' : ''); state.className = 'lh-code-viewer-state'; header.append(state);
  const actions = element('div'); actions.className = 'lh-code-viewer-actions'; header.append(actions);
  const body = element('div'); body.className = 'lh-code-viewer-body'; body.tabIndex = 0; body.setAttribute('role', 'region'); body.setAttribute('aria-label', `${label} source`);
  const status = element('p'); status.className = 'lh-code-viewer-status'; status.setAttribute('role', 'status');
  root.append(header, body, status); container.append(root);
  const handles = []; let disposed = false, expanded = false, copying = false, fallback;
  const dispose = () => { if (disposed) return; disposed = true; block.signal.removeEventListener('abort', dispose); for (const handle of handles.reverse()) handle.dispose(); root.remove(); };
  block.signal.addEventListener('abort', dispose, { once: true });
  const control = (label, onClick) => { const slot = element('span'); actions.append(slot); const handle = ctx.ui.mountButton(slot, { label, size: 'sm', variant: 'ghost', onClick }, { signal: block.signal }); handles.push(handle); return handle; };
  try {
    // Default host-only Markdown reuses native highlighting and prevents this
    // renderer from recursively claiming its own nested code fence.
    handles.push(ctx.ui.mountMarkdown(body, { text: codeFence(block) }, { signal: block.signal }));
    const copy = control('Copy code', async () => {
      if (disposed || copying) return;
      copying = true; copy.update({ disabled: true });
      try {
        await document.defaultView.navigator.clipboard.writeText(block.source);
        if (!disposed) status.textContent = 'Code copied.';
      } catch {
        if (disposed) return;
        if (!fallback) { fallback = element('textarea'); fallback.className = 'lh-code-viewer-copy'; fallback.readOnly = true; fallback.setAttribute('aria-label', 'Code to copy'); fallback.value = block.source; root.append(fallback); }
        status.textContent = 'Press your copy shortcut to copy the selected code.'; fallback.focus(); fallback.select();
      } finally { copying = false; if (!disposed) copy.update({ disabled: false }); }
    });
    const expand = control('Expand code', () => {
      if (disposed) return;
      expanded = !expanded; root.classList.toggle('lh-code-viewer-expanded', expanded); expand.update({ label: expanded ? 'Show less' : 'Expand code' });
    });
  } catch (error) { dispose(); throw error; }
  return dispose;
}
export function activate(ctx) {
  const off = [];
  try {
    for (const { language, label } of languages) off.push(ctx.registerCodeBlock({ language, mount: (container, block) => mount(container, block, ctx, label) }));
  } catch (error) { for (const release of off.reverse()) release(); throw error; }
  return () => { for (const release of off.splice(0).reverse()) release(); };
}
