// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

import metadata from "./metadata.json" assert { type: "json" };

export * as appserver from "./appserver/mod.ts";
export * as di from "./di/mod.ts";
// export * as directives from "./directives/mod.ts";
export * as dotenv from "./dotenv/mod.ts";
export * as events from "./events/mod.ts";
export * as fp from "./fp/mod.ts";
export * as functions from "./functions/mod.ts";
// export * as jsxRuntime from "./jsx-runtime/mod.ts";
// export * as lime from "./lime/mod.ts";
export * as parsing from "./parsing/mod.ts";
export * as standards from "./standards/mod.ts";

export { metadata };
