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

## 2026-06-17 OpenSpec 脚本修复更新

本次修复 `scripts/check-openspec-tasks.mjs` 脚本，处理 `openspec/specs/` 和 `openspec/changes/` 目录不存在的情况：

问题：

- 空目录无法上传到 GitHub
- 脚本在目录不存在时会报错

修复方案（不添加 `.gitkeep`）：

1. 新增 `hasOpenSpecContent()` 函数，检查 `specs/` 或 `changes/` 目录是否存在
2. 如果两个目录都不存在，直接跳过校验，输出提示信息
3. 避免强制添加 `.gitkeep` 文件

验证逻辑：

- 删除 `specs/` 和 `changes/` 目录后运行 `pnpm run openspec:check`：输出"OpenSpec 已初始化，但 specs/ 和 changes/ 目录不存在，跳过校验。"
- 恢复目录后运行：输出"OpenSpec 已初始化，但没有活跃 change，校验通过。"

修改文件：

- `scripts/check-openspec-tasks.mjs`：新增 `hasOpenSpecContent()` 函数，修改 `main()` 逻辑

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

## 2026-06-18 共享层类型定义完成

本次完成了 `@visual-guard/shared` 包的类型定义和工具函数实现：

### 创建的类型文件

1. **引擎类型** (`types/engine.ts`)：
   - `BrowserEngineName`：浏览器引擎名称类型
   - `EngineLaunchOptions`：引擎启动选项
   - `EngineContextOptions`：引擎上下文选项
   - `GotoOptions`：页面跳转选项
   - `WaitOptions`：等待选项
   - `ScreenshotOptions`：截图选项
   - `CookieInput`：Cookie 输入类型
   - `BrowserEngineAdapter`：浏览器引擎适配器接口
   - `EngineRuntime`：引擎运行时接口
   - `EngineContext`：引擎上下文接口
   - `EnginePage`：引擎页面接口

2. **配置类型** (`types/config.ts`)：
   - `ViewportConfig`：视口配置
   - `BrowserConfig`：浏览器配置
   - `DiffConfig`：对比配置
   - `PerformanceBudget`：性能预算
   - `PerformanceConfig`：性能配置
   - `SceneConfig`：场景配置
   - `VisualGuardConfig`：主配置
   - `PluginConfig`：插件配置

3. **快照类型** (`types/snapshot.ts`)：
   - `DomNodeSnapshot`：DOM 节点快照
   - `NetworkRecord`：网络记录
   - `PerformanceMetrics`：性能指标
   - `AccessibilitySnapshot`：无障碍树快照
   - `Snapshot`：页面快照

4. **基线类型** (`types/baseline.ts`)：
   - `BaselineKey`：基线键
   - `BaselineMeta`：基线元信息
   - `BaselineBundle`：基线包
   - `BaselineQuery`：基线查询
   - `CleanPolicy`：清理策略
   - `BaselineStore`：基线存储接口

5. **Diff 类型** (`types/diff.ts`)：
   - `ScenarioStatus`：场景状态
   - `RuntimeError`：运行时错误
   - `PixelDiffResult`：像素对比结果
   - `DomDiffResult`：DOM 对比结果
   - `LayoutDiffResult`：布局对比结果
   - `NetworkDiffResult`：网络对比结果
   - `PerformanceDiffResult`：性能对比结果
   - `ScenarioResult`：场景结果
   - `DiffManifest`：统一输出协议

6. **插件类型** (`types/plugin.ts`)：
   - `HookName`：生命周期钩子名称
   - `HookContext`：钩子上下文
   - `HookHandler`：钩子处理函数
   - `PluginAPI`：插件 API
   - `VisualGuardPlugin`：插件接口

### 创建的工具函数

1. **通用工具** (`utils/index.ts`)：
   - `sleep(ms)`：睡眠/等待函数
   - `retry(fn, options)`：重试函数
   - `hash(str)`：计算字符串哈希值
   - `stableStringify(obj)`：稳定序列化对象

2. **路径工具** (`path/index.ts`)：
   - `generateBaselinePath(key, baseDir)`：生成基线存储路径
   - `generateScreenshotPath(basePath, type, elementName)`：生成截图路径
   - `generateReportPath(outputDir, runId, format)`：生成报告路径
   - `generateSceneUrl(baseUrl, scene)`：生成场景 URL
   - `normalizePath(inputPath)`：规范化路径

