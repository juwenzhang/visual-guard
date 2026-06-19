declare module 'pixelmatch' {
  export default function pixelmatch(
    img1: Buffer | Uint8Array,
    img2: Buffer | Uint8Array,
    output: Buffer | Uint8Array | null,
    width: number,
    height: number,
    options?: {
      threshold?: number;
      includeAA?: boolean;
    }
  ): number;
}

declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    constructor(options?: {width: number; height: number});
    static sync: {
      read(buf: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}

declare module 'deep-diff' {
  export interface Diff {
    kind: string;
    path?: string[];
    lhs?: unknown;
    rhs?: unknown;
  }
  export function diff(lhs: unknown, rhs: unknown): Diff[] | undefined;
}
