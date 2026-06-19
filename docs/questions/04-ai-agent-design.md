# Visual Guard AI Agent 设计文档

> 状态：方案探讨 | 日期：2026-06-20 | 依赖：[03-plugin-mechanism-design](./03-plugin-mechanism-design.md)

## 一、AI Plugin 设计（plugin-ai）

### 1.1 触发时机：afterCompare

此时 `scenarioResult` 已完整生成，包含：

- `diffs.pixel.diffImage` — base64 差异热力图
- `diffs.pixel.regions` — 差异区域坐标列表
- `diffs.dom` — DOM 节点增删改
- `diffs.layout` — 元素位移/尺寸变化

### 1.2 AI 分析流程

```text
afterCompare hook:
  1. 读取 scenarioResult.diffs
  2. 构造 LLM prompt：
     - System: "你是前端视觉回归修复专家"
     - Context: 页面 URL、viewport、diff 数据摘要
     - Image: pixel diffImage（热力图）
     - Task: 分析差异原因，生成修复代码
  3. 调用 LLM API（Claude / GPT-4o 等支持视觉的多模态模型）
  4. 解析返回的修复建议 → 结构化 FixSuggestion[]

afterReport hook:
  1. 汇总所有场景的 FixSuggestion
  2. 写入文件（CSS patch / component code diff）
  3. 调用 Git API 提 PR
```

### 1.3 FixSuggestion 数据结构

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
  reasoning: string;         // AI 解释
  autoFixable: boolean;      // 是否可以自动修复
}
```
### 二、AI 接入深度方案

#### 2.1 LLM 选型与多模态能力

视觉回归修复的核心难点是：AI 需要**看到差异图片**才能准确判断修复方向。

| 方案 | 图片输入 | 成本 | 适用 |
|------|---------|------|------|
| **Claude Vision**（推荐） | ✅ base64 data URL | $3/MTok in, $15/MTok out | 像素差异热力图分析 + 文本 diff 数据 |
| **GPT-4o / GPT-4V** | ✅ base64 data URL | $5/MTok in, $15/MTok out | 同上，兼容 OpenAI 生态 |
| **纯文本 LLM**（降级） | ❌ 仅文本 | 较低 | DOM/Layout/Network diff 文本分析（不含图片） |

**推荐策略**：优先使用支持视觉的模型（Claude Vision / GPT-4o）进行像素 + 文本完整分析；降级方案用纯文本模型仅分析结构化 diff 数据。

#### 2.2 Claude Vision API 调用方式

Claude Vision 支持将 base64 图片直接放入 `content` 数组：

```ts
async function analyzeDiffWithClaude(
  scenarioResult: ScenarioResult,
  diffImageBase64: string,
  apiKey: string
): Promise<FixSuggestion[]> {
  const systemPrompt = `你是前端视觉回归修复专家。
分析给定的像素差异热力图（红色区域=差异）和 DOM/Layout/Network diff 数据，
生成结构化的修复建议。

输出格式（JSON）：
\`\`\`json
{
  "suggestions": [
    {
      "type": "css" | "layout" | "dom",
      "selector": "CSS 选择器",
      "property": "属性名",
      "oldValue": "旧值",
      "newValue": "新值",
      "confidence": 0.0-1.0,
      "reasoning": "修复理由（中文）",
      "autoFixable": true/false
    }
  ]
}
\`\`\`

规则：
1. 只输出 JSON，不要额外文字
2. confidence >= 0.8 的建议才标记 autoFixable=true
3. 布局偏移（position/margin/padding 变化）优先用 CSS 修复
4. DOM 增删改需要结合上下文判断是否故意为之`;

  const userPrompt = {
    scenario: `${scenarioResult.name} (${scenarioResult.url})`,
    viewport: `${scenarioResult.diffs.pixel?.totalPixels ?? 0} 像素`,
    pixelDiff: {
      diffRatio: scenarioResult.diffs.pixel?.diffRatio,
      diffPixels: scenarioResult.diffs.pixel?.diffPixels,
      regions: scenarioResult.diffs.pixel?.regions?.slice(0, 10) // top 10 热区
    },
    domDiff: {
      added: scenarioResult.diffs.dom?.added.length,
      removed: scenarioResult.diffs.dom?.removed.length,
      changed: scenarioResult.diffs.dom?.changed.slice(0, 20) // top 20 变更
    },
    layoutDiff: {
      moved: scenarioResult.diffs.layout?.moved.slice(0, 10),
      resized: scenarioResult.diffs.layout?.resized.slice(0, 10)
    }
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: JSON.stringify(userPrompt, null, 2) },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: diffImageBase64 // diffPixel 返回的 base64 热力图
              }
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  const text = data.content[0]?.text ?? '';
  const json = JSON.parse(extractJsonFromMarkdown(text));
  return json.suggestions;
}
```

#### 2.3 纯文本 LLM 降级方案

当视觉模型不可用时，可将结构化的 diff 数据直接传给任意 LLM（降级后不含热力图分析，仅做文本 diff 推理）：

```ts
async function analyzeDiffWithTextLLM(
  scenarioResult: ScenarioResult,
  apiKey: string,
  baseUrl: string = 'https://api.openai.com/v1/chat/completions',
  model: string = 'gpt-4o'
): Promise<FixSuggestion[]> {
  const systemPrompt = `你是前端视觉回归修复专家。基于 DOM / Layout / Network 的 diff 数据，
分析并生成结构化的修复建议。输出仅限 JSON。`;

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({
          scenario: scenarioResult.name,
          pixelDiff: {
            diffRatio: scenarioResult.diffs.pixel?.diffRatio,
            diffPixels: scenarioResult.diffs.pixel?.diffPixels
          },
          domDiff: {
            added: scenarioResult.diffs.dom?.added.length,
            removed: scenarioResult.diffs.dom?.removed.length,
            changed: scenarioResult.diffs.dom?.changed.slice(0, 20)
          },
          layoutDiff: {
            moved: scenarioResult.diffs.layout?.moved.slice(0, 10),
            resized: scenarioResult.diffs.layout?.resized.slice(0, 10)
          }
        })}
      ],
      temperature: 0.3,
      max_tokens: 4096
    })
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const json = JSON.parse(extractJsonFromMarkdown(text));
  return json.suggestions;
}

