import fs, {mkdir} from 'node:fs/promises';
import path, {dirname} from 'node:path';
import {loadConfig} from '@visual-guard/config';
import {logger} from '@visual-guard/shared';
import chalk from 'chalk';
import {Command} from 'commander';

export function createStorageCommand(): Command {
  const cmd = new Command('storage');

  cmd.description('管理趋势存储数据');

  // storage ingest <reportDir>
  cmd
    .command('ingest [reportDir]')
    .description('将 summary.json 入库（不传路径则自动取最新一次运行）')
    .option('-c, --config <path>', '配置文件路径')
    .option('--server <url>', '远程 server 地址（覆盖配置）')
    .option('--api-key <key>', 'API key')
    .action(async (reportDir: string | undefined, options: Record<string, string>) => {
      const config = await loadConfig(undefined, options['config']);
      const outputDir = config.outputDir ?? '.visual-guard/reports';
      const storageCfg = config.storage ?? {};

      // 未指定目录时，自动取最新一次运行
      let targetDir = reportDir;
      if (!targetDir) {
        try {
          const entries = await fs.readdir(outputDir, {withFileTypes: true});
          const runs = entries
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .map(e => e.name)
            .sort()
            .reverse();
          if (runs.length === 0) {
            logger.error(`未找到运行记录: ${outputDir}`);
            process.exit(2);
          }
          targetDir = path.join(outputDir, runs[0]!);
          logger.info(`自动选择最新运行: ${runs[0]}`);
        } catch {
          logger.error(`无法读取输出目录: ${outputDir}`);
          process.exit(2);
        }
      }

      const summaryPath = path.join(targetDir!, 'summary.json');

      let payload: string;
      try {
        payload = await fs.readFile(summaryPath, 'utf-8');
      } catch {
        logger.error(`未找到 ${summaryPath}`);
        process.exit(2);
      }

      const serverUrl = options['server'];
      if (serverUrl) {
        const apiKey = options['apiKey'];
        const headers: Record<string, string> = {'Content-Type': 'application/json'};
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        try {
          const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/runs`, {
            method: 'POST',
            headers,
            body: payload
          });
          if (!res.ok) {
            const body = await res.text();
            logger.error(`入库失败 (${res.status}): ${body}`);
            process.exit(2);
          }
          logger.info(chalk.green(`✅ 已入库到 ${serverUrl}`));
        } catch {
          logger.error(`无法连接到 ${serverUrl}`);
          process.exit(2);
        }
      } else {
        // 本地模式 — 使用 config.storage.dsn，同时压缩 manifest 入库
        try {
          const {SQLiteAdapter} = await import('@visual-guard/server');
          const {gzipSync} = await import('node:zlib');
          const data = JSON.parse(payload) as Record<string, unknown>;
          const run = data['run'] as Record<string, string>;
          const summary = data['summary'] as Record<string, unknown>;
          const trends = data['trends'] as Record<string, unknown>;

          // 读取并压缩 manifest.json
          const manifestPath = path.join(targetDir!, 'manifest.json');
          let manifestBuf: Buffer | undefined;
          try {
            const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
            manifestBuf = gzipSync(manifestRaw);
          } catch {
            /* manifest 不存在则跳过 */
          }

          const dsn = storageCfg.dsn ?? 'sqlite://.visual-guard/vg.db';
          const dbPath = dsn.startsWith('sqlite://')
            ? dsn.slice('sqlite://'.length)
            : '.visual-guard/vg.db';
          await mkdir(dirname(dbPath), {recursive: true});
          const adapter = new SQLiteAdapter(dbPath);
          await adapter.ingest({
            id: run['id'] ?? 'unknown',
            project: run['project'] ?? 'unknown',
            env: run['env'] ?? 'development',
            branch: run['branch'] ?? 'unknown',
            startedAt: run['startedAt'] ?? new Date().toISOString(),
            endedAt: run['endedAt'] ?? new Date().toISOString(),
            summary: summary ?? {},
            trends: trends ?? {},
            manifest: manifestBuf
          });
          const sizeStr = manifestBuf
            ? `(manifest ${(manifestBuf.length / 1024).toFixed(1)}KB gzip)`
            : '';
          await adapter.close();
          logger.info(chalk.green(`✅ 已写入 ${dbPath} ${sizeStr}`));
        } catch (error) {
          const err = error as Error;
          if (err.message?.includes('Cannot find module')) {
            logger.error('未安装 @visual-guard/server，请执行: pnpm add @visual-guard/server');
          } else {
            logger.error(`入库失败: ${err.message ?? String(error)}`);
          }
          process.exit(2);
        }
      }
    });

  // storage purge
  cmd
    .command('purge')
    .description('清理过期数据（使用 config.storage.dsn）')
    .option('-c, --config <path>', '配置文件路径')
    .option('--before <date>', '清理此日期之前的数据 (YYYY-MM-DD)')
    .action(async (options: Record<string, string>) => {
      try {
        const config = await loadConfig(undefined, options['config']);
        const storageCfg = config.storage ?? {};
        const dsn = storageCfg.dsn ?? 'sqlite://.visual-guard/vg.db';
        const dbPath = dsn.startsWith('sqlite://')
          ? dsn.slice('sqlite://'.length)
          : '.visual-guard/vg.db';

        const {SQLiteAdapter} = await import('@visual-guard/server');
        const adapter = new SQLiteAdapter(dbPath);
        const before = options['before']
          ? new Date(options['before'])
          : new Date(Date.now() - 90 * 86400000);
        const deleted = await adapter.purge(before);
        await adapter.close();
        logger.info(chalk.green(`✅ 清理了 ${deleted} 条记录 (${before.toISOString()} 之前)`));
      } catch (error) {
        const err = error as Error;
        if (err.message?.includes('Cannot find module')) {
          logger.error('未安装 @visual-guard/server');
        } else {
          logger.error(`清理失败: ${err.message ?? String(error)}`);
        }
        process.exit(2);
      }
    });

  return cmd;
}
