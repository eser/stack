// Copyright 2023 the cool authors. All rights reserved. MIT license.

import FooIsland from "../islands/FooIsland.tsx";

export default async function Island() {
  await new Promise((r) => setTimeout(r, 10));
  return <FooIsland />;
}
