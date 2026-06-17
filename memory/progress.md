# Visual Guard 项目推进记录

## 记录时间

- 日期：2026-06-17
- 当前阶段：架构确认与初始化准备
- 本轮原则：今天先不进入业务代码实现，优先完成架构收敛、初始化范围确认和后续任务沉淀。

## 当前项目理解

Visual Guard 是一个前端自动化视觉回归与页面质量检测工具，核心链路是：

```text
配置化场景 -> 多引擎浏览器采集 -> 基线读写 -> 多维 diff -> 统一 DiffManifest -> 报告/插件消费
```

项目不应把全部 84 项功能一次性堆进单包，而应采用 `pnpm workspace` 的 Monorepo 方式拆分：

- `shared` / `utils`：共享类型、工具函数、日志、路径工具。
- `config`：配置加载、默认配置、环境变量覆盖、schema 校验。
- `core`：场景解析、执行编排、采集、基线、diff、manifest 聚合。
- `engine-playwright`：默认浏览器引擎适配器。
- `engine-puppeteer`：Puppeteer 引擎适配器。
- `engine-cypress`：Cypress 项目桥接适配器。
- `cli`：命令行入口、参数解析、退出码。
- `reporters`：HTML / JSON / Console 报告输出。
- `plugin-*`：通知、AI、性能、归档、远程 baseline 等扩展能力。

## 已完成事项

1. 已有 `docs/design.md` 作为总设计文档。
2. 已确认核心架构方向：
   - Monorepo 分包。
   - Core 不绑定具体浏览器框架。
   - 通过 `BrowserEngineAdapter` 支持 `playwright` / `puppeteer` / `cypress` 切换。
   - 通过 `DiffManifest` 作为统一输出协议。
   - 通过 `BaselineStore` 抽象本地与远程基线存储。
   - 通过 `PluginAPI` 扩展通知、AI、性能、归档等能力。
3. 已确认当前阶段不直接写业务实现代码，先做初始化和架构沉淀。
4. 已确认后续命令执行优先用 `rtk` 包裹，减少输出噪声和 token 消耗。
5. 已创建 `memory/` 目录并开始记录项目推进状态。

## 当前仓库状态观察

当前仓库已有基础 Monorepo 骨架：

- 根目录已有 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`biome.json`。
- `docs/design.md` 已存在。
- `README.md` 已补充项目定位、包结构和开发命令。
- `packages/` 下已按设计文档重建 12 个包：
  - `shared`
  - `config`
  - `core`
  - `engine-playwright`
  - `engine-puppeteer`
  - `engine-cypress`
  - `cli`
  - `reporters`
  - `plugin-notify`
  - `plugin-ai`
  - `plugin-perf`
  - `plugin-archive`

## 2026-06-17 初始化更新

本次完成了项目骨架初始化，不进入具体业务实现：

1. 删除了原来的 demo 包 `packages/core` 和 `packages/utils`，并通过 `lhx-cli add package <name> --force --yes` 重建包模板。
2. 修正生成模板中的包作用域，从 `@lhx-kit/*` 调整为 `@visual-guard/*`。
3. 修正包级 `tsconfig.json`，统一继承根目录 `tsconfig.base.json`。
4. 移除 `@lhx-kit/tsconfig` 这类模板残留依赖。
5. 为各包补充初始化阶段依赖关系：
   - `config`：`cosmiconfig`、`zod`。
   - `core`：`consola`、`fs-extra`、`p-limit`、`pixelmatch`、`pngjs`、`deep-diff`。
   - `cli`：`commander`、`chalk`、`ora`，并依赖内部 `config`、`core`、`reporters`、`shared`。
   - `reporters`：依赖 `shared`、`fs-extra`。
   - 引擎包使用可选 `peerDependencies` 声明 `playwright`、`puppeteer`、`cypress`，避免初始化阶段强制安装重型引擎。
6. 将 `.npmrc` 的 `auto-install-peers` 调整为 `false`，避免可选引擎 peer 依赖自动安装。
7. `.gitignore` 增加 `.visual-guard/reports`、`.visual-guard/runs` 运行产物忽略规则。
8. 已执行：
   - `pnpm install`
   - `pnpm run typecheck`
   - `pnpm run lint`

验证结果：

- `typecheck` 通过。
- `lint` 通过，仅剩 `biome.json` schema 版本和 deprecated 配置的 info 级提示，非本次错误。

## 2026-06-17 CI 初始化更新

本次新增 GitHub Actions CI 工作流：

- 文件：`.github/workflows/ci.yml`
- 触发时机：
  - push 到 `main`
  - pull request 到 `main`
- 环境：
  - `ubuntu-latest`
  - Node.js `20`
  - pnpm `10.0.0`
- 执行步骤：
  1. checkout
  2. setup pnpm
  3. setup node，并启用 pnpm cache
  4. `pnpm install --frozen-lockfile`
  5. `pnpm run openspec:check`
  6. `pnpm run lint`
  7. `pnpm run typecheck`
  8. `pnpm run build`

