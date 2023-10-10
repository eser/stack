import { defineLayout } from "../../../server.ts";
import { type State } from "../other/state.ts";

export default defineLayout<State>((_req, ctx) => {
  return (
    <div className="layout">
      <p>
        Layout: {ctx.state.something === "foo" ? "it works" : "it doesn't work"}
      </p>
      <ctx.Component />
    </div>
  );
});
