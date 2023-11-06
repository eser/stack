// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "$cool/lime/runtime.ts";
import { type ComponentChildren } from "react";
import { Fader } from "../../islands/Fader.tsx";
import { Logger } from "../../islands/Logger.tsx";

export function Inner() {
  return (
    <Partial name="inner">
      <Logger name="inner">
        <Fader>
          <p className="status-inner">inner</p>
        </Fader>
      </Logger>
    </Partial>
  );
}

function Outer({ children }: { children: ComponentChildren }) {
  return (
    <Partial name="outer">
      <Logger name="outer">
        <Fader>
          <p className="status-outer">outer</p>

          {children}
        </Fader>
      </Logger>
    </Partial>
  );
}

export default function SlotDemo() {
  return (
    <div>
      <Outer>
        <Inner />
      </Outer>
      <p>
        <button
          className="update-outer"
          f-partial="/nested/outer"
        >
          update outer component
        </button>
        <button
          className="update-inner"
          f-partial="/nested/inner"
        >
          update inner component
        </button>
      </p>
      <pre id="logs" />
    </div>
  );
}
