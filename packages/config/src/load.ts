import type {VisualGuardConfig} from '@visual-guard/shared';
import {cosmiconfig} from 'cosmiconfig';
import {DEFAULT_CONFIG} from './defaults';
import {applyEnvOverrides} from './env-override';
import {validateConfig} from './validate';

/**
 * 深度合并两个对象（仅合并第一层对象的属性，嵌套对象直接替换）
 *
 * 使用场景：将用户配置与默认配置合并
 * 注意：嵌套对象（如 browser、diff）是直接替换，不是深度合并
 */
export function shallowMerge<T extends Record<string, unknown>>(defaults: T, user: Partial<T>): T {
  const result = {...defaults} as T;
  for (const key of Object.keys(user) as (keyof T)[]) {
    if (user[key] !== undefined) {
      result[key] = user[key] as T[keyof T];
    }
  }
  return result;
}

/**
 * 加载并校验 Visual Guard 配置
 *
 * 加载顺序：
 * 1. 使用 cosmiconfig 搜索配置文件
 * 2. 深度合并默认配置
 * 3. 应用环境变量覆盖
 * 4. 校验最终配置
 *
 * @param searchFrom - 搜索配置文件的起始目录，默认当前工作目录
 * @param explicitPath - 显式指定配置文件路径（跳过搜索）
 * @returns 校验通过的完整配置
 *
 * @example
 * ```ts
 * import { loadConfig } from '@visual-guard/config';
 *
 * // 从当前目录开始搜索配置文件
 * const config = await loadConfig();
 *
 * // 从指定目录搜索
 * const config = await loadConfig('/path/to/project');
 *
 * // 直接加载指定配置文件
 * const config = await loadConfig(undefined, '/path/to/.visualguardrc.json');
 * ```
 */
export async function loadConfig(
  searchFrom?: string,
  explicitPath?: string
): Promise<VisualGuardConfig> {
  const explorer = cosmiconfig('visualguard', {
    searchPlaces: [
      '.visualguardrc',
      '.visualguardrc.json',
      '.visualguardrc.yaml',
      '.visualguardrc.yml',
      '.visualguardrc.js',
      '.visualguardrc.cjs',
      '.visualguardrc.mjs',
      'visualguard.config.js',
      'visualguard.config.cjs',
      'visualguard.config.mjs',
      'visualguard.config.json',
      'package.json'
    ]
  });

  let searchResult: Awaited<ReturnType<typeof explorer.search>> | null = null;

  if (explicitPath) {
    searchResult = await explorer.load(explicitPath);
  } else {
    searchResult = await explorer.search(searchFrom ?? process.cwd());
  }

  if (!searchResult || searchResult.isEmpty) {
    throw new Error(
      '未找到 Visual Guard 配置文件。\n' +
        '请在项目根目录创建以下任一配置文件：\n' +
        '  - .visualguardrc.json\n' +
        '  - .visualguardrc.js\n' +
        '  - visualguard.config.js\n' +
        '  - package.json (增加 visualguard 字段)\n'
    );
  }

  const userConfig = searchResult.config as Partial<VisualGuardConfig>;

  // 合并默认值
  const merged = shallowMerge(DEFAULT_CONFIG, userConfig) as VisualGuardConfig;

  // 应用环境变量覆盖
  const withEnv = applyEnvOverrides(merged);

  // 校验
  const validation = validateConfig(withEnv);
  if (!validation.ok) {
    throw new Error(
      `配置文件校验失败（${searchResult.filepath}）:\n` +
        validation.errors.map(e => `  - ${e}`).join('\n')
    );
  }

  return validation.value;
}

export {shallowMerge as mergeConfig};
