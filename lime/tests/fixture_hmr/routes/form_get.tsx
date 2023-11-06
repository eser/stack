// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type PageProps } from "../../../server.ts";

export default function SlotDemo(props: PageProps) {
  let value = props.url.searchParams.get("name") ?? "";

  value += value ? "_foo" : "";

  return (
    <div>
      <h1>Form</h1>
      <form action="/form_get">
        <p className="status">Default content</p>
        <p>
          <input type="text" value={value} name="name" />
        </p>
        <p className="url">{props.url.toString()}</p>
        <button type="submit" className="submit">
          submit
        </button>
      </form>
    </div>
  );
}
