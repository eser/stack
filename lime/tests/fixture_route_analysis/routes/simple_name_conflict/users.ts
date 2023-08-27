import { Handlers } from "$cool/lime/server.ts";

export const handler: Handlers = {
  GET(_req, _ctx) {
    return new Response("hello");
  },
};
