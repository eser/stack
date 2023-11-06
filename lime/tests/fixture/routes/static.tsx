// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { asset } from "../../../runtime.ts";

export default function StaticPage() {
  return (
    <div>
      <p>This is a static page.</p>
      <img src={asset("/image.png")} />
    </div>
  );
}
