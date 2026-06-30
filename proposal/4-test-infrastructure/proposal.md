# 2. 测试基础设施

项目目录：
  ./packages/*

问题描述：
  1. 整个 monorepo 中 12 个包没有任何测试文件（无 `*.test.ts`、无 `*.spec.ts`、无 `vitest.config`）
  2. 设计文档 §13 质量门禁明确要求：核心类型必须单测、diff 算法必须有快照测试、CLI 退出码必须有集成测试、HTML reporter 必须有 fixture 测试
  3. 后续修改代码时缺乏回归保护，Puppeteer/Cypress 等复杂适配器变更风险高

解决方案：
  1. 根目录添加 `vitest` 依赖和 `vitest.config.ts`

  2. 每个包添加 `vitest.config.ts`（或复用根配置）

  3. 第一批：核心类型与工具函数（`@visual-guard/shared`）：
     - `utils/` 中 `sleep`、`retry`、`hash`、`stableStringify` 的输入输出测试
     - `path/` 中路径生成函数的跨平台测试（macOS/Linux 路径分隔符）
     - `logger/` 中日志级别和格式化测试

  4. 第一批：配置层（`@visual-guard/config`）：
     - `DEFAULT_CONFIG` 完整性测试
     - `mergeConfig()` / `applyEnvOverrides()` 合并优先级测试
     - `validateConfig()` / `assertValidConfig()` 各种非法输入测试

  5. 第二批：diff 算法快照测试（`@visual-guard/core`）：
     - `diffPixel()`：固定 fixture 图片对比，验证阈值、diff 图片生成
     - `diffDom()`：固定 HTML fixture 对比，验证新增/删除/修改检测
     - `diffLayout()`：固定 bounding rect fixture 对比，验证位移/尺寸检测
     - `diffNetwork()`：固定请求记录 fixture 对比
     - `diffPerformance()`：固定性能指标 fixture 对比

  6. 第三批：核心流程集成测试（`@visual-guard/core`）：
     - `run()` 端到端：配置 → 启动引擎 → 采集 → 基线读写 → 对比 → DiffManifest
     - 首次运行基线建立流程
     - writeBaseline 模式切换
     - 单个场景失败不阻断其他场景

  7. 第三批：CLI 集成测试（`@visual-guard/cli`）：
     - `run` 命令退出码（0/1/2）
     - `init` 命令配置生成
     - `baseline list` / `baseline clean` 参数解析

  8. 第四批：报告与引擎测试（`@visual-guard/reporters`）：
     - Console reporter：给定 fixture DiffManifest，验证输出字符串关键字段
     - HTML reporter：给定 fixture DiffManifest，验证生成的 HTML 包含必要元素
     - JSON reporter：给定 fixture DiffManifest，验证 JSON 结构完整性

  9. 第四批：引擎契约测试（`engine-playwright` / `engine-puppeteer`）：
     - 同一场景在两个引擎下的 Snapshot 结构一致性
     - `engine-cypress` spec/config 生成内容验证

  10. 根 `vitest.config.ts` 使用 workspace 模式：
      ```ts
      import { defineConfig } from 'vitest/config';
      export default defineConfig({ test: { globals: true } });
      ```

  11. 各包 `package.json` 添加 `"test": "vitest run"` 脚本

  12. CI 中 `pnpm run build` 后增加 `pnpm run test` 步骤
