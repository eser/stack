import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";
import SignalProp from "../../islands/SignalProp.tsx";
import { signal } from "@preact/signals-react";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  const sig = signal(0);
  return (
    <Partial name="slot-1">
      <Fader>
        <p className="status-update">update</p>
        <SignalProp sig={sig} />
      </Fader>
    </Partial>
  );
});
