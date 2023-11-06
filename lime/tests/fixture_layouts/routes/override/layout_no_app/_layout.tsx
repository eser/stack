// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutConfig, type LayoutProps } from "../../../../../server.ts";

export const config: LayoutConfig = {
  skipAppWrapper: true,
};

export default function OverrideLayout({ Component }: LayoutProps) {
  return (
    <div className="no-app-layout">
      <Component />
    </div>
  );
}
