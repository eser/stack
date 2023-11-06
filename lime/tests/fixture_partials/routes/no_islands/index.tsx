// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../../runtime.ts";

export default function SlotDemo() {
  return (
    <div>
      <div className="output">
        <Partial name="slot-1">
          <p>Default content</p>
        </Partial>
      </div>
      <a
        className="update-link"
        href="/no_islands/injected"
        f-partial="/no_islands/update"
      >
        update
      </a>
    </div>
  );
}
