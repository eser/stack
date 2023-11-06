// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Handlers } from "../../../server.ts";

export const handler: Handlers = {
  GET(_req, ctx) {
    return new Response((ctx.remoteAddr as Deno.NetAddr).hostname);
  },
};
