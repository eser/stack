# 🎛️ [@eserstack/laroux-runtime](./)

> **Note:** JSR is frozen at 4.5.x. `@eserstack/laroux-runtime` is removed in
> 5.0.0 and is not published to npm; its JSR versions stay available but get no
> updates. The CHANGELOG Migration section names its replacement.

> **eserstack Product-Candidate** · Application runtime for laroux.js ·
> [eser/stack on GitHub](https://github.com/eser/stack) · **Install:**
> `pnpm add jsr:@eserstack/laroux-runtime`

Application runtime for the laroux.js framework. Extends
`@eserstack/app-runtime` with manifest loading, base URL management, and
development mode support.

## Quick Start

Create a runtime, read the manifest next to your entry module, and start once
the manifest is loaded:

```typescript
import * as larouxRuntime from "@eserstack/laroux-runtime";

const instance = larouxRuntime
  .createRuntime()
  .setBaseUrl(import.meta.url)
  .loadManifest();

if (import.meta.main) {
  await instance.execute();
}
```

## Manifests

`loadManifest(baseDir?)` looks in `baseDir` (default `.`, resolved against the
URL given to `setBaseUrl`) for `manifest.yaml`, `manifest.jsonc`,
`manifest.json` and `manifest.toml`, in that order, and adds the first one it
finds to `state.manifests`. A directory without a manifest adds nothing.

The read runs in the background, and `start()` and `execute()` wait for it. When
the file cannot be read or parsed, they reject with a `LarouxManifestLoadError`:
its `searchDir` names the directory, and its `cause` holds the underlying error,
such as a `ConfigParseError` with the file path.

## API

| Export                     | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `createRuntime()`          | Create a new `LarouxRuntime` instance              |
| `LarouxRuntime`            | Runtime class extending `AppRuntime`               |
| `createLarouxRuntimeState` | Create default runtime state                       |
| `LarouxManifestLoadError`  | Error `start()` rejects with when a manifest fails |
| `LarouxManifest`           | Manifest type (exports map)                        |
| `LarouxRuntimeOptions`     | Runtime options (basePath)                         |
| `LarouxRuntimeState`       | Full runtime state type                            |

`LarouxRuntime` adds these methods to `AppRuntime`; all but `start()` and
`execute()` return the runtime, so calls chain:

| Method                   | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `setBaseUrl(url)`        | URL that `loadManifest` resolves directories against, or `null` |
| `addManifest(manifest)`  | Adds a manifest object                                          |
| `loadManifest(baseDir?)` | Starts reading a manifest file, as described above              |
| `dev()`                  | Adds the development run mode                                   |
| `start()`, `execute()`   | Wait for the pending work, such as manifest reads               |

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `LarouxRuntime.start()` and `execute()` reject with `LarouxManifestLoadError`
  (with `searchDir` and `cause`) when a manifest fails to load, instead of the
  raw `@eserstack/config/file` error. Before:
  `error instanceof ConfigParseError`. After:
  `error instanceof larouxRuntime.LarouxManifestLoadError`, or
  `error.cause instanceof ConfigParseError`.

## License

Apache-2.0

## 🔗 Links

- [eser/stack on GitHub](https://github.com/eser/stack)
- [`@eserstack/app-runtime`](../app-runtime/README.md): the runtime this package
  extends
- [`@eserstack/laroux`](../laroux/README.md): the framework-agnostic laroux.js
  core
- [`@eserstack/config`](../config/README.md): the file loader that reads the
  manifests
