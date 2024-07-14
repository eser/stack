// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as hex from "@std/encoding/hex";
import * as jsRuntime from "@eser/standards/js-runtime";

const env = jsRuntime.current.getEnv();

const deploymentId = env["DENO_DEPLOYMENT_ID"] ||
  // For CI
  env["GITHUB_SHA"] ||
  crypto.randomUUID();
const buildIdHash = await crypto.subtle.digest(
  "SHA-1",
  new TextEncoder().encode(deploymentId),
);

export let BUILD_ID = hex.encodeHex(buildIdHash);

export const setBuildId = (buildId: string) => {
  BUILD_ID = buildId;
};
