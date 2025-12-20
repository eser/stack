// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as writer from "@eser/writer";
import * as dotenv from "@eser/config/dotenv";
import * as sync from "./sync.ts";

import type { KubectlResourceReference } from "./types.ts";

export interface GenerateOptions {
  format: "yaml" | "json";
  resource: KubectlResourceReference;
  namespace?: string;
  env: string | undefined;
}

export const generate = async (options: GenerateOptions): Promise<string> => {
  // Register formats lazily when needed
  writer.registerBuiltinFormats();

  // Extract resource information
  const resourceType = options.resource.type;
  const resourceName = options.resource.name;
  const resourceNamespace = options.resource.namespace ?? options.namespace;

  // Load environment data using @eser/config
  const envMap = await dotenv.load({
    env: options.env,
    loadProcessEnv: false,
  });

  // Check if we have any data to generate
  if (envMap.size === 0) {
    return `# No environment data found to generate ${resourceType}/${resourceName}`;
  }

  // Build resource based on type
  let resource;

  if (resourceType === "secret") {
    resource = sync.buildSecretFromContext(
      resourceName,
      resourceNamespace,
      envMap,
    );
  } else {
    resource = sync.buildConfigMapFromContext(
      resourceName,
      resourceNamespace,
      envMap,
    );
  }

  // Use @eser/writer to serialize resource
  const writeOptions = {
    pretty: true,
  };

  return writer.write([resource], options.format, writeOptions);
};
