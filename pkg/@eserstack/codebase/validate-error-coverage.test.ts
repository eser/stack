// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as validateErrorCoverage from "./validate-error-coverage.ts";

nodeTest.test("parseCliArgs reads --file and splits the lists", () => {
  assert.assertEquals(
    validateErrorCoverage.parseCliArgs([
      "--file",
      "errors.ts",
      "--error-objects=ERRORS, CODES",
      "--required-fields",
      "code,message",
    ]),
    {
      file: "errors.ts",
      errorObjects: ["ERRORS", "CODES"],
      requiredFields: ["code", "message"],
    },
  );
});

nodeTest.test("parseCliArgs leaves the file empty when it is missing", () => {
  assert.assertEquals(validateErrorCoverage.parseCliArgs([]), {
    file: "",
    errorObjects: undefined,
    requiredFields: undefined,
  });
});
