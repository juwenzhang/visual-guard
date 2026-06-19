# CSR / SSR 渲染原理与 Playwright 截图策略

## 目录

1. [核心问题](#核心问题)
2. [浏览器渲染原理基础](#浏览器渲染原理基础)
3. [常见性能指标辨析](#常见性能指标辨析)
4. [CSR 与 SSR 渲染原理](#csr-与-ssr-渲染原理)
5. [Playwright 对两种策略的处理机制](#playwright-对两种策略的处理机制)
6. [SSR 模式下的难点与根因分析](#ssr-模式下的难点与根因分析)
7. [代码映射：从问题到解决方案](#代码映射从问题到解决方案)
8. [设计启示](#设计启示)
9. [参考文献](#参考文献)

---

## 核心问题

在对 Next.js / Remix 等 **SSR streaming** 页面进行 `page.goto()` + `page.screenshot()` 操作后，调用 `page.close()` 时 Playwright 频繁抛出：

```
Error: There are some read requests waiting on finished stream
```

该错误并非截图本身的问题，而是 **Playwright 内部的 request lifecycle tracker** 在追踪流式响应（streaming response）时，tracker 的 pending reads 在页面关闭后异步爆出的未处理 reject。该 rejection 污染下一个 `await` 调用（如 `store.read()`、`diffPixel()`），导致整个流水线崩溃。

---

## 浏览器渲染原理基础

### 关键渲染路径（Critical Rendering Path）

浏览器将一个 URL 变成屏幕上可交互的像素，经历以下七个阶段：

```
① 网络层
  DNS 解析 → TCP 连接 → TLS 握手 → HTTP 请求 → 服务端响应
                                                      ↓
② HTML 解析                               字节流（Byte Stream）
  ┌─ 分词器（Tokenizer）将字节流切为 Token
  ├─ 树构建器（Tree Builder）将 Token 转为 DOM 节点
  └─ 遇到 <script> → 暂停解析，下载 + 执行 JS（阻塞 DOM 构建）
     遇到 <link>   → 并行下载 CSS，不阻塞 DOM 构建
     遇到 <img>    → 并行下载图片，不阻塞 DOM 构建
                                                      ↓
③ CSS 解析
  ┌─ 下载 CSS 文件（<link> 或 @import）
  ├─ 解析为 CSSOM（CSS Object Model）— 类似 DOM 的样式树
  └─ CSS 解析不阻塞 DOM 构建，但阻塞 Render Tree 生成
     ⚠️ CSS 是「渲染阻塞资源」
                                                      ↓
④ Render Tree（渲染树）
  ┌─ DOM + CSSOM → 合并生成 Render Tree
  ├─ display: none 的节点不参与
  ├─ 伪元素（::before / ::after）被加入
  └─ 每个节点携带计算后的样式（Computed Style）
                                                      ↓
⑤ Layout（布局 / 回流）
  ┌─ 计算每个可见元素的精确位置和尺寸
  ├─ 从根节点（viewport）开始，递归向下遍历
  ├─ 输出 Box Model：{x, y, width, height}
  └─ 百分比 / auto / flex / grid 等相对值在此阶段解析为绝对值
                                                      ↓
⑥ Paint（绘制）
  ┌─ 将 Layout 结果转为屏幕像素
  ├─ 绘制顺序：背景色 → 背景图 → 边框 → 子元素 → 文字
  ├─ 生成多个绘制图层（Layer）
  └─ 每个图层对应一个位图（Bitmap），发往 GPU
                                                      ↓
⑦ Composite（合成）
  ┌─ GPU 将多个图层合成为最终画面
  ├─ transform / opacity 的动画仅触发 Composite（性能最优）
  └─ 用户看到最终页面
```

### 渲染阻塞分析

| 资源类型 | 阻塞 DOM 构建 | 阻塞 Render Tree | 说明 |
|---------|:----------:|:--------------:|------|
| HTML 本身 | — | — | 逐步解析，可增量渲染 |
| `<script>`（无属性） | ✅ 是 | ✅ 是 | 完全阻塞，直到 JS 执行完毕 |
| `<script async>` | ❌ 否 | ⚠️ 可能 | 下载不阻塞，执行时暂停解析 |
| `<script defer>` | ❌ 否 | ⚠️ 可能 | DCL 前执行，不阻塞解析 |
| `<link rel="stylesheet">` | ❌ 否 | ✅ 是 | 不阻塞 DOM，但阻塞渲染 |
| `<img>` | ❌ 否 | ❌ 否 | 完全异步 |

### 重绘（Repaint）与回流（Reflow）

```
Reflow（回流）：
  元素的几何属性（位置、尺寸）改变时触发
  触发条件：width/height/padding/margin/display/position 改变
           DOM 节点增删 | 窗口 resize | 字体加载完成
  代价：Layout → Paint → Composite，全量重算
  ⚠️ SSR 的 Hydration 阶段会触发多次 Reflow

Repaint（重绘）：
  元素的视觉属性改变，但几何属性不变
  触发条件：color/background/visibility/box-shadow/outline 改变
  代价：Paint → Composite，跳过 Layout

GPU 加速属性（仅触发 Composite）：
  transform / opacity / filter / will-change
```

### 页面加载事件调度时间线

```
时间轴 → t=0（用户请求 URL）
────────────────────────────────────────────────────────────→ t=∞

① domLoading                                      ~ t+10ms
   浏览器开始解析第一个 HTML 字节
   无对应 DOM 事件，页面为空

② domInteractive                                  ~ t+50ms
   HTML 解析完毕，DOM 树构建完成
   ⚠️ CSS / 图片等子资源可能仍在加载
   可通过 document.readyState === 'interactive' 检测

③ domContentLoaded（DCL 事件）                     ~ t+80ms
   DOM + CSSOM 均就绪，Render Tree 可就绪
   ⚠️ 图片、字体、video 等外部资源可能仍在加载
   ⚠️ CSR 应用：此时页面仍是白屏（JS 尚未构建真实 DOM）
   ⚠️ SSR 应用：✅ 此时页面已有完整内容，可截图
   对应 Playwright：waitUntil: 'domcontentloaded'

④ firstPaint（FP）                                 ~ t+100ms
   浏览器首次向屏幕绘制任何像素
   可能仅是背景色/边框，非有意义内容
   仅通过 Performance API 检测，无对应 DOM 事件

⑤ firstContentfulPaint（FCP）                      ~ t+150ms
   浏览器首次绘制来自 DOM 的内容（文字/SVG/图片/Canvas）
   用户感知的「页面开始有内容」的时刻

⑥ load                                             ~ t+500ms
   页面及所有子资源（CSS/JS/图片/字体/iframe）全部加载完毕
   对应 Playwright：waitUntil: 'load'
   ⚠️ load 触发 ≠ 页面可交互（useEffect 可能还在跑）
   ⚠️ load 触发 ≠ 网络空闲（WebSocket / SSE 长连接仍活跃）
   ⚠️ SSR Hydration 通常在 load 附近完成

⑦ networkIdle（Playwright 特有）                  ~ t+1500ms
   500ms 内没有新的网络请求产生
   对应 Playwright：waitUntil: 'networkidle'
   ⚠️ 非 W3C 标准，Playwright 内部实现
   ⚠️ 对 CSR SPA 有效（数据加载完即真正的 idle）
   ⚠️ 对 SSR 可能永不满足（Suspense 持续的数据流）

⑧ largestContentfulPaint（LCP）                   不定时刻
   视口内最大可见元素完成渲染
   Google 推荐 < 2.5s
```

### 首次截图的「稳定态」问题

在任何渲染模式下，首次截图的时机都需要在「太快看不到内容」和「太慢浪费资源」之间权衡：

```
截图过早                                              截图过晚
   ↓                                                    ↓
页面仍空白/不完整                                    页面已完全稳定
   ↓                                                    ↓
SSR：domcontentloaded 前 → 页面残缺    →    SSR：domcontentloaded + 1s
CSR：load 事件前 → 白屏/loading状态    →    CSR：networkIdle + 1s
   ↓                                                    ↓
   ❌ 截图无意义                                       ✅ 截图高质量，但超时风险大
```

## 常见性能指标辨析

浏览器生态中常混用多个性能指标，以下梳理各自的定义、标准值和适用场景：

| 指标 | 全称 | 测量对象 | 标准值 | 何时触发 |
|------|------|---------|--------|---------|
| **FP** | First Paint | 首次绘制 | — | 任何像素首次出现在屏幕上 |
| **FCP** | First Contentful Paint | 首次内容绘制 | < 1.8s | 首次文字/图片/SVG/Canvas 渲染 |
| **LCP** | Largest Contentful Paint | 最大内容绘制 | < 2.5s | 视口内最大可见元素完成渲染 |
| **TTI** | Time to Interactive | 可交互时间 | < 3.8s（Lighthouse） | 主线程无长任务（>50ms）持续 5s |
| **TBT** | Total Blocking Time | 总阻塞时间 | < 200ms（Lighthouse） | FCP→TTI 之间所有长任务的阻塞时长 |
| **FID** | First Input Delay | 首次输入延迟 | < 100ms | 用户首次交互→浏览器响应 |
| **INP** | Interaction to Next Paint | 交互到下次绘制 | < 200ms | 用户交互→下一帧绘制（全生命周期） |
| **CLS** | Cumulative Layout Shift | 累计布局偏移 | < 0.1 | 可见元素意外移动的累计值 |
| **Speed Index** | Speed Index | 速度指数 | < 3.4s（Lighthouse） | 视口内容可见的速度 |

#### TTI vs INP — 最容易混淆的两个指标

```
TTI（Time to Interactive）
  测量阶段：页面加载阶段
  触发条件：主线程无长任务（>50ms）持续 5 秒
  前提条件：FCP 已发生 + 无超过 50ms 的长任务持续 5 秒
  局限性：
    - 非 W3C 标准（仅 Lighthouse 使用）
    - 2024 年已被 Google 从 Core Web Vitals 中移除
    - 不反映用户实际交互体验

INP（Interaction to Next Paint）
  测量阶段：整个页面生命周期
  测量方式：采集真实用户交互（RUM）
  触发条件：用户点击/触摸/键盘输入 → 浏览器处理 → 下一帧绘制
  优势：
    - Core Web Vitals（2024 年 3 月起替代 FID）
    - 反映用户真实体验
    - 动态测量，不只限于加载阶段
```

#### domInteractive 的地位

| 事件 | 相关指标 | 状态 |
|------|---------|------|
| `domInteractive` | 无直接关联 | DOM 构建完成的瞬时状态，非性能指标 |
| `domContentLoaded` | Speed Index 的参考点 | SSR 截图时机，CSR 无意义 |
| `load` | LCP 的上界 | 所有子资源完成 |
| — | TTI | 可交互（Lighthouse 计算） |
| — | INP | 交互响应延迟（RUM 收集） |

**关键理解**：`domInteractive` 是一个**状态**而非**指标**。它是 DOM 就绪的瞬时快照，不反映用户体验。INP 是从用户感知角度量化交互延迟，两者在概念上毫无关联。


---

## CSR 与 SSR 渲染原理

### CSR（Client-Side Rendering）

```
浏览器请求页面
  → 服务端返回最小骨架 HTML（通常只有 <div id="root"></div> + <script>）
  → 浏览器解析 HTML → domInteractive → domContentLoaded 事件触发
     ├─ 此时 DOM 几乎为空，Render Tree 几乎没有可绘制节点
     └─ ⚠️ 用户看到的是白屏（可能只有 CSS 指定的背景色）

  → JS bundle 下载（可能数百 KB → 数 MB）
  → JS 解析 + 执行（V8 引擎阶段）：
     ├─ React.createElement / Vue h() 创建 Virtual DOM
     ├─ ReactDOM.createRoot().render() / Vue.mount() 将 VDOM 转为真实 DOM
     ├─ ⚠️ 此过程触发大量 DOM 插入 → 多次 Reflow
     └─ 页面内容逐步渲染出来（用户看到 loading → 内容）

  → 框架发起 API 请求（fetch data）
  → 数据返回后 setState → 触发 Re-render → Reflow / Repaint
  → load 事件触发（图片、字体等子资源加载完毕）
     ⚠️ 但此时页面可能仍不稳定：
     ├─ React useEffect / watchEffect 仍在执行
     ├─ 图片懒加载（lazy loading）尚未触发
     ├─ CSS 动画 / transition 正在播放
     └─ route-level code splitting 仍在加载子路由模块

  → 通常需等到 networkidle（500ms 无新请求）确保完整渲染
```

**CSR 渲染耗时分解**：

| 阶段 | 耗时占比 | 说明 |
|------|---------|------|
| HTML 下载+解析 | ~5% | 空壳 HTML 仅几 KB |
| JS Bundle 下载 | ~30% | 主 bundle 可能 200KB-2MB |
| JS 解析+JIT 编译 | ~20% | V8 将源码转为机器码 |
| JS 执行（初始化渲染） | ~30% | React mount / Vue mount |
| API 请求+二次渲染 | ~15% | 数据加载 + setState |

### SSR（Server-Side Rendering）

```
浏览器请求页面
  → 服务端执行 React/Next.js 组件树（Node.js 运行时）
     ├─ getServerSideProps / loader 获取数据
     └─ ReactDOMServer.renderToString() / renderToPipeableStream() 生成 HTML
  → 服务端将 HTML 通过 HTTP Stream（Transfer-Encoding: chunked）逐步推送
     ⚠️ 流式优势：浏览器可增量解析，不等待全量生成

  → 浏览器接收 chunk1 → 解析 → 构建部分 DOM
  → 接收 chunk2 → 解析 → 追加 DOM 节点
  → ...
  → 接收 chunkN（final chunk）→ 流关闭

  → domInteractive → domContentLoaded 事件触发
     ├─ DCL 时所有 chunk 通常已到达
     ├─ DOM 树已包含完整的服务端渲染内容
     ├─ 用户已能看到完整页面（首屏有内容）
     └─ ✅ 此时截图可获取完整页面内容（SSR 最佳截图时机）

  → load 事件触发
     ├─ CSS / 图片 / 字体等子资源加载完毕
     ├─ ⚠️ load ≠ 网络空闲：
     │   ├─ Suspense 组件在客户端发起数据请求
     │   ├─ WebSocket / SSE 长连接保持活跃
     │   └─ Analytics SDK 持续发送 beacon
     └─ ⚠️ 底层 TCP stream 可能仍有未消费数据（Playwright bug 根源）

  → Hydration（水合）
     ├─ ReactDOM.hydrateRoot() 在客户端执行
     ├─ React 遍历服务端渲染的 DOM，比对 Virtual DOM
     ├─ 一致性检查通过 → 附加事件监听器
     ├─ ⚠️ Hydration Mismatch：服务端 ≠ 客户端 → 警告 + 重新渲染
     └─ Hydration 完成后页面变为可交互（Reactive）

  → 客户端激活后
     ├─ React useEffect 执行（仅在客户端运行）
     ├─ 客户端路由激活（Next.js Link 生效）
     └─ 动态导入（dynamic import）的组件模块开始加载
```

**SSR 渲染耗时分解**：

| 阶段 | 耗时占比 | 说明 |
|------|---------|------|
| 服务端数据获取 | ~40% | DB 查询 / API 调用 / BFF |
| 服务端 renderToString | ~20% | React 组件 → HTML 字符串 |
| HTML 流式传输 | ~15% | chunk 分块传输（受网速影响） |
| 浏览器解析 HTML | ~10% | 逐步构建 DOM（可与传输并行） |
| 子资源加载（CSS/图片） | ~10% | 与 HTML 解析并行 |
| Hydration（客户端） | ~5% | JS 执行 + 事件绑定 |

### 核心差异对比（按时间线对齐）

以浏览器发起请求为 t=0，对比同一页面在 CSR 和 SSR 模式下的状态：

| 时间线 | 事件 | CSR 页面状态 | SSR 页面状态 |
|-------|------|------------|------------|
| ~10ms | domLoading | 开始接收 HTML | 开始接收 HTML chunk |
| ~50ms | domInteractive | DOM 空壳，白屏 | 部分 DOM，可能有内容 |
| ~80ms | domContentLoaded | ❌ 白屏（仅 `<div id="root">`） | ✅ 完整内容已可见 |
| ~100ms | firstPaint | 可能仅是背景色 | ✅ 内容已绘制 |
| ~150ms | firstContentfulPaint | ❌ 仍白屏 | ✅ 文字/图片已显示 |
| ~500ms | load 附近 | JS 正在执行 | ✅ Hydration 中，可交互 |
| ~800ms | load 附近 | ⚠️ API 返回，内容刷新 | ✅ 内容稳定 |
| ~1200ms | load | ⚠️ 白屏 → 内容完成 | 所有资源加载完毕 |
| ~1500ms | networkIdle | ✅ 完全就绪 | ⚠️ 可能仍有 SSE/WS 长连接 |

**核心洞察**：

- CSR 的 `domcontentloaded` 对应白屏，截图无意义
- SSR 的 `domcontentloaded` 对应完整页面，是**最佳截图时机**
- `networkidle` 对 CSR 是可靠的截图信号；对 SSR 可能永远不触发
- SSR Hydration 阶段触发多次 Reflow，可能导致截图前后不一致

### 渲染策略对截图一致性的影响

```
CSR 截图风险：
  时机过早 → 白屏 / loading 状态 → 截图无效，diff 无意义
  时机合适 → 完整渲染 → 截图有效，diff 可反映真实变化
  时机过晚 → 动画/轮播改变布局 → 截图不稳定，基线漂移

SSR 截图风险：
  时机过早 → stream chunk 未完全接收 → 页面残缺 → 截图无效
  时机合适 → DCL 之后 + 子资源加载完毕 → 截图有效
  时机过晚 → Hydration + Suspense 改变 DOM → 基线漂移
  任何时机 → page.close() 后 stream cleanup → 污染后续 async 操作 ⚠️
```
## Playwright 对两种策略的处理机制

### 1. page.goto() 的 waitUntil 策略

```ts
// Playwright 支持的等待策略
await page.goto(url, { waitUntil: 'load' });            // 等 load 事件
await page.goto(url, { waitUntil: 'domcontentloaded' }); // 等 DOM 解析完成
await page.goto(url, { waitUntil: 'networkidle' });      // 等 500ms 内无新网络请求
```

**CSR 场景**：
- `networkidle` 是最佳选择——等 API 请求完成 + JS bundle 下载完成即可截图
- 此时页面已完全渲染

**SSR 场景**：
- `networkidle` 会等待所有网络连接结束，包括 SSE/WebSocket/streaming 长连接
- 如果 SSR 页面有 `Suspense` 或持续的数据推送，`networkidle` 可能**永不满足**或**超时**
- 推荐使用 `domcontentloaded`——DOM 解析完毕后 HTML 内容已可用，可直接截图

### 2. 事件监听器与 Request Tracker

Playwright 的 `page.on('response', ...)`、`page.on('request', ...)` 等事件监听在注册后会维护一个内部的 **Request Tracker**。

```
page.on('response', handler)
  → Playwright 内部注册 tracker
  → 每个请求/响应被 tracker 追踪
  → page.close() 时 tracker 检查是否有未完成的 reads
  → 如有 → 抛出 "read requests waiting on finished stream"
```

**CSR 场景**：
- 事件监听注册在 `goto` 之后，此时请求/响应已完成
- tracker 内的 reads 数量可控，关闭时无残留

**SSR 场景**：
- streaming 响应可能持续到 `goto` 完成之后
- 注册事件监听时 stream 仍有未消费的数据
- `page.close()` 时 tracker 检测到 pending reads → 抛出错误

### 3. serviceWorker 的影响

```
browser.newContext({ serviceWorkers: 'allow' })  // 默认
  → 页面注册的 SW 会拦截请求
  → SW 内部可能使用 fetch + ReadableStream
  → Playwright tracker 追踪 SW 内部的请求
  → 关闭时 SW 的流可能未释放
```

SSR 应用常注册 SW 用于缓存策略（Next.js 的 `next-pwa` 等），SW 内部的 fetch + stream 操作会进一步增加 Playwright 的追踪负担。

---

## SSR 模式下的难点与根因分析

### 错误传播链

```
1. page.goto(ssr-url) → browser 处理 HTTP stream chunk
2. 注册 page.on('response', ...) → Playwright 追踪流响应
3. page.screenshot() → 截图正常完成
4. page.close() → Playwright 尝试关闭 tracker
   ├─ tracker 发现：stream 的某些 chunk 还被 ReadableStream lock 持有
   ├─ 异步抛出 rejected promise（不可被 try-catch 捕获）
   └─ 错误"悬浮"在 event loop 的 microtask 队列中
5. await store.read(key) → event loop 处理到该 rejected promise
   → 错误被当前 await 接收 → 看起来像 store.read() 失败了
```

### 为什么 sleep(100) 不够

```
await page.close();
await sleep(100);  // 期望 Playwright 内部清理完成
await store.read(); // 但仍可能捕获错误
```

Playwright 的 tracker 清理是**异步且不可 cancel**的，其 rejected promise 可能在 sleep 后仍存在于 microtask 队列中。唯一可靠的方式是在**源头**减少 tracker 的追踪范围。

### 为什么并发会放大问题

- 2+ 页面并发截图时，多个 page 共享同一个 browser 实例
- 每个 page 的 close() 都可能触发独立的 tracker 清理
- 多个 rejected promise 在事件循环中累积
- 第一个 rejection 破坏 store.read()，后续操作全部失败

---

## 代码映射：从问题到解决方案

### 改动架构

```
配置层                  EngineContextOptions  + renderMode
                          ↓
适配器层（根源解决）     engine-playwright/src/index.ts
                          ├─ newContext  →  serviceWorkers: 'block'
                          ├─ goto       →  domcontentloaded（不追踪流）
                          └─ 事件监听   →  SSR 模式跳过注册
                          ↓
核心层（编排适配）       core/runner.ts
                          ├─ createContext 传 renderMode
                          └─ SSR 强制 concurrency = 1
```

### 1. 类型定义：`packages/shared/src/types/engine.ts`

```ts
export interface EngineContextOptions {
  // ... existing fields ...
  /** 渲染模式，SSR 模式会禁用 serviceWorker + 仅等 domcontentloaded */
  renderMode?: 'ssr' | 'csr' | 'auto';
}
```

**设计意图**：`renderMode` 放在 `EngineContextOptions` 而非全局配置，因为它直接影响浏览器 context 的创建参数。这是 "渲染策略 → 浏览器行为" 最直接的映射。

### 2. Adapter 层：`packages/engine-playwright/src/index.ts`

```ts
function createRuntime(browser: Browser): EngineRuntime {
  return {
    async createContext(options: EngineContextOptions): Promise<EngineContext> {
      const isSsr = options.renderMode === 'ssr';

      const context = await browser.newContext({
        // ... existing options ...
        serviceWorkers: isSsr ? 'block' : 'allow'  // ← 阻断 SW 流
      });
      return createContext(context, isSsr);
    }
  };
}
```

```ts
function createPage(page: Page, isSsr: boolean): EnginePage {
  return {
    async goto(url, options) {
      await page.goto(url, {
        timeout: options?.timeout,
        waitUntil: isSsr ? 'domcontentloaded' : (options?.waitUntil ?? 'load')
        //                 ↑ SSR 不用等网络，避免追踪 stream
      });
    },

    async waitForNetworkIdle(options) {
      if (!isSsr) {  // ← SSR 跳过，避免流式响应死锁
        await page.waitForLoadState('networkidle', { timeout: options?.timeout });
      }
    },

    onConsole(handler) {
      if (!isSsr) {  // ← SSR 不注册事件监听
        page.on('console', (msg) => { /* ... */ });
      }
    },
    // onRequest / onResponse 同理
  };
}
```

**三层防护策略**：
1. **Context 级**：`serviceWorkers: 'block'` — 阻止 SW 创建额外流
2. **Goto 级**：`domcontentloaded` — 不等网络请求完成，不追踪剩余 chunk
3. **Page 级**：跳过事件监听 — 不注册 Playwright 的 request tracker

### 3. Runner 层：`packages/core/src/runner.ts`

```ts
// SSR 模式不复用 context，各场景独立隔离
if (!context || config.renderMode === 'ssr') {
  context = await runtime.createContext({
    // ... existing options ...
    renderMode: config.renderMode  // ← 传递给 adapter
  });
}

// SSR 模式强制单线程，防止 tracker 错误累积
const maxConcurrency = config.renderMode === 'ssr'
  ? 1
  : (concurrency ?? config.concurrency ?? 4);
```

### 4. Diff 层：`packages/core/src/diff.ts`

```ts
// 补充：JSON 序列化/反序列化后 Buffer 变成普通对象
const baselineBuf = Buffer.isBuffer(baseline)
  ? baseline
  : Buffer.from((baseline as { data?: number[] }).data ?? []);
```

**问题背景**：基线截图以 Buffer 形式存储，经 JSON.stringify → fs.writeFile → fs.readFile → JSON.parse 后失去 Buffer 原型链，需手动还原。

---

## 设计启示

### 1. 分层解耦的威力

如果渲染模式切换逻辑写在 `capture.ts`（业务层），需要：
- 每处 `goto()` 判断 `mode === 'ssr'`
- 每个事件注册处判断 `mode === 'ssr'`
- `sleep(100)` 这种 hack

而将逻辑下放到 **adapter 层**：
- `capture.ts` 不感知渲染模式（回归纯净的截图逻辑）
- adapter 在创建 context/page 时一次性完成所有 SSR 适配
- 符合单一职责原则：**adapter 负责"怎么截图"，core 负责"截什么图"**

### 2. Playwright 的隐式状态

Playwright 并非纯函数式的 API——它维护大量内部状态（request tracker、service worker registry、browser context）。这些隐式状态在关闭时可能产生异步副作用（rejected promises），无法被常规的 try-catch 捕获。

**应对策略**：
- 减少 Playwright 需要追踪的操作（不注册不必要的事件监听）
- 隔离状态范围（SSR 不复用 context，各页独立）
- 降低并发度（减少同时活跃的 tracker 数量）

### 3. SSR 模式的取舍

| 能力 | CSR 模式 | SSR 模式 |
|------|---------|---------|
| 像素对比 | ✅ | ✅ |
| DOM 对比 | ✅ | ✅ |
| 网络记录采集 | ✅ | ❌（关闭事件监听） |
| 控制台消息采集 | ✅ | ❌（关闭事件监听） |
| 并发截图 | ✅（最多 N） | ⚠️（仅 1） |
| `networkidle` 等待 | ✅ | ❌（跳过） |

SSR 模式牺牲了网络/控制台数据的采集能力，换取了截图对比的稳定性。这是符合实际需求的——**截图对比是最核心的价值**，网络日志是锦上添花。

### 4. 未来优化方向

- **renderMode 自动检测**：通过 `page.content()` 检查 HTML 骨架大小或 `Suspense` 标签，自动推断渲染模式
- **混合模式**：同一项目内不同路由可能分别是 CSR/SSR，考虑在 `SceneConfig` 层级支持 `renderMode`
- **Tracker 显式清理**：探索 Playwright 官方 API（若有更新）来显式 flush/close request tracker

## 参考文献

### 浏览器渲染

1. [MDN — Critical Rendering Path](https://developer.mozilla.org/en-US/docs/Web/Performance/Critical_rendering_path)
2. [Google — Rendering Performance](https://web.dev/articles/rendering-performance)
3. [Google — The Anatomy of a Frame](https://aerotwist.com/blog/the-anatomy-of-a-frame/)（Paul Lewis）

### 页面加载事件

4. [MDN — Document: DOMContentLoaded event](https://developer.mozilla.org/en-US/docs/Web/API/Document/DOMContentLoaded_event)
5. [MDN — Window: load event](https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event)
6. [HTML Living Standard — Parsing HTML documents](https://html.spec.whatwg.org/multipage/parsing.html)

### 性能指标

7. [web.dev — Core Web Vitals](https://web.dev/articles/vitals)
8. [web.dev — INP (Interaction to Next Paint)](https://web.dev/articles/inp)
9. [web.dev — TTI (Time to Interactive)](https://web.dev/articles/tti)
10. [Google Chrome — Largest Contentful Paint](https://web.dev/articles/lcp)

### Playwright

11. [Playwright — Page.goto() waitUntil options](https://playwright.dev/docs/api/class-page#page-goto-option-wait-until)
12. [Playwright — BrowserContext.newContext() serviceWorkers](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-context-option-service-workers)
13. [Playwright — Network Events（request/response）](https://playwright.dev/docs/network)
15. [Playwright — Issue #8473: request tracker pending reads](https://github.com/microsoft/playwright/issues/8473)

### SSR 与 Streaming

15. [Next.js — Rendering: Server-side Rendering](https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering)
16. [React — renderToPipeableStream](https://react.dev/reference/react-dom/server/renderToPipeableStream)
17. [MDN — Transfer-Encoding: chunked](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Transfer-Encoding)

### 相关工具

18. [pixelmatch](https://github.com/mapbox/pixelmatch) — 像素级图片对比库
19. [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/) — 性能审计工具
20. [deep-diff](https://github.com/flitbit/diff) — JavaScript 对象/数组深度对比库

