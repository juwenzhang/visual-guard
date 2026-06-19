import {createHash} from 'node:crypto';

/**
 * 睡眠/等待函数
 * @param ms - 等待的毫秒数
 * @returns Promise<void>
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试选项
 */
export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'fixed' | 'exponential';
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * 重试函数
 * @param fn - 要重试的函数
 * @param options - 重试选项
 * @returns Promise<T>
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: 'fixed' | 'exponential';
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {maxAttempts = 3, delay = 1000, backoff = 'fixed', onRetry} = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        onRetry?.(attempt, error);
        const waitTime = backoff === 'exponential' ? delay * 2 ** (attempt - 1) : delay;
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
}

/**
 * 计算字符串的哈希值（使用 SHA-1）
 * @param str - 输入字符串
 * @returns 哈希值（十六进制字符串）
 */
// export function hash(str: string): string {
//   let hash = 0;
//   for (let i = 0; i < str.length; i++) {
//     const char = str.charCodeAt(i);
//     hash = (hash << 5) - hash + char;
//     hash = hash & hash; // 转换为32位整数
//   }
//   return Math.abs(hash).toString(16);
// }
export function hash(str: string): string {
  return createHash('sha1').update(str, 'utf8').digest('hex');
}

/**
 * 稳定序列化对象（保证 key 顺序一致）
 * @param obj - 要序列化的对象
 * @returns 稳定的 JSON 字符串
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(item => stableStringify(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj as object).sort();
  const pairs = sortedKeys.map(key => {
    const value = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${stableStringify(value)}`;
  });

  return `{${pairs.join(',')}}`;
}