function extractJsonFromMarkdown(text: string): string {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return match?.[1] ?? text;
}
```

#### 2.4 Prompt 设计原则

| 原则 | 说明 |
|------|------|
| **结构化输出** | 要求输出 JSON，通过系统提示约定 schema，用 `extractJsonFromMarkdown` 兜底解析 |
| **分维度分析** | 先分析 pixel diff（图片），再结合 DOM/Layout diff 交叉验证 |
| **置信度分级** | confidence >= 0.8 才标记 autoFixable，低置信度仅做建议不自动修复 |
| **低温度** | temperature=0.2-0.3，提高输出一致性，减少幻觉 |
| **Top N 截断** | diff 数据量可能很大，只传 top 10-20 条变更，避免 token 超限 |
| **System Prompt** | 用 system prompt 而非 user prompt 设定角色和输出格式，user prompt 放具体 diff 数据 |

#### 2.5 FixSuggestion → 代码补丁流程

```text
afterReport:
  1. 汇总所有场景的 FixSuggestion[]
  2. 按 type 分组：css / layout / dom
  3. CSS fix: 生成 .patch 文件
     ┌─ .selector { old-property: oldValue; }
     └─ .selector { old-property: newValue; }
  4. DOM fix: 生成组件代码 diff（需要知道源文件路径 → 暂由用户确认）
  5. 写入 .visual-guard/ai-fixes/<runId>.patch
  6. autoFix=true 时调用 Git 平台 API (GitHub / GitLab) 创建 Pull Request
