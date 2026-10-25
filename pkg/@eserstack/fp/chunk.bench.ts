// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as chunk from "./chunk.ts";
import * as lodashChunkModule from "lodash.chunk";

// lodash.chunk is CommonJS whose module.exports is one function; Node exposes
// it as the namespace's default export (types in lodash-modules.d.ts).
const lodashChunk = lodashChunkModule.default;

const group = "chunk";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/chunk", () => {
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        chunk.chunk(arr, 3);
      })
      .baseline();
    mitata.bench("npm:lodash.chunk", () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      lodashChunk(arr, 3);
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
