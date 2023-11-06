// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutProps } from "../../../../server.ts";

export default function Layout({ Component }: LayoutProps) {
  return (
    <div f-client-nav>
      <Component />
    </div>
  );
}
