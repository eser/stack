#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as cliSupport from "@eserstack/codebase/cli-support";
import * as cli from "./main.ts";

// Executable entry point, so the CLI runs at startup. exitCli prints a failure
// message, drains buffered output and sets the exit code.
// oxlint-disable-next-line node/no-top-level-await
await cliSupport.exitCli(await cli.main());
