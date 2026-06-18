/**
 * DOM 节点快照
 */
export interface DomNodeSnapshot {
  tagName: string;
  id?: string;
  className?: string;
  attributes: Record<string, string>;
  text?: string;
  children: DomNodeSnapshot[];
  boundings: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyle?: Record<string, string>;
}

/**
 * 网络记录
 */
export interface NetworkRecord {
  url: string;
  method: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  timing: {
    startTime: number;
    domainLookupEnd?: number;
    connectEnd?: number;
    requestStart?: number;
    responseStart?: number;
    responseEnd: number;
    duration: number;
  };
  size?: number;
  fromCache?: boolean;
  fromServiceWorker?: boolean;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  navigation: {
    domContentLoaded: number;
    load: number;
    firstPaint?: number;
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    cumulativeLayoutShift?: number;
    timeToFirstByte?: number;
    interactionToNextPaint?: number;
  };
  resources: Array<{
    url: string;
    type: string;
    size: number;
    duration: number;
    startTime: number;
  }>;
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
  longTasks?: Array<{
    startTime: number;
    duration: number;
  }>;
}

/**
 * 无障碍树快照
 */
export interface AccessibilitySnapshot {
  role: string;
  name?: string;
  value?: string;
  children?: AccessibilitySnapshot[];
  boundings?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 页面快照
 */
export interface Snapshot {
  timestamp: string;
  url: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  dom: DomNodeSnapshot;
  screenshots: {
    fullPage?: string;
    elements?: Record<string, string>;
  };
  network: NetworkRecord[];
  console: Array<{
    type: string;
    text: string;
    location?: string;
  }>;
  performance?: PerformanceMetrics;
  accessibility?: AccessibilitySnapshot;
}