3. **日志工具** (`logger/index.ts`)：
   - `LogLevel`：日志级别枚举
   - `createLogger(options)`：创建日志记录器
   - `logger`：默认日志记录器实例
   - `useLogger(tag)`：带标签的日志记录器工厂

### 修复的问题

1. 修复 `types/engine.ts` 错误导入 `BrowserEngineName` 的问题
2. 修复 `utils/index.ts` 缺少 `RetryOptions` 类型定义的问题
3. 修复 `logger/index.ts` 使用不支持的 `fancy` 选项的问题
4. 修复 `path/index.ts` 未使用参数的问题
5. 修复 `types/baseline.ts` 未使用导入的问题
6. 修复 `index.ts` 导出组织问题
7. 修复 `types/plugin.ts` 导入组织问题

### 验证结果

- ✅ TypeScript 类型检查通过
- ✅ Biome lint 检查通过
- ✅ 所有类型正确导出

### 修改文件

- `packages/shared/src/types/engine.ts`：新增引擎相关类型
- `packages/shared/src/types/config.ts`：新增配置相关类型
- `packages/shared/src/types/snapshot.ts`：新增快照相关类型
- `packages/shared/src/types/baseline.ts`：新增基线相关类型
- `packages/shared/src/types/diff.ts`：新增 Diff 相关类型
- `packages/shared/src/types/plugin.ts`：新增插件相关类型
- `packages/shared/src/utils/index.ts`：新增工具函数
- `packages/shared/src/path/index.ts`：新增路径工具
- `packages/shared/src/logger/index.ts`：新增日志工具
- `packages/shared/src/index.ts`：更新主入口文件，导出所有类型和工具

## 2026-06-19 端到端链路闭环（CLI + Reporters）

本次完成了 CLI 和 Reporters 包的实现，打通端到端链路：

### `@visual-guard/reporters` 包

新增三个报告器：

1. **Console Reporter** (`src/console.ts`)：
   - 彩色终端摘要输出（chalk）
   - 运行信息、汇总统计、差异统计、场景详情

2. **JSON Reporter** (`src/json.ts`)：
   - 将 `DiffManifest` 序列化为 `manifest.json`
   - 按 `outputDir/runId/` 目录组织

3. **HTML Reporter** (`src/html.ts`)：
   - 生成可视化 HTML 报告
   - 包含场景概览卡片、状态标签、进度条、场景详情表格
   - 响应式布局，现代化 UI

### `@visual-guard/cli` 包

实现 `visual-guard run` 命令（`src/commands/run.ts`）：

- `--config <path>`：指定配置文件路径
- `--engine <engine>`：覆盖浏览器引擎
- `--env <env>`：覆盖环境名称
- `--format <format>`：报告格式（console/json/html，逗号分隔）
- 退出码：0=无差异，1=有差异，2=执行异常

入口：
- `src/index.ts`：commander 程序定义
- `bin/visual-guard.mjs`：可执行脚本

### 示例配置

新增 `examples/basic/visualguard.config.json`：
- 项目名 `demo-site`，环境 `local`
- 单视口 1280×800 desktop
- 单场景首页，reporter 三格式输出

### 依赖更新

- `@visual-guard/reporters`：新增 `chalk` 依赖
- `@visual-guard/cli`：新增 `bin` 入口，依赖 `@visual-guard/engine-playwright`

### 验证结果

- ✅ `typecheck` 全部 12 包通过
- ✅ `lint` 零错误
- ✅ `build` 全部 12 包通过

## 2026-06-19 报告与首次运行体验优化

问题：首次运行无基线时 diff 返回 undefined，状态显示「通过」毫无意义；控制台输出不告诉用户下一步该做什么；JSON/HTML 报告未生成。

### 类型层修改

- `ScenarioStatus` 新增 `'baseline'` 状态
- `Summary` 新增 `baseline` 字段

### Runner 层修改

- 首次运行（无基线）：直接返回 `status: 'baseline'`，跳过所有 diff 计算
- 后续运行：正常执行对比流程
- `launchOptions` 透传：合并用户配置的 `browser.launchOptions.args` 到引擎启动参数

