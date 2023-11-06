// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Head, Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";

export default function SlotDemo() {
  return (
    <div>
      <Head>
        <title>Head merge</title>
        <meta name="foo" content="bar" />
        <meta property="og:foo" content="og value foo" />
        <style id="style-foo"></style>
      </Head>
      <Partial name="slot-1">
        <Fader>
          <p className="status-initial">Initial content</p>
        </Fader>
      </Partial>
      <p>
        <a
          className="update-link"
          href="/head_merge/injected"
          f-partial="/head_merge/update"
        >
          update
        </a>
      </p>
      <p>
        <a
          className="duplicate-link"
          href="/head_merge/injected"
          f-partial="/head_merge/duplicate"
        >
          duplicate
        </a>
      </p>
    </div>
  );
}
