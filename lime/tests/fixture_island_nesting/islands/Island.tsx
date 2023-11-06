// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ComponentChildren } from "../../../runtime.ts";

export default function Island(props: { children?: ComponentChildren }) {
  return (
    <div className="island">
      {props.children}
    </div>
  );
}
