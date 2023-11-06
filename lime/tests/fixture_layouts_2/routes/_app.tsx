// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { defineApp } from "../../../server.ts";

export default defineApp((_req, { Component }) => {
  return (
    <div className="app">
      <Component />
    </div>
  );
});
