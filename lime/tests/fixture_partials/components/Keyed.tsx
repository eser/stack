// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ComponentChildren } from "react";

export function Keyed(props: { children?: ComponentChildren }) {
  return <>{props.children}</>;
}
