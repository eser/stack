// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute } from "../../../../server.ts";

export default defineRoute(() => {
  return new Response("", {
    status: 302,
    headers: {
      Location: "/keys",
    },
  });
});
