import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest} from '@visual-guard/shared';

/**
 * JSON 报告器 — 将 DiffManifest 写入 JSON 文件
 *
 * @param manifest - 对比结果清单
 * @param outputDir - 输出目录
 * @param runId - 运行 ID
 * @returns 写入的文件路径
 */
export async function generateJsonReport(
  manifest: DiffManifest,
  outputDir: string,
  runId: string
): Promise<string> {
  const reportDir = path.join(outputDir, runId);
  await fs.mkdir(reportDir, {recursive: true});

  const filePath = path.join(reportDir, 'manifest.json');
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8');

  return filePath;
}
