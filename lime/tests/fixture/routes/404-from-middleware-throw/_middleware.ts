// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type MiddlewareHandlerContext } from "$cool/lime/server.ts";

// handlers are supposed to return something, so in order to make type checker on the manifest happy, we'll use any to escape it
export function handler(
  _req: Request,
  _ctx: MiddlewareHandlerContext,
  // deno-lint-ignore no-explicit-any
): any {
  throw new Deno.errors.NotFound();
}
