import {createRequire} from 'node:module';
import {join} from 'node:path';
import type {PluginConfig, VisualGuardConfig} from '@visual-guard/shared';
import {logger} from '@visual-guard/shared';
import {PluginEventBus} from './plugin-event-bus';
import type {PluginAPI, VisualGuardPlugin} from './types';

const PLUGIN_PACKAGE_MAP: Record<string, string> = {
  ai: '@visual-guard/plugin-ai',
  perf: '@visual-guard/plugin-perf',
  notify: '@visual-guard/plugin-notify',
  archive: '@visual-guard/plugin-archive'
};

/**
 * 从使用方工程路径解析 plugin 包，而非从 core 包的 node_modules。
 * pnpm workspace 中 core 不一定依赖 plugin 包，所以动态 import 必须以使用方 CWD 为基准。
 */
function resolvePluginPath(pkgName: string): string {
  const requireFromProject = createRequire(join(process.cwd(), 'package.json'));
  return requireFromProject.resolve(pkgName);
}

/**
 * 加载并初始化所有配置的 plugin。
 * 返回 bus 供 runner 调用 emit，teardown 在 finally 中清理。
 */
export async function loadPlugins(
  pluginConfigs: PluginConfig[],
  config: VisualGuardConfig
): Promise<{bus: PluginEventBus; teardown: () => void}> {
  const bus = new PluginEventBus();

  for (const cfg of pluginConfigs) {
    const pkgName = PLUGIN_PACKAGE_MAP[cfg.name];
    if (!pkgName) {
      logger.warn(`未知 plugin: ${cfg.name}，已跳过`);
      continue;
    }

    try {
      const resolvedPath = resolvePluginPath(pkgName);
      const mod = await import(resolvedPath);
      const raw = (mod as {default?: unknown}).default ?? mod;

      // plugin 可以是工厂函数（返回 VisualGuardPlugin）或直接是 VisualGuardPlugin 实例
      const plugin: VisualGuardPlugin =
        typeof raw === 'function'
          ? await (raw as () => VisualGuardPlugin)()
          : (raw as VisualGuardPlugin);

      // 构造 PluginAPI
      const api: PluginAPI = {
        on: (name, handler) => bus.on(name, handler),
        off: (name, handler) => bus.off(name, handler),
        emit: (name, context) => bus.emit(name, context),
        getConfig: () => cfg.options ?? {},
        getLogger: () => logger
      };

      await plugin.setup(api);
      logger.info(`Plugin "${cfg.name}" 已加载`);
    } catch (_error: unknown) {
      const error = _error as Error;
      logger.warn(`Plugin "${cfg.name}" 加载失败: ${error?.message ?? String(_error)}`);
    }
  }

  return {
    bus,
    teardown: () => bus.clear()
  };
}
