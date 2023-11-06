// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { IS_BROWSER } from "../../../runtime.ts";
import isNumber from "npm:is-number";

export default function Test() {
  let id = IS_BROWSER ? "browser" : "server";
  id += "-" + String(isNumber(1));
  return <div id={id}>{id}</div>;
}
