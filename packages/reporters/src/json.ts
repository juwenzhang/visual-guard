import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest} from '@visual-guard/shared';

/**
 * JSON 报告器 — 输出两份文件
 *
 * - `summary.json`：精简摘要（200 行以内），仅含 semantic + summary + run 元信息，供 AI/通知消费
 * - `manifest.json`：完整 DiffManifest，供 CI 解析
 *
 * @param manifest - 对比结果清单
 * @param outputDir - 输出目录
 * @param runId - 运行 ID
 * @returns 写入的文件路径列表
 */
export async function generateJsonReport(
  manifest: DiffManifest,
  outputDir: string,
  runId: string
): Promise<string[]> {
  const reportDir = path.join(outputDir, runId);
  await fs.mkdir(reportDir, {recursive: true});

  // 完整 manifest（CI 消费）
  const manifestPath = path.join(reportDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // 精简摘要（AI / 人类可读）
  const summary: Record<string, unknown> = {
    version: manifest.version,
    run: manifest.run,
    summary: manifest.summary,
    scenarios: manifest.scenarios.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      status: s.status,
      durationMs: s.durationMs,
      semantic: s.semantic,
      errors: s.errors.length > 0 ? s.errors : undefined
    }))
  };
  const summaryPath = path.join(reportDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  return [manifestPath, summaryPath];
}
