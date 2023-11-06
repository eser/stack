// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { RouteConfig } from "../../../../server.ts";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
};

export default function PageB() {
  return (
    <Fader>
      <h1>Page C</h1>
      <span className="page-c-text">
        <p>asdfasdf asdf asdf</p>
      </span>
    </Fader>
  );
}
