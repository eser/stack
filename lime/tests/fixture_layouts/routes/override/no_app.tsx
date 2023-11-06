// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type RouteConfig } from "../../../../server.ts";

export const config: RouteConfig = {
  skipAppWrapper: true,
};

export default function OverridePage() {
  return (
    <p className="no-app">
      no <code>_app.tsx</code> template
    </p>
  );
}
