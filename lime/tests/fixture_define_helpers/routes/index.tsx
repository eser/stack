import { defineRoute } from "$cool/lime/server.ts";
import { delay } from "$cool/lime/tests/deps.ts";
import { State } from "../other/state.ts";

export default defineRoute<State>(async (req, ctx) => {
  await delay(10);
  return (
    <div class="page">
      <p>
        Page: {ctx.state.something === "foo" ? "it works" : "it doesn't work"}
      </p>
    </div>
  );
});
