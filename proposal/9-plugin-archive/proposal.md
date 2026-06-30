# 7. 归档插件实现

项目目录：
  ./packages/plugin-archive/src/index.ts

问题描述：
  1. 当前 `plugin-archive` 仅有 hello-world 骨架代码（15 行），无任何实际功能
  2. 多次运行的截图、报告、diff 产物会持续累积，需要归档管理
  3. 设计文档 §5.6 定义了归档插件的基本能力
  4. 技术选型中已预留 `archiver` 作为压缩归档方案

解决方案：
  1. 重写 `plugin-archive/src/index.ts`，实现完整归档插件

  2. 导出 `createArchivePlugin(options: ArchiveOptions): VisualGuardPlugin`，在 `afterReport` 钩子触发归档

  3. 归档目标：`.visual-guard/reports/{runId}/` → 压缩为 `{runId}.zip`

  4. 归档策略：
     - 本地归档：压缩并移动到 `.visual-guard/archives/`
     - 远程归档：上传到对象存储（S3 / COS）
     - 保留策略：按时间（保留最近 N 天）或数量（保留最近 N 次运行）

  5. 支持分场景归档和全量归档

  6. 支持增量归档（仅归档新的 diff 产物）

  7. 新增 `src/storage.ts`，实现本地文件归档和可选的远程存储适配器

  8. 扩展 PluginConfig 类型，新增归档配置：
     ```ts
     archive?: {
       enabled: boolean;
       target: 'local' | 's3' | 'cos';
       local?: { outputDir: string };
       s3?: { bucket: string; region: string; accessKeyId: string; secretAccessKey: string };
       retention?: { days?: number; maxRuns?: number };
       incremental?: boolean;
     };
     ```

  9. 新增依赖：`archiver`（压缩）、可选 `@aws-sdk/client-s3`（S3 上传）
