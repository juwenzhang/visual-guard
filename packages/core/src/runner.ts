// biome-ignore-all lint/complexity/useLiteralKeys: launchOpts 是 Record 类型，TS 要求方括号访问
import {execSync} from 'node:child_process';
import type {
  BaselineBundle,
  BrowserEngineAdapter,
  DiffManifest,
  EngineContext,
  ScenarioResult,
  Summary,
  VisualGuardConfig
} from '@visual-guard/shared';
import {hash, logger} from '@visual-guard/shared';
import {createLocalBaselineStore} from './baseline-store';
import {captureScene} from './capture';
import {diffDom, diffLayout, diffNetwork, diffPerformance, diffPixel} from './diff';
import type {PluginEventBus} from './plugin-event-bus';
import {loadPlugins} from './plugin-loader';
import {resolveScenes} from './scene-resolver';
import {generateSemanticReport} from './semantic-diff';
import {HOOK_NAMES, type HookContext} from './types';

/**
 * 运行器选项
 */
export interface RunnerOptions {
  /** 已校验的配置 */
  config: VisualGuardConfig;
  /** 浏览器引擎适配器 */
  adapter: BrowserEngineAdapter;
  /** 并发数，默认使用配置中的 concurrency */
  concurrency?: number;
  /**
   * 是否更新基线。
   * - 首次运行（无现有基线）：忽略此参数，强制写入
   * - 后续运行：仅在 `writeBaseline: true` 时覆盖旧基线
   */
  writeBaseline?: boolean;
  /** plugin 事件总线（可选） */
  eventBus?: PluginEventBus;
}

/** 获取当前 Git 分支名 */
function getCurrentBranch(): string {
  // 1. 环境变量（CI 中常用）
  const envBranch =
    process.env['VG_BRANCH'] ??
    process.env['CI_COMMIT_BRANCH'] ??
    process.env['GITHUB_HEAD_REF'] ??
    process.env['GIT_BRANCH'] ??
    process.env['BRANCH_NAME'];
  if (envBranch) return envBranch;
  // 2. git CLI（通用 fallback）
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf-8'}).trim();
  } catch {}
  return 'unknown';
}

/** 构造基础 HookContext */
function baseCtx(
  config: VisualGuardConfig,
  runId: string,
  overrides?: Partial<HookContext>
): HookContext {
  return {
    runId,
    project: config.project,
    env: config.env,
    branch: getCurrentBranch(),
    config,
    ...overrides
  };
}

/** 基线模式下的性能占位 diff（无对比基线，仅标记当前值供报告展示） */
function _baselinePerformanceDiffs(captureResult: {
  snapshot: {performance?: {navigation: Record<string, number | undefined>}};
}) {
  const perf = captureResult.snapshot.performance;
  if (!perf) return {};

  const metrics = [
    {key: 'LCP', value: perf.navigation['largestContentfulPaint']},
    {key: 'FCP', value: perf.navigation['firstContentfulPaint']},
    {key: 'CLS', value: perf.navigation['cumulativeLayoutShift']},
    {key: 'TTFB', value: perf.navigation['timeToFirstByte']}
  ].filter(m => m.value !== undefined);

  return {
    performance: {
      regressions: [] as Array<{
        metric: string;
        baseline: number;
        current: number;
        change: number;
        changeRatio: number;
      }>,
      improvements: metrics.map(m => ({
        metric: m.key,
        baseline: m.value as number,
        current: m.value as number,
        change: 0,
        changeRatio: 0
      })),
      summary: {totalMetrics: metrics.length, regressed: 0, improved: 0, unchanged: metrics.length}
    }
  };
}

/**
 * 运行 Visual Guard 完整流水线
 *
 * 流程：
 * 1. 解析场景（viewport × scene）
 * 2. 启动浏览器引擎
 * 3. 对每个场景并发执行：采集 → 读取基线 → 对比 → 写基线
 * 4. 聚合结果为 DiffManifest
 *
 * @param options - 运行选项
 * @returns DiffManifest 统一输出
 */
