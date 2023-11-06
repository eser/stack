// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../runtime.ts";

export default function InvalidSlot() {
  return (
    <div className="island">
      <Partial name="invalid">
        <h1>it doesn't work</h1>
      </Partial>
    </div>
  );
}
