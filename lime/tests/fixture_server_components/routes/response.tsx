// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { delay } from "../../deps.ts";

export default async function Foo() {
  await delay(1);
  return new Response("it works", { status: 200 });
}
