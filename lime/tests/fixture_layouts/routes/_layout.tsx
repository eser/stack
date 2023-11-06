// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutProps } from "../../../server.ts";
import { type LayoutState } from "./_middleware.ts";

export default function RootLayout(
  { Component, state }: LayoutProps<unknown, LayoutState>,
) {
  return (
    <div className="root-layout">
      {state.something === "it works" ? "it works\n" : "it doesn't work\n"}
      <Component />
    </div>
  );
}
