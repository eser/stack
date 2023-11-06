// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { PassThrough } from "../islands/PassThrough.tsx";

export default function Page() {
  return (
    <div id="page">
      <PassThrough>{() => {}}</PassThrough>
    </div>
  );
}
