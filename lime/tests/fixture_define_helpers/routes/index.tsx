import { defineRoute } from "$cool/lime/server.ts";
import { delay } from "$cool/lime/tests/deps.ts";
import { type State } from "../other/state.ts";

export default defineRoute<State>(async (_req, ctx) => {
  await delay(10);
  return (
    <div className="page">
      <p>
        Page: {ctx.state.something === "foo" ? "it works" : "it doesn't work"}
      </p>
    </div>
  );
});