import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {loadConfig} from '@visual-guard/config';
import chalk from 'chalk';
import {Command} from 'commander';

export function createServeCommand(): Command {
  const cmd = new Command('serve');

  cmd
    .description(
      '启动 HTTP server + Dashboard（读取 visualguard.config.json 中的 server/storage 配置）'
    )
    .option('-c, --config <path>', '配置文件路径')
    .option('-p, --port <port>', '覆盖 server.port')
    .option('--storage <dsn>', '覆盖 storage.dsn')
    .option('--api-key <key>', '覆盖 server.apiKey')
    .action(async (options: Record<string, string>) => {
      const config = await loadConfig(undefined, options['config']);
      const serverCfg = config.server ?? {};
      const storageCfg = config.storage ?? {};

      try {
        const rawDsn = options['storage'] || storageCfg.dsn || '.visual-guard/vg.db';
        const dsn = rawDsn.startsWith('sqlite://') ? rawDsn : `sqlite://${rawDsn}`;
        const dbPath = dsn.slice('sqlite://'.length);
        // 确保 SQLite 文件父目录存在
        await mkdir(dirname(dbPath), {recursive: true});

        const {createServer} = await import('@visual-guard/server');
        const server = await createServer({
          port: Number(options['port']) || serverCfg.port || 3456,
          storage: dsn,
          apiKey: options['apiKey'] || serverCfg.apiKey
        });

        // eslint-disable-next-line no-console
        console.log(chalk.cyan('🔍 Visual Guard Server 启动中...'));
        await server.start();

        // Graceful shutdown
        const shutdown = async () => {
          // eslint-disable-next-line no-console
          console.log(chalk.gray('\n正在关闭服务...'));
          await server.stop();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (error) {
        const err = error as Error;
        if (err.message?.includes('Cannot find module')) {
          // eslint-disable-next-line no-console
          console.log(chalk.red('未安装 @visual-guard/server，请执行:'));
          // eslint-disable-next-line no-console
          console.log(chalk.white('  pnpm add @visual-guard/server'));
        } else {
          // eslint-disable-next-line no-console
          console.log(chalk.red(`server 启动失败: ${err.message ?? String(error)}`));
        }
        process.exit(2);
      }
    });

  return cmd;
}
