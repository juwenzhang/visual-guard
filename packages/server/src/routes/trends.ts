import type {FastifyInstance} from 'fastify';
import type {TrendStorageAdapter} from '../storage/adapter';

export async function trendsRoutes(app: FastifyInstance, storage: TrendStorageAdapter) {
  // GET /api/trends — 查询趋势
  app.get('/api/trends', async (request, reply) => {
    const {project, env, branch, metric, days} = request.query as {
      project?: string;
      env?: string;
      branch?: string;
      metric?: string;
      days?: string;
    };

    if (!project || !metric) {
      return reply.status(400).send({error: 'Missing project or metric'});
    }

    const points = await storage.query({
      project,
      env,
      branch,
      metric,
      days: Number(days) || 30
    });

    return reply.send({metric, points});
  });

  // GET /api/runs — 历史列表
  app.get('/api/runs', async (request, reply) => {
    const {project, env, limit} = request.query as {
      project?: string;
      env?: string;
      limit?: string;
    };

    if (!project) {
      return reply.status(400).send({error: 'Missing project'});
    }

    const runs = await storage.listRuns({project, env, limit: Number(limit) || 30});
    return reply.send(runs);
  });
}
