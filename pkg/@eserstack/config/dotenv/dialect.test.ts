// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The .env dialect shared with the Go loader (TASK-319): the same fixture
 * gives the same values through dotenv/parser.ts here and through
 * pkg/ajan/configfx/envparser in its Go test.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as loader from "./loader.ts";

const FIXTURES = runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../ajan/configfx/envparser/testdata",
);

nodeTest.test(
  "the shared dialect fixture reads as the Go loader reads it",
  async () => {
    const text = await runtime.fs.readTextFile(`${FIXTURES}/dialect.env`);
    const expected = JSON.parse(
      await runtime.fs.readTextFile(`${FIXTURES}/dialect.json`),
    ) as Record<string, string>;

    assert.assertEquals({ ...loader.parseEnvString(text) }, expected);
  },
);
