import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {FastifyInstance} from 'fastify';

let _htmlCache: string | undefined;

/**
 * Dashboard 路由 — 托管 Preact + Chart.js 单页
 */
export async function dashRoute(app: FastifyInstance) {
  app.get('/dash', async (_request, reply) => {
    if (!_htmlCache) {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      // In dev: src/routes  /  prod: dist/routes
      const srcPath = join(__dirname, '../../src/dash.html');
      const distPath = join(__dirname, 'dash.html');
      try {
        _htmlCache = await readFile(srcPath, 'utf-8');
      } catch {
        _htmlCache = await readFile(distPath, 'utf-8');
      }
    }
    return reply.type('text/html').send(_htmlCache);
  });
}