```

#### 2.6 Pull Request 创建（远期）

```ts
interface CreatePROptions {
  /** 仓库的 owner/repo，如 "facebook/react" */
  repo: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}

/**
 * 通用 Pull Request 创建（以 GitHub API 为例）。
 * GitLab 等平台只需替换 baseUrl 和请求体字段名。
 */
async function createFixPR(opts: CreatePROptions, token: string): Promise<string> {
  const baseUrl = 'https://api.github.com';
  // GitLab: 'https://gitlab.com/api/v4'

  const response = await fetch(
    `${baseUrl}/repos/${encodeURIComponent(opts.repo)}/pulls`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        head: opts.sourceBranch,
        base: opts.targetBranch,
        title: opts.title,
        body: opts.description
      })
    }
  );
  const data = await response.json();
  return data.html_url;
}
```

注意：自动提 PR 需要在 CI 环境中已配置 Git token + commit + push 权限，MVP 阶段可先只生成 patch 文件供人工 review。

### 三、AI Agent 架构

当前 6.2-6.4 描述的是「调一次 LLM → 拿到 FixSuggestion → 结束」的简单模式。实际问题中，修复往往需要**多步迭代**：读代码 → 改 CSS → 跑测试 → 发现不对 → 再改 → 提交。这就需要 Agent 机制。

#### 3.1 核心架构：Agent Loop

参考 Claude Code / OpenAI Agents SDK 的实践，Agent Loop 的基本模式是：

```text
┌─────────────────────────────────────────────────┐
│                  Agent Loop                      │
│                                                  │
│   User Goal: "修复首页像素差异"                   │
│         │                                        │
│         ▼                                        │
│   ┌──────────┐    tool_calls    ┌────────────┐  │
│   │  LLM     │ ───────────────→ │ Tool Exec  │  │
│   │ (think)  │ ←─────────────── │ (act)      │  │
│   └──────────┘   tool_results   └────────────┘  │
│         │                                        │
│         │ no tool_calls (final answer)           │
│         ▼                                        │
│   返回最终结果 (FixSuggestion[] + patch 路径)     │
│                                                  │
│   ┌─ 控制参数 ─────────────────────────┐         │
│   │ maxSteps: 10  (防止无限循环)        │         │
│   │ maxBudget: $2 (成本上限)            │         │
│   │ timeout: 120s (单次超时)            │         │
│   └────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

#### 3.1.1 Agent Loop vs ReAct：为什么选原生 Tool Calling

Agent Loop 和 ReAct 不是二选一，是**层级关系**——ReAct 是 Agent Loop 内部的推理策略。关键在于实现方式：

| | 原生 Tool Calling（✅ 选用） | ReAct 文本格式（❌ 不选） |
|---|---|---|
| 实现方式 | API `tools` 参数，LLM 返回结构化 `tool_use` block | 手写 `Thought: / Action: / Observation:` 文本，正则解析 |
| 格式可靠性 | API 保证，不可能格式错误 | 幻觉频发（缺字段、中文冒号 vs 英文冒号） |
| Token 消耗 | 低（`tool_use` 不计入 output token 计费） | 高（Thought 全文计入 output） |
| 可解释性 | 中 — 看 tool 调用链即可 | 高 — 每步有显式思考文本 |
| 工程复杂度 | 低 — `content.filter(c => c.type === 'tool_use')` | 高 — 正则 + 错误恢复 + 多格式兼容 |

**决策**：用 Agent Loop + 原生 Tool Calling。Claude/GPT-4o 的 tool calling 已内化推理能力，system prompt 中引导「先分析差异原因，再决定调用哪个工具」即可，不需要手写 ReAct 格式。

唯一保留的 ReAct 精神——在 system prompt 中加入：

```text
## 工作方式
每一步都先思考：当前拿到了什么信息？还缺什么？下一步该调哪个工具？
然后调用工具获取信息，再根据结果决定下一步。
```

#### 3.2 Agent Tool 集

