// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineRoute, type RouteConfig } from "../../../../server.ts";
import { Head, Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";

export const config: RouteConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default defineRoute((req, ctx) => {
  return (
    <>
      <Head>
        <title>Head merge duplicated</title>
        <link rel="stylesheet" href="/style.css" />
        <style id="style-foo">{`p { color: green }`}</style>
      </Head>
      <Partial name="slot-1">
        <Fader>
          <h1>duplicated</h1>
          <p className="status-duplicated">duplicated content</p>
        </Fader>
      </Partial>
    </>
  );
});
