// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export * as colors from "jsr:@std/fmt@0.220/colors";
export * as hex from "jsr:@std/encoding@0.220/hex";
export * as path from "jsr:@std/path@0.220";
export * as regexpEscape from "jsr:@std/regexp@0.220/escape";

export * as esbuild from "npm:esbuild@0.20";
// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
// export * as esbuild from "npm:esbuild-wasm@0.20";

export { denoPlugins as esbuildDenoPlugins } from "jsr:@luca/esbuild-deno-loader@0.10";
