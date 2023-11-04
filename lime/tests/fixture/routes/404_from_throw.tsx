import { type Handlers } from "$cool/lime/server.ts";

export const handler: Handlers = {
  GET(_req, _ctx) {
    throw new Deno.errors.NotFound();
  },
};
