// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useReducer } from "react";

export default function Page() {
  useReducer(() => {}, undefined);
  return <h1>useReducer</h1>;
}