### Console Reporter 重写

- 精简摘要输出，区分「基线建立」「通过」「有变化」「错误」四种场景
- 首次全天基线时显示 `📌 这是首次运行，已为所有场景建立基线。修改页面后再次运行即可检测视觉变化。`
- 底部列出所有已生成的报告文件路径
- 有差异时提示 `⚠ 检测到视觉差异，请检查报告文件了解详情。`

### HTML Reporter 更新

- 新增 `baseline` 状态标签和蓝色样式

### CLI 修改

- 报告生成顺序调整：先 JSON/HTML，后 Console（确保 Console 能列出文件路径）
- `generateConsoleReport` 新增第二个参数 `reportFiles: string[]`

---

## 2026-06-19 writeBaseline 模式开关

问题：runner 每次运行都覆盖基线，导致第二次运行对比的是「上次结果」而非「初始基线」。

### RunnerOptions 新增字段

```ts
export interface RunnerOptions {
  // ...
  writeBaseline?: boolean;
}
```

### Runner 写入逻辑

| 场景 | 是否写基线 |
|------|-----------|
| 首次运行（无现有基线） | ✅ 强制写入 |
| 后续运行，未传 `--write-baseline` | ❌ 不写（只对比） |
| 后续运行，传 `--write-baseline` | ✅ 覆盖旧基线 |

### CLI 更新

- `--write-baseline` 描述修正为「更新基线，后续运行以此为对比基准」
- 解析布尔值并传递给 `runner({ writeBaseline })`

---

## 2026-06-19 CLI 子命令扩展（init + baseline）

### `visual-guard init` — 交互式配置生成

新增 `packages/cli/src/commands/init.ts`，使用 `@inquirer/prompts` 逐步询问：

1. 项目名称（默认当前目录名）
2. 被测页面根地址（URL 校验）
3. 浏览器引擎（playwright/puppeteer/cypress）
4. 无头模式
5. 场景列表（可添加多个，每个含名称+路径，自动生成 id）
6. 报告格式组合

生成 `visualguard.config.json` 后提示 `visual-guard run` 命令。

### `visual-guard baseline list` — 基线列表

新增命令，列出所有基线，带筛选参数：
- `-p, --project` 按项目筛选
- `-e, --env` 按环境筛选
- `-b, --branch` 按分支筛选

输出包含：项目/环境/分支、场景、视口、创建/更新时间、DOM/截图大小。

### `visual-guard baseline clean` — 基线清理

新增命令，清理旧基线：
- `--keep <n>` 保留最近 N 条（默认 20）
- `--older-than <days>` 删除 N 天前的
- `--dry-run` 预览模式

### 依赖更新

- `@visual-guard/cli` 新增 `@inquirer/prompts` 依赖

### 验证结果

- ✅ `typecheck` 全部通过
- ✅ `lint` 仅 info，无 error
- ✅ `build` 全部通过

## 当前架构状态

```
配置层 ✅  @visual-guard/config         loadConfig + zod 校验 + 环境变量覆盖
共享层 ✅  @visual-guard/shared        类型 + 工具函数 + 日志 + 路径
核心层 ✅  @visual-guard/core           runner + capture + diff + baseline + writeBaseline 模式
引擎层 ✅  @visual-guard/engine-playwright  SSR 适配 + Playwright 封装
        ⚪  @visual-guard/engine-puppeteer  骨架待实现
        ⚪  @visual-guard/engine-cypress    骨架待实现
CLI 层 ✅  @visual-guard/cli             run 命令 + --write-baseline + 退出码
报告层 ✅  @visual-guard/reporters       Console/JSON/HTML + baseline 状态 + 操作指引
插件层 ⚪  plugin-notify/plugin-ai/plugin-perf/plugin-archive  骨架
```

**端到端链路已可运行：**
```bash
cd examples/basic
visual-guard run -c visualguard.config.json              # 首次：建立基线
visual-guard run -c visualguard.config.json              # 后续：对比基线
visual-guard run -c visualguard.config.json --write-baseline  # 更新基线
```

---

## 2026-06-19 Puppeteer 引擎适配器 + CLI 优化

### `@visual-guard/engine-puppeteer` 完整实现

