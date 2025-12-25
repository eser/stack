// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as hex from "@std/encoding/hex";
import { runtime } from "@eser/standards/runtime";

// Lazy initialization state - computed on first getBuildId() call
const buildIdState: { current: string | null } = { current: null };
let initPromise: Promise<string> | null = null;

const computeBuildId = async (): Promise<string> => {
  const env = runtime.env.toObject();
  const deploymentId = env["DENO_DEPLOYMENT_ID"] ??
    // For CI
    env["GITHUB_SHA"] ??
    crypto.randomUUID();

  const buildIdHash = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(deploymentId),
  );

  return hex.encodeHex(buildIdHash);
};

export const getBuildId = (): Promise<string> => {
  if (buildIdState.current !== null) {
    return Promise.resolve(buildIdState.current);
  }

  if (initPromise === null) {
    initPromise = computeBuildId().then((id) => {
      buildIdState.current = id;
      return id;
    });
  }

  return initPromise;
};

export const setBuildId = (buildId: string): void => {
  buildIdState.current = buildId;
  initPromise = Promise.resolve(buildId);
};