本地已补充验证：

- `pnpm run build` 通过。
- 前序 `pnpm run lint`、`pnpm run typecheck` 已通过。

## 2026-06-17 OpenSpec 任务校验更新

本次新增 OpenSpec 任务完成校验流程，目标是：如果仓库已初始化 `openspec/`，且存在活跃 change，则必须完成对应 OpenSpec artifacts / tasks，否则禁止本地提交和 CI 合并。

新增内容：

1. 新增脚本：`scripts/check-openspec-tasks.mjs`。
2. 新增根命令：`pnpm run openspec:check`。
3. 更新 CI：`.github/workflows/ci.yml` 增加 `Install OpenSpec CLI` 和 `OpenSpec task guard` 步骤。
4. 更新本地提交钩子：`.husky/pre-commit` 在 `lint-staged` 前执行 `pnpm run openspec:check`。
5. 更新 `README.md` 开发命令，补充 `pnpm run openspec:check`。

校验规则：

- 没有 `openspec/`：跳过。
- 有 `openspec/` 但没有活跃 change：通过。
- 有活跃 change：通过 `openspec list --json` 获取 change 列表和任务进度。
- 对每个活跃 change 执行 `openspec status --change <id> --json`。
- 若 `taskStatus.completed < taskStatus.total`：失败。
- 若 `status.isComplete !== true`：失败。
- 不再手动解析 `tasks.md`，以 OpenSpec CLI 的状态输出作为唯一判断依据。

CI 约定：

- CI 使用 Node.js `20.19.0`。
- CI 单独执行 `npm install -g @fission-ai/openspec@latest`，确保远程环境存在 OpenSpec CLI。

本地验证：

- `pnpm run openspec:check` 通过。
- `pnpm run lint` 通过，仅剩 `biome.json` schema 版本和 deprecated 配置的 info 级提示，非本次错误。

## 暂未完成事项

### 架构初始化

- [ ] 确认 `utils` 是否继续作为 `shared` 使用，还是重命名/新增 `shared` 包。
- [ ] 确认各包命名规范，例如 `@visual-guard/core`、`@visual-guard/config`。
- [ ] 补齐 `config`、`cli`、`reporters`、`engine-playwright`、`engine-puppeteer`、`engine-cypress` 包目录。
- [ ] 明确首版是否先只实现 `engine-playwright`，其余两个引擎先放接口空壳。

### 协议设计

- [ ] 定义 `BrowserEngineAdapter`、`EngineRuntime`、`EngineContext`、`EnginePage` 类型。
- [ ] 定义 `VisualGuardConfig`、`SceneConfig`、`ViewportConfig` 类型。
- [ ] 定义 `Snapshot`、`DomNodeSnapshot`、`NetworkRecord`、`PerformanceMetrics` 类型。
- [ ] 定义 `BaselineKey`、`BaselineStore`、`BaselineBundle` 类型。
- [ ] 定义 `DiffManifest`、`ScenarioResult`、各类 diff result 类型。
- [ ] 定义 `PluginAPI` 和生命周期 hook 类型。

### 初始化工作

- [ ] 统一每个包的 `package.json`、`tsconfig.json`、`tsup.config.ts` 模板。
- [ ] 确认根目录 scripts 是否满足后续多包开发。
- [ ] 确认 changeset 配置是否能正常用于后续包版本管理。
- [ ] 确认 `.gitignore` 是否需要加入 `.visual-guard/`、报告产物、baseline 产物等路径。
- [ ] 为 README 补充项目定位、开发命令和包结构说明。

### 后续实现阶段

- [ ] 实现场景解析和 URL 构造。
- [ ] 实现默认 `engine-playwright`。
- [ ] 实现截图和 DOM 快照采集。
- [ ] 实现本地 baseline 读写。
- [ ] 实现 DOM diff、pixel diff、layout diff。
- [ ] 实现 Console / JSON / HTML reporter。
- [ ] 实现 CLI `run`、`init`、`baseline list`、`baseline clean`。

## 建议下一步

下一步建议仍然不写复杂业务逻辑，只做“架构初始化提交”：

1. 创建缺失包目录和空入口文件。
2. 先把核心协议类型落在共享包里。
3. 让所有包可以 `pnpm build` / `pnpm typecheck`。
4. 更新 `README.md`，说明项目目标、包结构和开发命令。
5. 更新本文件，记录初始化完成情况和下一阶段任务。

## 命令执行约定

后续涉及 shell 命令时，优先按 `rtk-helper` 约定使用 `rtk` 包裹常见命令，例如：

```bash
rtk ls .
rtk cat package.json
rtk grep "BrowserEngineAdapter" .
rtk git status
rtk git diff
```

对于需要交互、发布、提交、安装依赖等命令，按实际情况谨慎执行，不自动替代用户做不可逆操作。
