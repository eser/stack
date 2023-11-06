// Copyright 2023 the cool authors. All rights reserved. MIT license.

import Island from "../islands/Island.tsx";

export default function Home() {
  return (
    <div id="page">
      <Island>
        <p className="a">it works</p>
      </Island>
      <Island>
        <p className="b">it works</p>
      </Island>
    </div>
  );
}
