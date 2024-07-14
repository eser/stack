// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as jsRuntime from "@eser/standards/js-runtime";
import { wth } from "./wth.ts";

const group = "wth";

jsRuntime.current.bench("eser/fp/wth", { group, baseline: true }, () => {
  wth({ a: 1 }, { b: 2 });
});

jsRuntime.current.bench("spread operator", { group }, () => {
  const instance = { a: 1 };
  const mapping = { b: 2 };

  const _withResult = { ...instance, ...mapping };
});
