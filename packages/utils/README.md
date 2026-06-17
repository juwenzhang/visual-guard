# @app/utils

Shared utility helpers for the **.** monorepo.
Depends on `@app/core` via `workspace:*`.

## Install

```bash
pnpm add @app/utils
```

## Usage

```ts
import {shout, makeGreeter} from '@app/utils';

console.log(shout('hello')); // HELLO!
const greeter = makeGreeter('Hey');
console.log(greeter.greet('World')); // Hey, World!
```

## Scripts

```bash
pnpm build       # build dist/ via tsup
pnpm dev         # watch-rebuild
pnpm typecheck   # tsc --noEmit
```

## Output formats

`esm + cjs + umd`. Configured in `tsup.config.*`.
