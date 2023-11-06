// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineApp } from "../../../server.ts";
import { type State } from "../other/state.ts";

export default defineApp<State>((req, ctx) => {
  ctx.state.something = "foo";
  return (
    <div className="app">
      <ctx.Component />
    </div>
  );
});
