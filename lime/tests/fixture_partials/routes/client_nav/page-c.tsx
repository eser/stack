import { type RouteConfig } from "$cool/lime/server.ts";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
};

export default function PageC() {
  return (
    <Fader>
      <h1>Page C</h1>
      <span className="page-c-text">
        <p>asdfasdf asdf asdf</p>
      </span>
    </Fader>
  );
}
