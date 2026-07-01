import type {FastifyInstance, FastifyRequest} from 'fastify';

/**
 * API key 鉴权中间件
 *
 * 检查 Authorization: Bearer <key> 头。
 * 未配置 apiKey 时跳过鉴权（本地开发模式）。
 */
export function authPlugin(apiKey?: string) {
  return async (app: FastifyInstance) => {
    if (!apiKey) return; // 无 key 时跳过

    app.addHook('onRequest', async (request, reply) => {
      // 健康检查和 Dashboard 跳过鉴权
      if (request.url === '/health' || request.url === '/dash') return;

      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== apiKey) {
        return reply.status(401).send({error: 'Invalid API key'});
      }
    });
  };
}
