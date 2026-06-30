# 6. AI 分析插件实现

项目目录：
  ./packages/plugin-ai/src/index.ts

问题描述：
  1. 当前 `plugin-ai` 仅有 hello-world 骨架代码（15 行），无任何实际功能
  2. 设计文档 §5.6 定义了 AI 插件的 4 项能力：多模态差异解释、变化分类、修复建议生成、性能退化原因分析
  3. 设计文档 §5.6 还定义了成本控制需求
  4. `docs/questions/04-ai-agent-design.md` 已有详细的 AI analysis flow 设计

解决方案：
  1. 重写 `plugin-ai/src/index.ts`，实现完整 AI 插件

  2. 导出 `createAiPlugin(options: AiOptions): VisualGuardPlugin`，在 `afterCompare` 钩子触发分析

  3. AI 分析流程（`afterCompare` 阶段）：
     - 读取 `scenarioResult.diffs`（pixel diffImage + 区域坐标、DOM 增删改、布局位移）
     - 构造 LLM prompt（System: "你是前端视觉回归修复专家"）
     - Context: 页面 URL、viewport、diff 数据摘要
     - Image: pixel diffImage 热力图（多模态模型输入）
     - 调用 LLM API 获取分析结果

  4. 汇总阶段（`afterReport` 阶段）：
     - 汇总所有场景的 FixSuggestion 列表
     - 写入文件（CSS patch / component code diff）
     - 可选：调用 Git API 提修复 PR

  5. FixSuggestion 数据结构：
     ```ts
     interface FixSuggestion {
       scenarioId: string;
       type: 'css' | 'layout' | 'dom' | 'performance' | 'accessibility';
       file?: string;
       selector: string;
       property: string;
       oldValue: string;
       newValue: string;
       confidence: number;       // 0-1
       reasoning: string;        // AI 解释
       autoFixable: boolean;     // 是否可自动修复
     }
     ```

  6. 变化分类器（`src/classifier.ts`）：按类型归类差异（样式变化/布局偏移/内容变更/性能退化）

  7. 修复建议生成器（`src/advisor.ts`）：根据 diff 数据生成结构化修复方案

  8. 成本控制策略（配置层）：
     - 只分析 `failed` / `changed` 场景
     - 压缩 diff 图片（降低分辨率后再送 LLM）
     - 缓存相似 diff，避免重复调用
     - `maxTokensPerRun` 总预算上限

  9. 扩展 PluginConfig 类型，新增 AI 配置：
     ```ts
     ai?: {
       enabled: boolean;
       provider: 'openai' | 'claude' | 'custom';
       apiKey?: string;
       baseUrl?: string;
       model?: string;
       analyzeChangedOnly: boolean;
       maxTokensPerRun?: number;
       imageMaxWidth?: number;
     };
     ```

  10. 新增依赖：`openai` SDK（或通用 HTTP 调用）
