// biome-ignore-all lint/complexity/useLiteralKeys: Record 索引签名必须用字符串键访问（TypeScript TS4111）
import type {
  BaselineBundle,
  DiffConfig,
  DomDiffResult,
  LayoutDiffResult,
  NetworkDiffResult,
  PerformanceDiffResult,
  PixelDiffResult,
  Snapshot
} from '@visual-guard/shared';
import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';

/**
 * 像素对比
 *
 * @param current - 当前页面的 PNG 截图（Base64 或 Buffer）
 * @param baseline - 基线 PNG 截图（Buffer）
 * @param config - Diff 配置
 * @returns 像素对比结果，无法对比时返回 undefined
 */
export async function diffPixel(
  current: string | undefined,
  baseline: Buffer | Record<string, unknown> | undefined,
  config: DiffConfig
): Promise<PixelDiffResult | undefined> {
  if (!current || !baseline) {
    return undefined;
  }

  const currentBuf = Buffer.from(current, 'base64');
  // 基线可能已被 JSON 序列化/反序列化为普通对象，需要转换回 Buffer
  const baselineBuf = Buffer.isBuffer(baseline)
    ? baseline
    : Buffer.from((baseline as {data?: number[]}).data ?? []);

  const currentPng = PNG.sync.read(currentBuf);
  const baselinePng = PNG.sync.read(baselineBuf);

  if (currentPng.width !== baselinePng.width || currentPng.height !== baselinePng.height) {
    return {
      totalPixels: currentPng.width * currentPng.height,
      diffPixels: currentPng.width * currentPng.height,
      diffRatio: 1
    };
  }

  const {width, height} = currentPng;
  const diff = new PNG({width, height});
  const pixelConfig = config.pixel ?? {};

  const diffCount = pixelmatch(baselinePng.data, currentPng.data, diff.data, width, height, {
    threshold: pixelConfig.threshold ?? 0.1,
    includeAA: pixelConfig.includeAA ?? true
  });

  const totalPixels = width * height;

  return {
    totalPixels,
    diffPixels: diffCount,
    diffRatio: diffCount / totalPixels,
    diffImage: PNG.sync.write(diff).toString('base64')
  };
}

/**
 * DOM 对比
 *
 * @param current - 当前 DOM 快照
 * @param baseline - 基线 DOM 快照
 * @returns DOM 对比结果
 */
export async function diffDom(current: unknown, baseline: unknown): Promise<DomDiffResult> {
  // deep-diff 是 CJS 模块，ESM 下动态导入时结构不同
  const deepDiffModule = await import('deep-diff');
  // biome-ignore lint/suspicious/noExplicitAny: CJS 模块导入结构不确定
  const deepDiff = ((deepDiffModule as any).default?.diff ?? (deepDiffModule as any).diff) as (
    lhs: unknown,
    rhs: unknown
  ) => Array<{kind: string; path?: string[]; lhs?: unknown; rhs?: unknown}> | undefined;

  const changes = deepDiff(baseline, current) ?? [];

  const added: Array<Record<string, unknown>> = [];
  const removed: Array<Record<string, unknown>> = [];
  const changed: Array<{path: string; oldValue: unknown; newValue: unknown}> = [];

  for (const change of changes as Array<{
    kind: string;
    path?: string[];
    lhs?: unknown;
    rhs?: unknown;
  }>) {
    if (change.kind === 'N') {
      added.push(change.rhs as Record<string, unknown>);
    } else if (change.kind === 'D') {
      removed.push(change.lhs as Record<string, unknown>);
    } else if (change.kind === 'E' || change.kind === 'A') {
      changed.push({
        path: (change.path ?? []).join('.'),
        oldValue: change.lhs,
        newValue: change.rhs
      });
    }
  }

  const totalChanges = added.length + removed.length + changed.length;
  const totalNodes = _countNodes(current) + _countNodes(baseline);
  const changeRatio = totalNodes > 0 ? totalChanges / totalNodes : 0;

  return {
    added,
    removed,
    changed,
    unchanged: Math.max(0, totalNodes - totalChanges),
    changeRatio
  };
}

function _countNodes(tree: unknown): number {
  if (typeof tree !== 'object' || tree === null) return 0;
  if (Array.isArray(tree)) {
    let count = 0;
    for (const item of tree) {
      count += _countNodes(item);
    }
    return count;
  }
  let count = 1;
  for (const key of Object.keys(tree as Record<string, unknown>)) {
    const val = (tree as Record<string, unknown>)[key];
    if (key === 'children' && Array.isArray(val)) {
      count += _countNodes(val);
    }
  }
  return count;
}

/**
 * 布局对比
 *
 * @param current - 当前 DOM 快照
 * @param baseline - 基线 DOM 快照
 * @param config - Diff 配置
 * @returns 布局对比结果
 */
export async function diffLayout(
  current: unknown,
  baseline: unknown,
  config: DiffConfig
): Promise<LayoutDiffResult> {
  const maxDistance = config.layout?.maxDistance ?? 4;
  const moved: LayoutDiffResult['moved'] = [];
  const resized: LayoutDiffResult['resized'] = [];

  _compareLayout(current, baseline, '', maxDistance, moved, resized);

  return {
    moved,
    resized,
    changeCount: moved.length + resized.length
  };
}

/**
 * 从 DOM 节点构建可读的 CSS 选择器路径
 *
 * 例如：html > body > div#main > nav.header
 */
