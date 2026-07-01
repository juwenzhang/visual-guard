import Fastify from 'fastify';
import {authPlugin} from './routes/auth';
import {dashRoute} from './routes/dash';
import {runsRoutes} from './routes/runs';
import {trendsRoutes} from './routes/trends';
import type {TrendStorageAdapter} from './storage/adapter';
import {SQLiteAdapter} from './storage/sqlite';

export interface ServerOptions {
  port?: number;
  host?: string;
  /** 存储连接字符串，支持 sqlite://path 或 postgres://... */
  storage?: string;
  /** API key，空字符串表示无鉴权（本地模式） */
  apiKey?: string;
}

/**
 * 创建 Visual Guard HTTP Server
 */
export async function createServer(opts: ServerOptions = {}): Promise<{
  app: ReturnType<typeof Fastify>;
  storage: TrendStorageAdapter;
  start(): Promise<void>;
  stop(): Promise<void>;
}> {
  const app = Fastify({logger: true});
  const storage = createStorage(opts.storage);

  // 健康检查
  app.get('/health', async () => ({status: 'ok'}));

  // 鉴权
  await app.register(authPlugin(opts.apiKey));

  // Dashboard
  await app.register(dashRoute);

  // API 路由
  await app.register(async scope => {
    await runsRoutes(scope, storage);
    await trendsRoutes(scope, storage);
  });

  return {
    app,
    storage,
    async start() {
      await app.listen({port: opts.port ?? 3456, host: opts.host ?? '0.0.0.0'});
      // eslint-disable-next-line no-console
      console.log(`\n🔍 Visual Guard Server — http://localhost:${opts.port ?? 3456}`);
      // eslint-disable-next-line no-console
      console.log(`📊 Dashboard  — http://localhost:${opts.port ?? 3456}/dash`);
    },
    async stop() {
      await app.close();
      await storage.close();
    }
  };
}

function createStorage(dsn?: string): TrendStorageAdapter {
  const uri = dsn ?? process.env['VG_STORAGE'] ?? 'sqlite://.visual-guard/vg.db';

  if (uri.startsWith('sqlite://')) {
    const dbPath = uri.slice('sqlite://'.length);
    return new SQLiteAdapter(dbPath);
  }

  throw new Error(`不支持的存储引擎: ${uri}。当前支持: sqlite://<path>。PostgreSQL 后续支持。`);
}
