// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useSignal } from "@preact/signals-react";
import Counter from "../islands/Counter.tsx";
import { asset, Head } from "../../../runtime.ts";

export default function Home() {
  const signal = useSignal(0);
  return (
    <div>
      <Head>
        <link rel="stylesheet" href={asset("/style.css")} />
      </Head>
      <Counter id="counter" count={signal} />
    </div>
  );
}
