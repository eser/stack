// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { IS_BROWSER } from "../../../runtime.ts";

export default function Home() {
  return (
    <div>
      <p>{IS_BROWSER ? "Viewing browser render." : "Viewing JIT render."}</p>
    </div>
  );
}