Agent 可以调用的 Tools（每个 Tool 有 name、description、parameters schema）：

```ts
interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute(params: Record<string, unknown>): Promise<{ content: string }>;
}
```

**核心 Tool 列表：**

| Tool | 功能 | 参数 |
|------|------|------|
| `read_diff` | 读取场景 diff 数据 | `scenarioId` |
| `read_dom` | 读取当前页面 DOM 结构 | `scenarioId`, `selector?` |
| `read_baseline` | 读取基线数据 | `scenarioId` |
| `read_file` | 读取项目源文件 | `path` |
| `write_file` | 写入修复后文件 | `path`, `content` |
| `run_command` | 执行 shell（git diff、npm test） | `command` |
| `create_pull_request` | 创建 PR | `title`, `description`, `files[]` |
| `finish` | 完成修复，输出最终结果 | `summary`, `fixSuggestions[]` |

**Tool 调用示例（LLM 视角）：**

```json
// Step 1: LLM 调用 read_diff
{ "name": "read_diff", "arguments": { "scenarioId": "home@desktop" } }

// → Tool 返回：{ pixelDiff: 0.48%, regions: [{x:100,y:50,width:30,height:20}], ... }

// Step 2: LLM 调用 read_dom 查看差异区域 DOM
{ "name": "read_dom", "arguments": { "scenarioId": "home@desktop", "selector": ".hero-section" } }

// → Tool 返回：{ tagName: "div", className: "hero-section", computedStyle: {...} }

// Step 3: LLM 调用 write_file 写入修复
{ "name": "write_file", "arguments": { "path": "src/components/Hero.css", "content": "..." } }

// Step 4: LLM 调用 finish 结束
{ "name": "finish", "arguments": { "summary": "修复了 Hero 组件的 margin-top 从 20px 调整为 24px", "fixSuggestions": [...] } }
```

#### 3.3 Agent Loop 实现

```ts
type AgentState = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: unknown[] }>;
  steps: number;
  totalCost: number;
};

async function agentLoop(
  goal: string,
  tools: AgentTool[],
  options: {
    model: string;
    apiKey: string;
    baseUrl?: string;
    maxSteps?: number;
    maxBudget?: number;
  }
): Promise<{ fixSuggestions: FixSuggestion[]; summary: string; patchPath?: string }> {
  const state: AgentState = {
    messages: [
      {
        role: 'system',
        content: buildAgentSystemPrompt(tools)
      },
      {
        role: 'user',
        content: goal
      }
    ],
    steps: 0,
    totalCost: 0
  };

  const maxSteps = options.maxSteps ?? 10;
  const maxBudget = options.maxBudget ?? 2; // $2

  while (state.steps < maxSteps) {
    const response = await fetch(
      options.baseUrl ?? 'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: 4096,
          messages: state.messages,
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
          }))
        })
      }
    );

    const data = await response.json();
    state.steps++;
    state.totalCost += calculateCost(data.usage, options.model);

    // 预算检查
    if (state.totalCost > maxBudget) {
      throw new Error(`Agent cost exceeded budget: $${state.totalCost.toFixed(2)}`);
    }

    // 添加 assistant 消息
    state.messages.push({ role: 'assistant', content: JSON.stringify(data.content) });

    // 检查是否有 tool_calls
    const toolCalls = data.content.filter((c: any) => c.type === 'tool_use');
    if (toolCalls.length === 0) {
      // 没有工具调用了 — 最终回答
      const text = data.content.find((c: any) => c.type === 'text')?.text ?? '';
      return parseFinalResult(text);
    }

    // 执行工具调用
    for (const tc of toolCalls) {
      const tool = tools.find(t => t.name === tc.name);
      if (!tool) {
        state.messages.push({
          role: 'user',
          content: `Error: unknown tool "${tc.name}"`
        });
        continue;
      }

      try {
        const result = await tool.execute(tc.input);
        state.messages.push({
          role: 'user',
          content: JSON.stringify({ tool_result: result.content })
        });
      } catch (error) {
        state.messages.push({
          role: 'user',
          content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  // 达到 maxSteps：强制结束
  throw new Error(`Agent reached max steps (${maxSteps}) without completing`);
}
```

