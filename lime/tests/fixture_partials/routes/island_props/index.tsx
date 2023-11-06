// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../../runtime.ts";
import PropIsland from "../../islands/PropIsland.tsx";

export default function PropsDemo() {
  return (
    <div>
      <Partial name="slot-1">
        <p className="status-initial">initial</p>
        <PropIsland
          boolean={true}
          number={1}
          obj={{ foo: 123 }}
          strArr={["foo"]}
          string="foo"
        />
      </Partial>
      <p>
        <a
          className="update-link"
          href="/island_props/injected"
          f-partial="/island_props/partial"
        >
          Update
        </a>
      </p>
      <pre id="logs" />
    </div>
  );
}
