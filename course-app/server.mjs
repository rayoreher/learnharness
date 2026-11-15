import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApplication } from './application.mjs';
import { handleCourseRequest } from './http.mjs';

export async function startServer({ port = Number(process.env.LH_COURSE_PORT || 3030), directory, codex } = {}) {
  const app = await createApplication({ directory, codex });
  const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/course-studio');
  const files = new Map([['/', ['index.html', 'text/html']], ['/courses', ['index.html', 'text/html']], ['/course-studio/index.html', ['index.html', 'text/html']], ['/course-studio/app.js', ['app.js', 'text/javascript']], ['/course-studio/plugin-registry.js', ['plugin-registry.js', 'text/javascript']], ['/course-studio/lesson-outputs.js', ['lesson-outputs.js', 'text/javascript']], ['/course-studio/style.css', ['style.css', 'text/css']]]);
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      const url = new URL(req.url, `http://${host}`);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) { res.writeHead(403); res.end('Local connections only.'); return; }
      const common = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'" };
      if (url.pathname.startsWith('/api/course-studio/')) {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 65536) { res.writeHead(413, common); res.end('Request is too large.'); return; } chunks.push(chunk); }
        const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks), duplex: 'half' } : {}) });
        const response = await handleCourseRequest(request, app);
        res.writeHead(response.status, { ...common, ...Object.fromEntries(response.headers) }); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      const asset = files.get(url.pathname);
      if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404, common); res.end('Not found.'); return; }
      const data = await readFile(path.join(assets, asset[0]));
      res.writeHead(200, { ...common, 'Content-Type': `${asset[1]}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch { if (!res.headersSent) res.writeHead(500); res.end('The request could not be completed.'); }
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { await app.close(); throw error; }
  return { server, app, url: `http://127.0.0.1:${server.address().port}`, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await app.close(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer();
  console.log(`LearnHarness Course Studio: ${running.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await running.close(); process.exit(0); });
}
