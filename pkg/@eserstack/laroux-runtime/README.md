# @eserstack/laroux-runtime

> **eserstack Product-Candidate** — Application runtime for laroux.js ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux-runtime`

Application runtime for the laroux.js framework. Extends
`@eserstack/app-runtime` with manifest loading, base URL management, and
development mode support.

## Usage

```typescript
import * as runtime from "@eserstack/laroux-runtime";

const instance = runtime.createRuntime()
  .setBaseUrl(import.meta.url)
  .loadManifest();

if (import.meta.main) {
  await instance.execute();
}
```

## API

| Export                     | Description                           |
| -------------------------- | ------------------------------------- |
| `createRuntime()`          | Create a new `LarouxRuntime` instance |
| `LarouxRuntime`            | Runtime class extending `AppRuntime`  |
| `createLarouxRuntimeState` | Create default runtime state          |
| `LarouxManifest`           | Manifest type (exports map)           |
| `LarouxRuntimeOptions`     | Runtime options (basePath)            |
| `LarouxRuntimeState`       | Full runtime state type               |

## License

Apache-2.0
