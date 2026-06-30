# 1. 动态内容稳定策略

项目目录：
  ./packages/core/src/capture.ts

问题描述：
  1. 当前 capture.ts 中未注入任何页面稳定策略，仅使用 `page.evaluate()` 采集 DOM 快照
  2. 设计文档 §10 定义了 8 项稳定策略，均未实现
  3. 直接后果：页面中的时间戳、广告、轮播、动画等动态内容每次运行都会产生差异，导致大量误报
  4. 这是视觉回归工具准确性的基础能力，必须在其他增强之前完成

解决方案：
  1. 在 `captureScene()` 中新增 `injectStabilizers()` 阶段，在截图前将稳定脚本注入页面
  2. 冻结时间：覆盖 `Date.now()` 和 `new Date()` 为固定值（使用配置中的固定时间或采集启动时间）
  3. 禁用 CSS 动画：注入 `<style>` 覆盖 `animation-duration: 0s !important; transition-duration: 0s !important`
  4. 冻结 requestAnimationFrame：覆盖为立即执行回调或降频回调
  5. 可选冻结 setInterval：根据配置 `stabilize.freezeInterval` 决定是否覆盖
  6. 字体加载等待：调用 `document.fonts.ready` 等待字体加载完成
  7. 动态区域遮罩：在配置中已有的 `diff.ignoreRegions` 基础上，截图前对指定区域涂上固定色块
  8. 新增配置字段 `stabilize` 到 VisualGuardConfig：
     ```ts
     stabilize: {
       enabled: true,           // 默认开启
       freezeTime: true,        // 固定时间
       freezeDate: '2026-01-01T00:00:00Z',  // 可选自定义时间
       disableAnimations: true, // 禁用动画
       freezeRAF: true,         // 冻结 rAF
       freezeInterval: false,   // 默认不冻结 setInterval
       waitForFonts: true,      // 等待字体
       maskRegions: []          // 额外遮罩区域
     }
     ```
  9. 将 `injectStabilizers()` 放在 `page.goto()` 之后、`waitForSelector()` 之前执行
