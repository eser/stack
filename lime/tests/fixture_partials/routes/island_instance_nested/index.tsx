// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../../runtime.ts";
import CounterA from "../../islands/CounterA.tsx";
import CounterB from "../../islands/CounterB.tsx";
import PassThrough from "../../islands/PassThrough.tsx";

export default function SlotDemo() {
  return (
    <div>
      <Partial name="slot-1">
        <PassThrough>
          <div className="inner">
            <p>server content</p>
            <CounterA />
          </div>
          <hr />
          <PassThrough>
            <p>another pass through</p>
            <CounterB />
          </PassThrough>
        </PassThrough>
      </Partial>
      <hr />
      <p>
        <a
          className="update-link"
          href="/island_instance_nested/injected"
          f-partial="/island_instance_nested/partial"
        >
          update
        </a>
      </p>
      <p>
        <a
          className="replace-link"
          href="/island_instance_nested/injected"
          f-partial="/island_instance_nested/replace"
        >
          replace
        </a>
      </p>
      <pre id="logs" />
    </div>
  );
}
