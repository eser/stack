// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutProps } from "../../../../../server.ts";

export default function BarLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p className="bar-layout">Bar layout</p>
      <Component />
    </div>
  );
}
