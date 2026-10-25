// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// `node --test etc/codemods` loads this folder through package.json's main,
// so every test file of the folder is imported here.
import "./benches.test.ts";
import "./lint-pragmas.test.ts";
import "./tests.test.ts";
