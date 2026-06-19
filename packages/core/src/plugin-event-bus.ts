import {logger} from '@visual-guard/shared';
import mitt, {type Emitter} from 'mitt';
import type {HookEvents} from './types';

/**
 * Promise 超时包装器
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise;

  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(label)), ms));

  return Promise.race([promise, timeout]);
}

/**
 * Plugin 事件总线
 *
 * 基于 mitt 封装，增加 async handler 支持、超时保护和错误隔离。
 */
export class PluginEventBus {
  private emitter: Emitter<HookEvents>;
  private defaultTimeout: number;

  constructor(options?: {defaultTimeout?: number}) {
    this.emitter = mitt<HookEvents>();
    this.defaultTimeout = options?.defaultTimeout ?? 30_000;
  }

  /** 注册事件处理器 */
  on<K extends keyof HookEvents>(
    name: K,
    handler: (ctx: HookEvents[K]) => void | Promise<void>
  ): void {
    this.emitter.on(name, handler);
  }

  /** 取消注册 */
  off<K extends keyof HookEvents>(
    name: K,
    handler: (ctx: HookEvents[K]) => void | Promise<void>
  ): void {
    this.emitter.off(name, handler);
  }

  /**
   * 触发事件 — 逐个 await handler，隔离异常，超时保护
   */
  async emit<K extends keyof HookEvents>(
    name: K,
    context: HookEvents[K],
    timeout?: number
  ): Promise<void> {
    const handlers = this.emitter.all.get(name);
    if (!handlers) return;

    const effectiveTimeout = timeout ?? this.defaultTimeout;

    for (const handler of handlers) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (handler as any)(context);
        if (result instanceof Promise) {
          await withTimeout(
            result,
            effectiveTimeout,
            `Plugin hook "${String(name)}" 超时 (${effectiveTimeout}ms)`
          );
        }
      } catch (_error: unknown) {
        const error = _error as Error;
        logger.warn(`Plugin hook "${String(name)}" 执行失败: ${error?.message ?? String(_error)}`);
      }
    }
  }

  /** 清空所有事件（用于 teardown） */
  clear(): void {
    this.emitter.all.clear();
  }
}
