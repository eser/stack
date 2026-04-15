// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI trigger adapters — delegates to TUI adapters.
 *
 * CLI commands parse their own args into a TuiInput-compatible bag, then call
 * `createCliTriggers(bound)`. Underlying adapters and input shapes are
 * identical to TUI — only input collection differs.
 *
 * @module
 */

export { createTuiTriggers as createCliTriggers } from "../tui/triggers.ts";

export type {
  TuiInput as CliInput,
  TuiTriggers as CliTriggers,
} from "../tui/triggers.ts";