export async function run(options: RunnerOptions): Promise<DiffManifest> {
  const {config, adapter, concurrency} = options;
  const startTime = new Date();
  const runId = `${Date.now()}-${hash(config.project).slice(0, 8)}`;

  // 加载 plugin（如果配置了 plugins 且未外部传入 eventBus）
  let eventBus = options.eventBus;
  let pluginTeardown: (() => void) | undefined;
  if (!eventBus && config.plugins && config.plugins.length > 0) {
    const result = await loadPlugins(config.plugins, config);
    eventBus = result.bus;
    pluginTeardown = result.teardown;
  }
  const baselineDir = config.baselineDir ?? '.visual-guard/baselines';
  const store = createLocalBaselineStore(baselineDir);

  logger.info(`启动 Visual Guard — 项目: ${config.project}, 环境: ${config.env}`);
  logger.info(`运行 ID: ${runId}`);

  await eventBus?.emit(HOOK_NAMES.BeforeRun, baseCtx(config, runId));

  // 解析场景
  const scenes = resolveScenes(config);
  logger.info(`共 ${scenes.length} 个场景待执行`);

  // 启动引擎
  logger.info(`启动浏览器引擎: ${adapter.name}`);
  const launchOpts = config.browser?.launchOptions as Record<string, unknown> | undefined;
  const userArgs = Array.isArray(launchOpts?.['args']) ? (launchOpts['args'] as string[]) : [];

  const runtime = await adapter.launch({
    headless: config.browser?.headless ?? true,
    timeout: config.timeout,
    args:
      adapter.name === 'playwright'
        ? [...new Set(['--no-sandbox', ...userArgs])] // 去重，--no-sandbox 保证不被覆盖
        : userArgs.length > 0
          ? userArgs
          : undefined,
    executablePath:
      typeof launchOpts?.['executablePath'] === 'string' ? launchOpts['executablePath'] : undefined
  });

  try {
    // 按视口分组创建 engine context
    const maxConcurrency =
      config.renderMode === 'ssr' ? 1 : (concurrency ?? config.concurrency ?? 4);
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(maxConcurrency);
    const scenarioResults: ScenarioResult[] = [];
    const viewportContexts = new Map<string, EngineContext>();

    const tasks = scenes.map(scene =>
      limit(async () => {
        const vpKey = `${scene.viewport.width}x${scene.viewport.height}`;
        let context = viewportContexts.get(vpKey);
        if (!context || config.renderMode === 'ssr') {
          context = await runtime.createContext({
            viewport: {
              width: scene.viewport.width,
              height: scene.viewport.height,
              deviceScaleFactor: scene.viewport.deviceScaleFactor,
              isMobile: scene.viewport.isMobile
            },
            locale: scene.viewport.locale,
            timezoneId: scene.viewport.timezoneId,
            renderMode: config.renderMode
          });
          viewportContexts.set(vpKey, context);
        }

        try {
          // 采集
          logger.info(`采集场景: ${scene.id} (${scene.viewport.name})`);

          const scenarioInfo = {
            id: scene.id,
            name: scene.scene.name,
            url: scene.url,
            viewport: {
              width: scene.viewport.width,
              height: scene.viewport.height,
              deviceScaleFactor: scene.viewport.deviceScaleFactor ?? 1
            }
          };

          await eventBus?.emit(
            HOOK_NAMES.BeforeCapture,
            baseCtx(config, runId, {
              scenario: scenarioInfo
            })
          );

          const captureResult = await captureScene(scene, context, {
            timeout: config.timeout ?? 30000,
            stabilize: config.stabilize
          });

          await eventBus?.emit(
            HOOK_NAMES.AfterCapture,
            baseCtx(config, runId, {
              scenario: scenarioInfo,
              snapshot: captureResult.snapshot,
              enginePage: captureResult.page
            })
          );

          // 插件 hook 执行完毕后关闭页面
          await captureResult.page.close();

          // 读取基线
          const key = {
            project: config.project,
            env: config.env,
            branch: getCurrentBranch(),
            sceneId: scene.id,
            viewport: scene.viewport.name,
            deviceScaleFactor: scene.viewport.deviceScaleFactor ?? 1,
            locale: scene.viewport.locale ?? 'en-US'
          };
          const baseline = await store.read(key);

          // 无基线：首次运行，仅建立基线，跳过对比
          const isFirstRun = !baseline;
          const shouldWrite = isFirstRun || (options.writeBaseline ?? false);

          // 写基线：首次运行强制写入，后续需 --write-baseline
          if (shouldWrite) {
            const newBundle: BaselineBundle = {
              meta: {
                key,
                createdAt: baseline?.meta.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: (baseline?.meta.version ?? 0) + 1,
                runId,
                size: {
                  dom: JSON.stringify(captureResult.snapshot.dom).length,
                  screenshots: (captureResult.snapshot.screenshots.fullPage ?? '').length,
                  network: captureResult.snapshot.network.length,
                  performance: captureResult.snapshot.performance ? 1 : 0
                }
              },
              dom: captureResult.snapshot.dom as unknown as Record<string, unknown>,
              screenshots: {
                fullPage: captureResult.snapshot.screenshots.fullPage
                  ? Buffer.from(captureResult.snapshot.screenshots.fullPage, 'base64')
                  : undefined,
                elements: Object.fromEntries(
                  Object.entries(captureResult.snapshot.screenshots.elements ?? {}).map(
                    ([k, v]) => [k, Buffer.from(v, 'base64')]
                  )
                )
              },
              network: captureResult.snapshot.network as unknown as Array<Record<string, unknown>>,
              performance: captureResult.snapshot.performance as unknown as
                | Record<string, unknown>
                | undefined
            };
            await store.write(key, newBundle);
          }

          if (shouldWrite) {
            // 首次运行或显式更新基线：写入后不再与旧基线对比
            const result: ScenarioResult = {
              id: scene.id,
              name: scene.scene.name,
              url: scene.url,
              status: 'baseline',
              durationMs: captureResult.durationMs,
              artifacts: {
                currentScreenshot: captureResult.snapshot.screenshots.fullPage
              },
              diffs: _baselinePerformanceDiffs(captureResult),
              errors: []
            };
            return result;
          }

          // 有基线：执行对比
          await eventBus?.emit(
            HOOK_NAMES.BeforeCompare,
            baseCtx(config, runId, {
              scenario: scenarioInfo,
              snapshot: captureResult.snapshot
            })
          );

          const pixelResult = await diffPixel(
            captureResult.snapshot.screenshots.fullPage,
            baseline.screenshots.fullPage,
            config.diff ?? {}
          );

          const domResult = await diffDom(captureResult.snapshot.dom, baseline.dom);

          const layoutResult = await diffLayout(
            captureResult.snapshot.dom,
            baseline.dom,
            config.diff ?? {}
          );

          const networkResult = await diffNetwork(
            captureResult.snapshot.network,
            (baseline.network ?? []) as unknown as typeof captureResult.snapshot.network
          );

          const performanceResult = await diffPerformance(
            captureResult.snapshot.performance,
            baseline.performance
          );

          // 判断状态
          const hasDiffs =
            (pixelResult?.diffPixels ?? 0) > 0 ||
            (domResult?.changeRatio ?? 0) > 0 ||
            (layoutResult?.changeCount ?? 0) > 0;
          const status = hasDiffs ? 'changed' : 'passed';

          // 基线截图（可能为 Buffer 或 JSON 反序列化的 {data: [...]} 对象）
          let baselineScreenshot: string | undefined;
          if (baseline.screenshots.fullPage) {
            const raw = baseline.screenshots.fullPage;
            const buf = Buffer.isBuffer(raw)
              ? raw
              : Buffer.from((raw as {data?: number[]}).data ?? []);
            baselineScreenshot = buf.toString('base64');
          }

          const result: ScenarioResult = {
            id: scene.id,
            name: scene.scene.name,
            url: scene.url,
            status,
            durationMs: captureResult.durationMs,
            artifacts: {
              baselineScreenshot,
              currentScreenshot: captureResult.snapshot.screenshots.fullPage,
              diffScreenshot: pixelResult?.diffImage
            },
            diffs: {
              pixel: pixelResult,
              dom: domResult,
              layout: layoutResult,
              network: networkResult,
              performance: performanceResult
            },
            errors: [],
            // 生成语义化差异报告（AI/人类可读）
            semantic: undefined
          };

          // diff 完成后生成语义化报告
          if (status !== 'passed') {
            result.semantic = generateSemanticReport(result);
          }

          await eventBus?.emit(
            HOOK_NAMES.AfterCompare,
            baseCtx(config, runId, {
              scenario: scenarioInfo,
              snapshot: captureResult.snapshot,
              scenarioResult: result
            })
          );

          return result;
        } catch (error) {
          logger.error(`场景 ${scene.id} 执行失败: ${String(error)}`);
          return {
            id: scene.id,
            name: scene.scene.name,
            url: scene.url,
            status: 'errored',
            durationMs: 0,
            artifacts: {},
            diffs: {},
            errors: [
              {
                message: String(error),
                scenarioId: scene.id,
                sceneName: scene.scene.name
              }
            ]
          } as ScenarioResult;
        }
      })
    );

    const results = await Promise.all(tasks);
    scenarioResults.push(...results);

    // 关闭 context
    for (const ctx of viewportContexts.values()) {
      await ctx.close();
    }

    // 聚合总结
    const summary: Summary = {
      total: scenarioResults.length,
      passed: scenarioResults.filter(r => r.status === 'passed').length,
      failed: scenarioResults.filter(r => r.status === 'failed').length,
      changed: scenarioResults.filter(r => r.status === 'changed').length,
      errored: scenarioResults.filter(r => r.status === 'errored').length,
      baseline: scenarioResults.filter(r => r.status === 'baseline').length,
      pixelDiffCount: scenarioResults.filter(
        r => r.diffs.pixel && (r.diffs.pixel.diffPixels ?? 0) > 0
      ).length,
      domDiffCount: scenarioResults.filter(r => r.diffs.dom && (r.diffs.dom.changeRatio ?? 0) > 0)
        .length,
      layoutDiffCount: scenarioResults.filter(
        r => r.diffs.layout && (r.diffs.layout.changeCount ?? 0) > 0
      ).length,
      networkDiffCount: scenarioResults.filter(
        r => r.diffs.network && r.diffs.network.added.length + r.diffs.network.removed.length > 0
      ).length,
      performanceRegressionCount: scenarioResults.filter(
        r => r.diffs.performance && (r.diffs.performance.regressions?.length ?? 0) > 0
      ).length
    };

    const manifest: DiffManifest = {
      version: '1.0.0',
      run: {
        id: runId,
        project: config.project,
        env: config.env,
        branch: getCurrentBranch(),
        startedAt: startTime.toISOString(),
        endedAt: new Date().toISOString()
      },
      summary,
      scenarios: scenarioResults
    };

    logger.info(
      `执行完成: ${summary.baseline > 0 ? `${summary.baseline} 基线建立, ` : ''}${summary.passed} 通过, ${summary.changed} 有变化, ${summary.failed} 失败, ${summary.errored} 错误`
    );

    await eventBus?.emit(HOOK_NAMES.AfterReport, baseCtx(config, runId, {manifest}));

    return manifest;
  } finally {
    await eventBus?.emit(HOOK_NAMES.AfterRun, baseCtx(config, runId));
    pluginTeardown?.();
    await runtime.close();
  }
}
