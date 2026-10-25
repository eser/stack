// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runs the http-scenario.ts contract against `runtime.http` on the runtime
 * that runs this file, and prints what it observed as one JSON object. The
 * Node and Bun adapter tests run it (see probes.ts).
 *
 * @module
 */

import * as crossRuntime from "../../mod.ts";
import * as httpScenario from "./http-scenario.ts";

// The probe is a program: its output is the result.
// oxlint-disable-next-line node/no-top-level-await
const result = await httpScenario.exerciseHttp(crossRuntime.runtime.http);
crossRuntime.runtime.process.writeToStdout(
  new TextEncoder().encode(JSON.stringify(result)),
);
