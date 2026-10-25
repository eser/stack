// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
import { runtime } from "@eserstack/standards/cross-runtime";

export function main() {
  console.log(runtime.name);
}

// import.meta.main is true when this file is the program Node started.
if (import.meta.main) {
  main();
}
