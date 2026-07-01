# AI 驱动的资源内容分析

> 状态：方案探讨 | 日期：2026-06-30 | 依赖：[04-ai-agent-design](./04-ai-agent-design.md) [06-trends-data-metrics](./06-trends-data-metrics.md)

## 一、问题背景

当前 diff 系统只做**数字对比**（pixel diff%、DOM 节点数、网络请求数），无法理解**内容变化**——例如：

- SVG 图标从 Material 风格迁移到 iOS SF Symbols 风格
- CSS 新增了 `.dark-mode` 全局主题变量
- JSON API 返回值结构从数组重构为对象

这些内容级别的变化需要**多模态 LLM** 来理解和描述。

## 二、核心思路

```
算法（计数 + 统计） → 喂给 AI（语义理解） → 输出自然语言描述

算法不分析内容，AI 不做数字计算。各司其职。
```

## 三、可采集的资源内容类型

### 3.1 SVG 图标文本

**采集方式**：进入采集队列还是合并进去缓存 -> 采集时间秒图之界采集 SVG图标对应的

采集方式：**在 capture 阶段注入脚本**，遍历页面中所有 `<img src="*.svg">` 和内联 `<svg>` 元素，`fetch` 外部 SVG 获取文本内容，存入 `Snapshot.inlinedResources.svgs`。

```ts
interface SVGSnapshot {
  url: string;           // 来源 URL（内联则为 "inline"）
  content: string;       // SVG 文本
  size: number;          // 字节数
}
```

### 3.2 CSS 样式表文本

**采集方式**：遍历 `document.styleSheets`，对每个可访问的 `CSSStyleSheet` 调用 `[].cssText`，拼接所有规则。

```ts
interface CSSSnapshot {
  url: string;           // <link href> 或 "inline"
  cssText: string;       // 完整 CSS 文本
  ruleCount: number;     // 规则数
}
```

### 3.3 JSON API 响应体

**采集方式**：在 `onResponse` 回调中，若 `content-type` 为 `application/json` 且响应体 < 100KB，提取文本内容。

```ts
interface JSONAPISnapshot {
  url: string;
  method: string;
  status: number;
  body: string;          // JSON 文本
}
```

## 四、资源对比策略

### 4.1 算法层：文本差异

使用 `diff` 库对同源资源进行文本 diff：

```ts
interface ResourceDiff {
  url: string;
  type: 'svg' | 'css' | 'json';
  oldSize: number;
  newSize: number;
  addedLines: number;
  removedLines: number;
  changedLines: number;
  patch: string;          // unified diff
}
```

### 4.2 AI 层：语义理解

将 `ResourceDiff.patch` 和资源类型传给 LLM，让它描述变化含义：

```
System: 你是前端资源变更分析专家。
User: 分析以下 SVG 图标的 diff 变更：
  
  + <svg viewBox="0 0 24 24" class="w-5 h-5">
  - <svg viewBox="0 0 20 20" class="w-4 h-4">

AI: 图标格线从 20×20 升级到 24×24，尺寸从 w-4 h-4 升级到 w-5 h-5，视觉上增大 25%。
```

## 五、接入 plugin-ai 的完整流程

```text
capture 阶段增强:
  ├─ fetchInlineSVGs()   → Snapshot.inlinedResources.svgs[]
  ├─ fetchCSS()          → Snapshot.inlinedResources.stylesheets[]
  └─ captureJsonAPIs()   → Snapshot.inlinedResources.jsonBodies[]
         │
         ▼
  写入 BaselineBundle.inlinedResources（持久化）
         │
         ▼
  diffResources(currentResources, baselineResources)
    → ResourceDiff[] (算法层：文本 diff 统计)
         │
         ▼
  plugin-ai (afterCompare hook):
    消费 ResourceDiff[] + pixel diff heatmap
         │
         ▼
    LLM 分析:
    "首页 3 个 SVG 图标路径从 24px 迁移到 20px 格线，视觉缩小 17%"
    "styles/main.css 新增 .dark-mode 规则集 47 条，疑似全局暗色主题上线"
    "/api/user 返回新增 avatar_url 字段，前端需要跟进展示"
```

## 六、AI Prompt 设计要点

### 6.1 SVG 分析 Prompt

```
你是 SVG 图标分析专家。分析以下 SVG 变更：

规则：
1. 对比 viewBox / width / height 的格线变化
2. 识别路径 (path/d) 的形状变更
3. 对比 fill / stroke 的颜色变更
4. 如果变更极小（1-2px），标记为「微调」
5. 输出一句话中文描述 + severity（major/minor/cosmetic）
```

### 6.2 CSS 分析 Prompt

```
你是 CSS 样式分析专家。分析以下 CSS 变更：

规则：
1. 识别新增/删除的选择器类型（class / id / element）
2. 判断是否为响应式样式（@media）、主题变量（:root 或 --*）、动画（@keyframes）
3. 检测颜色系统变更（hex/rgb/hsl 的语义化迁移）
4. 输出变更摘要：类型 + 影响范围 + severity
```

### 6.3 JSON API 分析 Prompt

```
你是 API 结构分析专家。分析以下 JSON 返回值变更：

规则：
1. 识别新增/删除/重命名的字段
2. 判断类型变更（string → object / array → number）
3. 检测结构变动（扁平化 / 嵌套加深 / 分页新增）
4. 输出一句话中文描述 + 是否需要前端跟进
```

## 七、成本评估

| 资源类型 | 单次 diff size | Token 消耗 (GPT-4o) | 单次成本 |
|---------|---------------|-------------------|--------|
| SVG (1 个图标) | ~2KB | ~500 tokens | ~$0.0025 |
| CSS (1 个文件) | ~50KB | ~12000 tokens | ~$0.06 |
| JSON API (1 个接口) | ~5KB | ~1200 tokens | ~$0.006 |

**优化策略**：仅对本次运行中**发生变更**的资源触发 AI 分析，未变的跳过。

## 八、实施优先级

| 阶段 | 内容 | 复杂度 |
|------|------|--------|
| P0 | capture 阶段 fetchInlineSVGs() + Snapshot.inlinedResources | 中 |
| P1 | ResourceDiff 文本对比 + BaselineBundle 持久化 | 低 |
| P2 | plugin-ai 消费 ResourceDiff → LLM 分析 | 中 |
| P3 | CSS 样式表采集 + 分析 | 中 |
| P4 | JSON API 响应体采集 + 分析 | 低 |
| P5 | 成本优化：变更检测 → 仅分析变更资源 | 低 |