参照 `engine-playwright` 完整实现 Puppeteer 适配器，包含：
- Browser → BrowserContext → Page 三层封装
- SSR 模式：跳过 networkidle、跳过事件监听
- 视口设置、cookie 注入、extraHeaders 注入
- 截图（全页 + 元素）、DOM 快照、网络/控制台事件监听
- 能力声明与 playwright 完全同构

### 类型桩方案

因 Puppeteer 要求 Node >= 22，当前环境 Node 20，使用 `puppeteer.d.ts` 类型声明桩保证编译通过。用户安装 puppeteer 后真实类型自动覆盖。

### CLI 优化

- `version` / `description` 改为从 `package.json` 动态读取
- `_loadAdapter` 支持 `puppeteer` 引擎切换

### 依赖更新

- `@visual-guard/cli` 新增 `@visual-guard/engine-puppeteer` 依赖

### 验证结果

- ✅ `typecheck` 全部通过
- ✅ `lint` 零错误
- ✅ `build` 全部通过

## 当前架构状态

```
配置层 ✅  @visual-guard/config         loadConfig + zod + 环境变量覆盖
共享层 ✅  @visual-guard/shared        类型 + 工具 + 日志 + 路径
核心层 ✅  @visual-guard/core           runner + capture + diff + baseline + writeBaseline
引擎层 ✅  @visual-guard/engine-playwright  SSR 适配 + Playwright 封装
        ✅  @visual-guard/engine-puppeteer  完整 Puppeteer 适配（已实现）
        ⚪  @visual-guard/engine-cypress    骨架待实现
CLI 层 ✅  @visual-guard/cli             run/init/baseline + 双引擎 + 动态版本号
报告层 ✅  @visual-guard/reporters       Console/JSON/HTML + baseline 状态
插件层 ⚪  plugin-* (4 个骨架)
```

**双引擎已可切换：**
```bash
visual-guard run --engine playwright   # 默认
visual-guard run --engine puppeteer    # 可选
```

---

## 2026-06-19 引擎路线重新规划：暂停 Puppeteer，转向 Cypress 桥接

### 决策

Puppeteer 在当前 monorepo + Node 20 + Chrome for Testing 环境下出现多类底层不稳定问题：

- 多版本 `puppeteer` / `puppeteer-core` 解析源不一致
- Chrome revision 与缓存目录容易错配
- `headless: true` / `headless: 'new'` 行为差异明显
- `ECONNRESET`、`Navigating frame was detached`、`Protocol error: Connection closed` 等底层连接问题
- 与 Playwright 的稳定 BrowserContext/Page 生命周期差异较大

因此：

- `engine-playwright` 继续作为主线稳定引擎
- `engine-puppeteer` 保留实验包，但暂停主线投入
- `engine-cypress` 转为后续重点，但采用 **Cypress spec + cy.task 桥接方案**，不强行复刻 Page API
- 当前阶段只支持 macOS / Linux，暂不适配 Windows

### Cypress 当前实现

新增 `@visual-guard/engine-cypress` 的 adapter 边界：

- 声明 Cypress 能力和限制
- `visual-guard run --engine cypress` 会明确提示当前是桥接模式
- 后续实现方向：生成 Cypress spec，通过 `cy.visit` / `cy.screenshot` / `cy.task` 输出采集产物

### 文档更新

- 根 `README.md` 重写当前状态、引擎策略、路线图
- `examples/standalone/README.md` 说明 Playwright 主线、Cypress 桥接规划、Puppeteer 暂停
- `examples/standalone/package.json` 增加 `engine-cypress` / `cypress` peer 示例和 `guard:run:cypress` 脚本

### 验证结果

- ✅ `typecheck` 通过
- ✅ `lint` 通过
- ✅ `build` 通过
- ✅ `pnpm guard:run:cypress` 输出清晰桥接提示

## 建议下一步

| 优先级 | 工作 | 说明 |
|--------|------|------|
| P1 | **Cypress 采集桥接设计** | 明确 spec 生成、cy.task 通信、产物目录协议 |
| P2 | **CI 集成示例** | GitHub Actions / GitLab CI 模板 |
| P3 | **插件激活** | plugin-notify / plugin-perf 从骨架到实现 |

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
