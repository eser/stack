// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Handler context — the dependency injection contract for registry handlers.
 *
 * All handlers receive this context via the `R` parameter of `Task<T, E, R>`.
 * Adapters provide the appropriate Output implementation:
 * - CLI: `output({ renderer: ansi(), sink: stdout() })`
 * - MCP: `output({ renderer: markdown(), sink: buffer() })`
 * - Test: `output({ renderer: plain(), sink: buffer() })`
 *
 * @module
 */

import type * as streams from "@eserstack/streams";

type HandlerContext = {
  readonly out: streams.Output;
};

export type { HandlerContext };
