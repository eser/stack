#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as cliSupport from "@eserstack/codebase/cli-support";
import * as cli from "./main.ts";

// Executable entry point, so the CLI runs at startup. exitCli prints a failure
// message, sets the exit code and drains buffered output; see its docs for why
// the native FFI teardown needs the hard exit.
// deno-lint-ignore no-top-level-await
await cliSupport.exitCli(await cli.main());
