// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutProps } from "../../../../../server.ts";

export default function FooLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p className="foo-layout">Foo layout</p>
      <Component />
    </div>
  );
}
