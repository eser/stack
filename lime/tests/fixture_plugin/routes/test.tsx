// Copyright 2023 the cool authors. All rights reserved. MIT license.

import {
  type HandlerContext,
  type Handlers,
  type PageProps,
} from "../../../server.ts";

export const handler: Handlers<unknown, { test: string }> = {
  async GET(_req, ctx: HandlerContext<unknown, { test: string }>) {
    const resp = await ctx.render();
    return resp;
  },
};

export default function Home(props: PageProps<unknown, { test: string }>) {
  const value = props.state.test;
  return (
    <div>
      <h1>{value}</h1>
    </div>
  );
}
