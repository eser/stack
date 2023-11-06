// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ComponentChildren } from "react";

export function PassThrough(props: { children: ComponentChildren }) {
  return <div>{props.children}</div>;
}
