// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Handlers } from "../../../../../../server.ts";

export const handler: Handlers<undefined> = {
  GET(_req: Request, _ctx) {
    return new Response(JSON.stringify({}));
  },
};
