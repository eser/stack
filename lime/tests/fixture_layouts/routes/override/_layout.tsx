// Copyright 2023 the cool authors. All rights reserved. MIT license.

import {
  type LayoutConfig,
  type LayoutProps,
} from "../../../../../lime/server.ts";

export const config: LayoutConfig = {
  skipInheritedLayouts: true,
};

export default function OverrideLayout({ Component }: LayoutProps) {
  return (
    <div className="override-layout">
      <Component />
    </div>
  );
}
