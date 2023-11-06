// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../runtime.ts";

export default function SlotDemo() {
  return (
    <div>
      <h1 id="foo">Same nav</h1>
      <a href="#foo">#foo</a>
      <Partial name="foo">
        <p className="partial-text">
          foo partial
        </p>
      </Partial>
    </div>
  );
}
