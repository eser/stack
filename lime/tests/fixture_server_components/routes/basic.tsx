// Copyright 2023 the cool authors. All rights reserved. MIT license.

export default async function Home() {
  await new Promise((r) => setTimeout(r, 10));
  return <h1>it works</h1>;
}
