import type {DiffManifest} from '@visual-guard/shared';

/**
 * 报告生成选项
 */
export interface ReporterOptions {
  /** DiffManifest 数据 */
  manifest: DiffManifest;
  /** 输出目录 */
  outputDir: string;
  /** 运行 ID */
  runId: string;
}
