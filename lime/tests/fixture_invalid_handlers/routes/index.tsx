import { type Handlers } from "$cool/lime/server.ts";

export const handlers: Handlers = {
  GET() {
    throw new Error("FAIL");
  },
};
