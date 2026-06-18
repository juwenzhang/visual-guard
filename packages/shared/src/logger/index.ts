import {createConsola} from 'consola';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5,
  Silent = 6
}

/**
 * 创建日志记录器
 * @param options - 日志选项
 * @returns 日志记录器实例
 */
export function createLogger(options?: {level?: LogLevel; tag?: string}) {
  const logger = createConsola({
    level: options?.level ?? LogLevel.Info
  });

  if (options?.tag) {
    logger.withTag(options.tag);
  }

  return logger;
}

/**
 * 默认日志记录器实例
 */
export const logger = createLogger({
  tag: 'visual-guard'
});

/**
 * 带标签的日志记录器工厂
 * @param tag - 标签名称
 * @returns 带标签的日志记录器
 */
export function useLogger(tag: string) {
  return logger.withTag(tag);
}
