import { defineRoute, type RouteConfig } from "$cool/lime/server.ts";
import { Partial } from "$cool/lime/runtime.ts";
import CounterA from "../../islands/CounterA.tsx";
import CounterB from "../../islands/CounterB.tsx";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <>
      <Partial name="slot-1">
        <Fader>
          <p className="status-1">updated content {Math.random()}</p>
          <CounterA />
        </Fader>
      </Partial>
      <Partial name="slot-2">
        <Fader>
          <h1>Another page</h1>
          <p className="status-2">updated content {Math.random()}</p>
          <CounterB />
        </Fader>
      </Partial>
    </>
  );
});