#### 3.4 Agent System Prompt 设计

```ts
function buildAgentSystemPrompt(tools: AgentTool[]): string {
  return `你是 Visual Guard 的前端视觉回归修复 Agent。你可以使用以下工具自主完成修复任务。

## 工作流程

1. 使用 read_diff 了解差异情况
2. 使用 read_dom / read_file 定位问题源码
3. 使用 write_file 写入修复代码
4. 使用 run_command 验证修复（git diff、lint、test）
5. 使用 create_pull_request 提 PR（可选）
6. 使用 finish 输出最终修复报告

## 核心原则

- 每次只改必要的最小范围
- 修复前先理解上下文（read_file）
- 不确定的地方标记 confidence < 0.8，不要自动修复
- 达到目标后立即调用 finish 结束

## 工具列表

${tools.map(t => `- **${t.name}**: ${t.description}`).join('\n')}
`;
}
```

#### 3.5 Agent Hooks 机制

在 Agent Loop 的关键节点插入 hook，用于监控、日志、权限控制：

```ts
interface AgentHooks {
  /** 每步开始前 */
  beforeStep?(state: AgentState): void | Promise<void>;

  /** Tool 执行前 — 可用于权限检查 */
  beforeToolCall?(tool: string, params: Record<string, unknown>): boolean | Promise<boolean>;

  /** Tool 执行后 */
  afterToolCall?(tool: string, params: Record<string, unknown>, result: { content: string }): void | Promise<void>;

  /** 每步结束后 */
  afterStep?(state: AgentState): void | Promise<void>;

  /** Agent 完成 */
  onComplete?(result: { fixSuggestions: FixSuggestion[]; summary: string; steps: number; cost: number }): void | Promise<void>;
}
```

#### 3.6 MCP 协议扩展

Agent 的 Tool 集可以通过 MCP（Model Context Protocol）动态扩展，无需修改 Agent 核心代码。

```ts
/**
 * MCP Tool Provider — 将外部 MCP server 的 tools 注册到 Agent 的 Tool 集中。
 * 例如：接入 GitHub MCP server 后，Agent 可直接操作 Issues/PRs。
 */
interface MCPToolProvider {
  name: string;
  /** 连接 MCP server（stdio / SSE / streamable-http） */
  connect(config: MCPConnectionConfig): Promise<void>;
  /** 获取 MCP server 提供的 tools 列表 */
  listTools(): Promise<AgentTool[]>;
  /** 关闭连接 */
  disconnect(): Promise<void>;
}
```

**MCP 集成示意**：Visual Guard Agent 通过 MCP 可以接入外部能力（Git 操作、CI/CD、通知等），而 Agent Loop 完全不感知底层协议差异——统一走 `AgentTool.execute()` 接口。

#### 3.7 Skill 动态机制

Skill 是**可插拔的领域修复策略模块**。每个 Skill 封装一种修复模式，包含专属的 system prompt 片段和可选 tool。

```ts
interface AgentSkill {
  /** 技能名称 */
  name: string;
  /** 触发条件 — 判断该 Skill 是否适用于当前 diff */
  match(scenarioResult: ScenarioResult): boolean;
  /** 注入到 system prompt 的附加指令 */
  getPromptExtension(): string;
  /** 可选的专属 tools */
  getTools?(): AgentTool[];
}
```

**预置 Skill 列表：**

