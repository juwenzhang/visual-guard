# @app/core

Primary library package of the **.** monorepo.

## Install

```bash
pnpm add @app/core
```

## Usage

```ts
import {Core} from '@app/core';

const core = new Core({greeting: 'Hi'});
console.log(core.greet('World')); // Hi, World!
```

## Scripts

```bash
pnpm build       # build dist/ via tsup
pnpm dev         # watch-rebuild
pnpm typecheck   # tsc --noEmit
```

## Output formats

`esm + cjs + umd`. Configured in `tsup.config.*`.
