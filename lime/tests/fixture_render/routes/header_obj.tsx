// Copyright 2023 the cool authors. All rights reserved. MIT license.

import type { Handlers } from "../../../server.ts";

export const handler: Handlers<unknown, unknown> = {
  GET(_, ctx) {
    const headers = {
      "x-foo": "Hello world!",
    };
    return ctx.render(undefined, { headers });
  },
};

export default function Home() {
  return (
    <div>
      Should have <code>X-Foo</code> header set.
    </div>
  );
}
