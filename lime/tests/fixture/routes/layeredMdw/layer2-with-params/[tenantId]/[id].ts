import { type Handlers } from "../../../../../../server.ts";

export const handler: Handlers<undefined> = {
  GET(_req: Request, _ctx) {
    return new Response(JSON.stringify({}));
  },
};
