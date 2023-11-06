// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Handlers } from "$cool/lime/server.ts";

export const handler: Handlers = {
  GET(_req, _ctx) {
    throw new Deno.errors.NotFound();
  },
};
