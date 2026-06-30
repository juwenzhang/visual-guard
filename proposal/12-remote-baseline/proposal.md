# 10. 远程基线存储

项目目录：
  ./packages/core/src/baseline-store.ts
  ./packages/shared/src/types/baseline.ts

问题描述：
  1. 当前基线存储仅有 `createLocalBaselineStore()`，只支持本地文件系统读写
  2. `BaselineStore` 接口已定义，但无远程实现
  3. 设计文档 §4.1 基线策略中提到「远程 baseline 作为 store adapter，不侵入 core」
  4. 团队协作场景需要共享基线（跨机器、跨 CI 环境）

解决方案：
  1. 新增 `packages/baseline-remote/` 包，实现远程基线存储适配器

  2. 实现 `createS3BaselineStore(options): BaselineStore`：
     - 基于 S3 SDK 的基线读写
     - Key 路径映射：`{project}/{env}/{branch}/{sceneId}/{viewport}/...`
     - 支持 `list()` 和 `clean()` 通过 S3 LIST + DELETE 操作

  3. 实现 `createHttpBaselineStore(options): BaselineStore`：
     - 基于 REST API 的远程基线服务
     - 基线上传/下载/列表/清理接口

  4. 新增 `packages/baseline-server/` 可选包（轻量基线服务端）：
     - 基于 Express/Fastify 的 HTTP 服务
     - 提供 REST API：`GET/PUT /baselines/{key}`、`GET /baselines`、`DELETE /baselines/clean`
     - 支持本地文件或 S3 后端存储

  5. 配置层扩展：
     ```ts
     baselineStore?: {
       type: 'local' | 's3' | 'http';
       s3?: { bucket: string; region: string };
       http?: { baseUrl: string; apiKey: string };
     };
     ```

  6. 不侵入 core，通过 `VisualGuardConfig.baselineStore.type` 选择 store 实现

  7. CLI `visual-guard baseline push/pull` 子命令支持基线同步
