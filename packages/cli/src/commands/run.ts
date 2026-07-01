// biome-ignore-all lint/complexity/useLiteralKeys: commander options 使用 Record 索引签名，TS4111 要求方括号访问
import {loadConfig} from '@visual-guard/config';
import {run} from '@visual-guard/core';
import {
  generateConsoleReport,
  generateHtmlReport,
  generateJsonReport,
  generateReportsIndex
} from '@visual-guard/reporters';
import type {BrowserEngineAdapter, VisualGuardConfig} from '@visual-guard/shared';
import {logger} from '@visual-guard/shared';
import chalk from 'chalk';
import {Command} from 'commander';

export function createRunCommand(): Command {
  const cmd = new Command('run');

  cmd
    .description('执行视觉回归检测')
    .option('-c, --config <path>', '配置文件路径')
    .option('--engine <engine>', '浏览器引擎 (playwright | puppeteer)，需安装对应包')
    .option('--scenes <scenes>', '仅执行指定场景，逗号分隔')
    .option('--tags <tags>', '按标签筛选场景，逗号分隔')
    .option('--env <env>', '环境名称')
    .option('--write-baseline', '更新基线，后续运行以此为对比基准')
    .option(
      '--format <format>',
      '报告格式 (html,json,console)，逗号分隔。不指定时使用 config.reporters'
    )
    .action(async (options: Record<string, string | boolean | undefined>) => {
      logger.info(chalk.cyan('Visual Guard — 视觉回归检测'));

      const configPath = typeof options['config'] === 'string' ? options['config'] : undefined;
      const config = await loadConfig(undefined, configPath);

      // CLI 参数覆盖
      if (typeof options['engine'] === 'string') {
        config.browser = config.browser ?? {engine: 'playwright'};
        const eng = options['engine'];
        if (eng === 'playwright' || eng === 'puppeteer') {
          config.browser.engine = eng;
        }
      }
      if (typeof options['env'] === 'string') {
        config.env = options['env'];
      }

      // 动态加载引擎适配器
      const engineName = config.browser?.engine ?? 'playwright';
      let adapter: Awaited<ReturnType<typeof _loadAdapter>>;
      try {
        adapter = await _loadAdapter(engineName);
      } catch {
        // _loadAdapter 已通过 logger 输出具体原因，此处直接退出
        process.exit(2);
      }

      // 执行
      const writeBaseline = options['writeBaseline'] === true || options['write-baseline'] === true;
      let manifest: Awaited<ReturnType<typeof run>>;

      try {
        manifest = await run({
          config,
          adapter,
          concurrency: config.concurrency,
          writeBaseline
        });
      } catch {
        // 引擎层/runner 已通过 logger 输出具体原因，此处直接退出
        process.exit(2);
      }

      // 生成报告（先 JSON/HTML，再控制台，确保控制台能列出文件路径）
      const formats = _resolveFormats(
        options['format'] as string | undefined,
        config.reporters ?? ['console']
      );
      const outputDir = config.outputDir ?? '.visual-guard/reports';
      const reportFiles: string[] = [];

      for (const fmt of formats) {
        if (fmt === 'json') {
          const filePaths = await generateJsonReport(manifest, outputDir, manifest.run.id);
          reportFiles.push(...filePaths);
        }
        if (fmt === 'html') {
          const filePath = await generateHtmlReport(manifest, outputDir, manifest.run.id);
          reportFiles.push(filePath);
        }
      }

      // 更新运行历史索引
      await generateReportsIndex(outputDir).catch(() => {
        // 索引生成失败不阻断主流程
      });

      // 自动入库趋势数据
      await _autoIngest(manifest.run.id, config).catch(() => {
        // 入库失败不阻断主流程
      });

      if (formats.includes('console')) {
        const output = generateConsoleReport(manifest, reportFiles);
        process.stdout.write(output);
      }

      // 退出码
      const {summary} = manifest;
      if (summary.errored > 0) {
        process.exit(2);
      }
      if (summary.changed > 0 || summary.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    });

  return cmd;
}

const ENGINE_PACKAGES = {
  playwright: '@visual-guard/engine-playwright',
  puppeteer: '@visual-guard/engine-puppeteer'
} as const;

type EngineName = keyof typeof ENGINE_PACKAGES;

async function _tryLoadEngine(name: EngineName) {
  const pkg = ENGINE_PACKAGES[name];
  try {
    return await import(pkg);
  } catch {
    return null;
  }
}

async function _loadAdapter(engine: string) {
  const name = (
    engine === 'playwright' || engine === 'puppeteer' ? engine : null
  ) as EngineName | null;

  if (!name) {
    logger.error(`不支持的引擎: ${engine}（可选: ${Object.keys(ENGINE_PACKAGES).join(' | ')}）`);
    process.exit(2);
  }

  const mod = await _tryLoadEngine(name);

  if (!mod) {
    const pkg = ENGINE_PACKAGES[name];
    logger.error(`引擎 ${chalk.bold(pkg)} 未安装，请执行:`);
    logger.error(`  pnpm add ${pkg}`);
    process.exit(2);
  }

  if (name === 'playwright') {
    return (mod as {createPlaywrightAdapter: () => BrowserEngineAdapter}).createPlaywrightAdapter();
  }
  return (mod as {createPuppeteerAdapter: () => BrowserEngineAdapter}).createPuppeteerAdapter();
}

type ReporterFormat = 'console' | 'json' | 'html' | 'pdf';

const VALID_REPORTER_FORMATS = new Set<string>(['console', 'json', 'html', 'pdf']);

/**
 * 解析报告格式：--format 参数优先，否则使用 config.reporters 配置
 */
function _resolveFormats(
  cliFormat: string | undefined,
  configReporters: string[]
): ReporterFormat[] {
  const raw = cliFormat ?? configReporters.join(',');
  const parts = raw.split(',').map(s => s.trim().toLowerCase());
  return parts.filter((f): f is ReporterFormat => VALID_REPORTER_FORMATS.has(f));
}

/**
 * 自动入库：将本次运行的 summary.json + manifest.json 压入本地 SQLite
 */
async function _autoIngest(runId: string, config: VisualGuardConfig): Promise<void> {
  const storageCfg = config.storage;
  if (!storageCfg?.dsn) return; // 未配置存储则跳过

  const dsn = storageCfg.dsn;
  if (!dsn.startsWith('sqlite://')) return; // 仅本地 SQLite 自动入库，远程走 storage ingest 手动触发

  try {
    const {readFile} = await import('node:fs/promises');
    const {join} = await import('node:path');
    const {gzipSync} = await import('node:zlib');
    const {SQLiteAdapter} = await import('@visual-guard/server');

    const outputDir = config.outputDir ?? '.visual-guard/reports';
    const runDir = join(outputDir, runId);
    const summaryPath = join(runDir, 'summary.json');
    const manifestPath = join(runDir, 'manifest.json');

    const summaryRaw = await readFile(summaryPath, 'utf-8');
    const data = JSON.parse(summaryRaw) as Record<string, unknown>;
    const run = data['run'] as Record<string, string>;

    let manifestBuf: Buffer | undefined;
    try {
      manifestBuf = gzipSync(await readFile(manifestPath, 'utf-8'));
    } catch {
      /* ok */
    }

    const dbPath = dsn.slice('sqlite://'.length);
    const {mkdir} = await import('node:fs/promises');
    const {dirname} = await import('node:path');
    await mkdir(dirname(dbPath), {recursive: true});

    const adapter = new SQLiteAdapter(dbPath);
    await adapter.ingest({
      id: run['id'] ?? runId,
      project: run['project'] ?? config.project,
      env: run['env'] ?? config.env,
      branch: run['branch'] ?? 'unknown',
      startedAt: run['startedAt'] ?? new Date().toISOString(),
      endedAt: run['endedAt'] ?? new Date().toISOString(),
      summary: (data['summary'] as Record<string, unknown>) ?? {},
      trends: (data['trends'] as Record<string, unknown>) ?? {},
      manifest: manifestBuf
    });
    await adapter.close();
    logger.info('📊 趋势数据已自动入库');
  } catch {
    // 入库失败不影响主流程
  }
}
