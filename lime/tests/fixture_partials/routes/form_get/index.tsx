// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Partial } from "../../../../runtime.ts";
import { type PageProps } from "../../../../server.ts";
import { Logger } from "../../islands/Logger.tsx";

export default function SlotDemo(props: PageProps) {
  let value = props.url.searchParams.get("name") ?? "";

  value += value ? "_foo" : "";

  return (
    <div>
      <form action="/form_get">
        <Partial name="slot-1">
          <p className="status">Default content</p>
          <p>
            <input type="text" value={value} name="name" />
          </p>
          <Logger name="Form" />
          <p className="url">{props.url.toString()}</p>
        </Partial>
        <button type="submit" className="submit">
          submit
        </button>
      </form>
      <pre id="logs" />
    </div>
  );
}
