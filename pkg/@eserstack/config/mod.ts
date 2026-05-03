// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export {
  type ConfigItem,
  type ConfigItemMeta,
  type ContainerReadable,
  type Provider,
  type RequestContext,
  type Source,
  type SourceState,
} from "./primitives.ts";
export { Config, type ConfigState, createConfigState } from "./config.ts";
export {
  createDotenvSourceState,
  DotenvSource,
  type DotenvSourceState,
} from "./dotenv-source.ts";

// FFI-backed config value loader
export * from "./business/mod.ts";
export * from "./adapters/ffi/mod.ts";

import * as business from "./business/config.ts";
import * as ffiAdapter from "./adapters/ffi/mod.ts";

export const load = (
  sources: business.ConfigSource[],
  opts?: business.ConfigOptions,
): Promise<business.ConfigValues> => business.loadWith(ffiAdapter.ffiLoader, sources, opts);