function _buildSelector(node: Record<string, unknown>): string {
  const tag = (node['tagName'] as string) ?? 'element';
  const id = node['id'] as string | undefined;
  const cls = node['className'];

  let sel = tag;
  if (id) sel += `#${id}`;
  if (cls) {
    // SVG 元素的 className 可能是 SVGAnimatedString 对象，取 baseVal
    const clsStr =
      typeof cls === 'string'
        ? cls
        : ((cls as Record<string, unknown>)['baseVal'] as string | undefined);
    if (clsStr && typeof clsStr === 'string') {
      sel += `.${clsStr.split(/\s+/).filter(Boolean).join('.')}`;
    }
  }
  return sel;
}

function _compareLayout(
  current: unknown,
  baseline: unknown,
  path: string,
  maxDistance: number,
  moved: LayoutDiffResult['moved'],
  resized: LayoutDiffResult['resized']
): void {
  if (typeof current !== 'object' || current === null) return;
  if (typeof baseline !== 'object' || baseline === null) return;

  const cur = current as Record<string, unknown>;
  const base = baseline as Record<string, unknown>;

  // 构建当前节点的可读选择器
  const nodeSelector = _buildSelector(cur);

  if (cur['boundings'] && base['boundings']) {
    const cb = cur['boundings'] as {x: number; y: number; width: number; height: number};
    const bb = base['boundings'] as {x: number; y: number; width: number; height: number};
    const dx = cb.x - bb.x;
    const dy = cb.y - bb.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxDistance) {
      moved.push({
        selector: nodeSelector,
        oldBounds: {x: bb.x, y: bb.y, width: bb.width, height: bb.height},
        newBounds: {x: cb.x, y: cb.y, width: cb.width, height: cb.height},
        distance
      });
    }

    if (cb.width !== bb.width || cb.height !== bb.height) {
      resized.push({
        selector: nodeSelector,
        oldBounds: {x: bb.x, y: bb.y, width: bb.width, height: bb.height},
        newBounds: {x: cb.x, y: cb.y, width: cb.width, height: cb.height}
      });
    }
  }

  const curChildren = Array.isArray(cur['children']) ? cur['children'] : [];
  const baseChildren = Array.isArray(base['children']) ? base['children'] : [];
  const maxLen = Math.max(curChildren.length, baseChildren.length);
  for (let i = 0; i < maxLen; i++) {
    _compareLayout(curChildren[i], baseChildren[i], '', maxDistance, moved, resized);
  }
}

/**
 * 网络对比
 *
 * @param current - 当前网络记录
 * @param baseline - 基线网络记录
 * @returns 网络对比结果
 */
export async function diffNetwork(
  current: Snapshot['network'],
  baseline: Snapshot['network']
): Promise<NetworkDiffResult> {
  const curUrls = new Set(current.map(r => r.url));
  const baseUrls = new Set(baseline.map(r => r.url));

  const added = current
    .filter(r => !baseUrls.has(r.url))
    .map(r => ({
      url: r.url,
      method: r.method,
      status: r.status,
      size: r.size ?? 0,
      duration: r.timing.duration
    }));

  const removed = baseline
    .filter(r => !curUrls.has(r.url))
    .map(r => ({
      url: r.url,
      method: r.method,
      status: r.status,
      size: r.size ?? 0,
      duration: r.timing.duration
    }));

  const timingChanges: NetworkDiffResult['timingChanges'] = [];
  const sizeChanges: NetworkDiffResult['sizeChanges'] = [];

  for (const cur of current) {
    const base = baseline.find(b => b.url === cur.url);
    if (!base) continue;

    const durDiff = Math.abs(cur.timing.duration - base.timing.duration);
    const oldDur = base.timing.duration;
    if (oldDur > 0 && durDiff / oldDur > 0.2) {
      timingChanges.push({
        url: cur.url,
        oldDuration: oldDur,
        newDuration: cur.timing.duration,
        changeRatio: durDiff / oldDur
      });
    }

    const curSize = cur.size ?? 0;
    const baseSize = base.size ?? 0;
    const sizeDiff = Math.abs(curSize - baseSize);
    if (sizeDiff > 1024) {
      sizeChanges.push({
        url: cur.url,
        oldSize: baseSize,
        newSize: curSize,
        changeBytes: curSize - baseSize
      });
    }
  }

  return {added, removed, timingChanges, sizeChanges};
}

/**
 * 性能对比
 *
 * @param current - 当前性能指标
 * @param baseline - 基线性能指标
 * @returns 性能对比结果
 */
export async function diffPerformance(
  current: Snapshot['performance'],
  baseline: BaselineBundle['performance']
): Promise<PerformanceDiffResult> {
  const regressions: PerformanceDiffResult['regressions'] = [];
  const improvements: PerformanceDiffResult['improvements'] = [];

  if (!current || !baseline) {
    return {
      regressions: [],
      improvements: [],
      summary: {totalMetrics: 0, regressed: 0, improved: 0, unchanged: 0}
    };
  }

  const curNav = current.navigation;
  const baseNav = baseline as {navigation: Record<string, number>};

  const metrics = Object.keys(curNav) as Array<keyof typeof curNav>;

  for (const metric of metrics) {
    const curVal = curNav[metric] as number;
    const baseVal = baseNav.navigation?.[metric];
    if (curVal === undefined || baseVal === undefined) continue;

    const change = curVal - baseVal;
    const changeRatio = baseVal > 0 ? change / baseVal : 0;

    if (changeRatio > 0.1) {
      regressions.push({
        metric: String(metric),
        baseline: baseVal,
        current: curVal,
        change,
        changeRatio
      });
    } else if (changeRatio < -0.1) {
      improvements.push({
        metric: String(metric),
        baseline: baseVal,
        current: curVal,
        change,
        changeRatio
      });
    }
  }

  const totalMetrics = regressions.length + improvements.length;
  return {
    regressions,
    improvements,
    summary: {
      totalMetrics,
      regressed: regressions.length,
      improved: improvements.length,
      unchanged: metrics.length - totalMetrics
    }
  };
}
