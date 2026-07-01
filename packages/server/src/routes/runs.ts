import type {FastifyInstance} from 'fastify';
import type {TrendStorageAdapter} from '../storage/adapter';

export async function runsRoutes(app: FastifyInstance, storage: TrendStorageAdapter) {
  // POST /api/runs — 入库
  app.post('/api/runs', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (!body['run'] || typeof body['run'] !== 'object') {
      return reply.status(400).send({error: 'Missing run object'});
    }
    const run = body['run'] as Record<string, string>;
    const summary = body['summary'] as Record<string, unknown> | undefined;
    const trends = body['trends'] as Record<string, unknown> | undefined;

    if (!run['id'] || !run['project']) {
      return reply.status(400).send({error: 'Missing run.id or run.project'});
    }

    await storage.ingest({
      id: run['id'],
      project: run['project'],
      env: run['env'] ?? 'development',
      branch: run['branch'] ?? 'unknown',
      startedAt: run['startedAt'] ?? new Date().toISOString(),
      endedAt: run['endedAt'] ?? new Date().toISOString(),
      summary: summary ?? {},
      trends: trends ?? {}
    });

    return reply.status(201).send({ok: true, runId: run['id']});
  });

  // GET /api/runs/:id — 单次运行详情
  app.get('/api/runs/:id', async (request, reply) => {
    const {id} = request.params as {id: string};
    const {project, env} = request.query as {project?: string; env?: string};

    if (!project) {
      return reply.status(400).send({error: 'Missing project query param'});
    }

    const runs = await storage.listRuns({project, env, limit: 200});
    const found = runs.find(r => r.id === id);
    if (!found) {
      return reply.status(404).send({error: 'Run not found'});
    }
    return reply.send(found);
  });

  // GET /api/runs/:id/manifest — 解压返回完整 manifest（含 diff 截图）
  app.get('/api/runs/:id/manifest', async (request, reply) => {
    const {id} = request.params as {id: string};
    // biome-ignore lint/suspicious/noExplicitAny: zlib 动态导入
    const zlib = (await import('node:zlib')) as any;

    const buf = await storage.getManifest(id);
    if (!buf) {
      return reply.status(404).send({error: 'Manifest not found for this run'});
    }

    try {
      const json = zlib.gunzipSync(buf).toString('utf-8');
      return reply.type('application/json').send(JSON.parse(json));
    } catch {
      return reply.status(500).send({error: 'Failed to decompress manifest'});
    }
  });
}