| Skill | match 条件 | 修复策略 |
|-------|-----------|---------|
| `css-pixel-fix` | `pixel.diffRatio > 0 && pixel.diffRatio < 0.05` | 小范围像素差异 → 检查 margin/padding/line-height |
| `layout-shift-fix` | `layout.changeCount > 0` | 元素位移 → 检查 flex/grid/position 属性 |
| `dom-structure-fix` | `dom.changeRatio > 0` | DOM 结构变化 → 可能是 SSR/CSR 差异或组件渲染问题 |
| `responsive-fix` | 多 viewport 场景 + 仅某 viewport 有差异 | 响应式断点问题 → 检查 media query / container |

```ts
// Skill 在 Agent 启动时动态注入
function applySkills(
  systemPrompt: string,
  skills: AgentSkill[],
  scenarioResult: ScenarioResult
): string {
  const matched = skills.filter(s => s.match(scenarioResult));
  if (matched.length === 0) return systemPrompt;

  const extensions = matched.map(s => s.getPromptExtension()).join('\n\n');
  return `${systemPrompt}\n\n## 激活的修复策略\n${extensions}`;
}
```

#### 3.8 完整 Agent 架构图

```text
┌─────────────────────────────────────────────────────────────┐
│                    Visual Guard AI Agent                     │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐              │
│  │  Skills  │   │  Hooks   │   │ MCP Provider│              │
│  │ (策略模块) │   │ (监控/权限)│   │ (外部工具)  │              │
│  └────┬─────┘   └────┬─────┘   └─────┬──────┘              │
│       │              │               │                       │
│       ▼              ▼               ▼                       │
│  ┌────────────────────────────────────────┐                 │
│  │           Agent Loop (核心)              │                 │
│  │                                         │                 │
│  │   while (step < maxSteps):              │                 │
│  │     beforeStep()                        │                 │
│  │     response = LLM(messages, tools)     │                 │
│  │     for tool_call in response:          │                 │
│  │       beforeToolCall() → 权限检查        │                 │
│  │       result = tool.execute(params)     │                 │
│  │       afterToolCall()                   │                 │
│  │     afterStep()                         │                 │
│  │   onComplete()                          │                 │
│  └────────────────────────────────────────┘                 │
│                              │                               │
│          ┌───────────────────┼───────────────────┐          │
│          ▼                   ▼                   ▼          │
│    ┌──────────┐      ┌──────────────┐    ┌────────────┐    │
│    │ Built-in │      │   Skill      │    │    MCP     │    │
│    │  Tools   │      │   Tools      │    │   Tools    │    │
│    └──────────┘      └──────────────┘    └────────────┘    │
│                                                              │
│  output: FixSuggestion[] + patch 文件 + (可选) PR URL         │
└─────────────────────────────────────────────────────────────┘
```

#### 3.9 Agent 与 Plugin 的关系

Plugin 是 runner 生命周期中的扩展点，Agent 是 plugin-ai 内部的自主执行引擎：

```text
plugin-ai (VisualGuardPlugin)
  │
  ├─ setup(api)
  │    ├─ api.on('afterCompare', handler)  ← 触发 Agent
  │    │
  │    │   handler(ctx):
  │    │     1. 构造 goal = "修复场景 ${ctx.scenario.name}"
  │    │     2. 加载 Skills (match → add prompt/tools)
  │    │     3. agentLoop(goal, tools, options)
  │    │     4. 收集 FixSuggestion[]
  │    │
  │    └─ api.on('afterReport', handler)   ← 汇总 + 提 PR
  │         handler(ctx):
  │           生成 patch 文件
  │           (可选) createPullRequest()
  │
  └─ (agentLoop 内部独立运行，不阻塞 runner)
```

#### 3.10 实施优先级

| 阶段 | 内容 | 复杂度 |
|------|------|--------|
| P0 | Agent Loop + 4 个核心 Tool (read_diff/write_file/finish) | 低 |
| P1 | Agent Hooks + 错误恢复 | 低 |
| P2 | Skill 系统 (css-pixel-fix, layout-shift-fix) | 中 |
| P3 | MCP 集成 (外部 Git/CI tool) | 中 |
| P4 | 多 Agent 协作 (perf agent + css agent 并行) | 高 |
