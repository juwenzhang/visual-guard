import type {BaselineKey} from '../types/baseline';
import type {SceneConfig} from '../types/config';

/**
 * 生成基线存储路径
 * @param key - 基线键
 * @param baseDir - 基线根目录
 * @returns 基线存储路径
 */
export function generateBaselinePath(key: BaselineKey, baseDir: string): string {
  const parts = [baseDir, key.project, key.env, key.branch, key.sceneId, key.viewport];

  if (key.deviceScaleFactor !== 1) {
    parts.push(`@${key.deviceScaleFactor}x`);
  }

  if (key.locale && key.locale !== 'en-US') {
    parts.push(key.locale);
  }

  return parts.join('/');
}

/**
 * 生成截图路径
 * @param basePath - 基线基础路径
 * @param type - 截图类型
 * @param elementName - 元素名称（可选）
 * @returns 截图文件路径
 */
export function generateScreenshotPath(
  basePath: string,
  type: 'full' | 'diff' | 'element',
  elementName?: string
): string {
  const fileName = type === 'element' && elementName ? `${elementName}.png` : `${type}.png`;

  return `${basePath}/screenshots/${fileName}`;
}

/**
 * 生成报告路径
 * @param outputDir - 输出目录
 * @param runId - 运行 ID
 * @param format - 报告格式
 * @returns 报告文件路径
 */
export function generateReportPath(
  outputDir: string,
  runId: string,
  format: 'html' | 'json' | 'console'
): string {
  const extension = format === 'html' ? 'html' : 'json';
  return `${outputDir}/${runId}/manifest.${extension}`;
}

/**
 * 生成场景 URL
 * @param baseUrl - 基础 URL
 * @param scene - 场景配置
 * @returns 完整的场景 URL
 */
export function generateSceneUrl(baseUrl: string, scene: SceneConfig): string {
  const url = new URL(scene.path, baseUrl);
  return url.toString();
}

/**
 * 规范化路径（统一路径分隔符为 /）
 * @param inputPath - 输入路径
 * @returns 规范化后的路径
 */
export function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}
