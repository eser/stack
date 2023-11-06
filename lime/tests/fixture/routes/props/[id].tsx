// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type PageProps } from "../../../../server.ts";

export default function Home(props: PageProps) {
  return <div>{JSON.stringify(props)}</div>;
}
