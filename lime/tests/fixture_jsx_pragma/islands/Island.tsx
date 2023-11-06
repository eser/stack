// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { IS_BROWSER } from "../../../runtime.ts";

export default function Island() {
  const id = IS_BROWSER ? "csr" : "ssr";

  return (
    <div>
      <p id={id}>{id}</p>
    </div>
  );
}
