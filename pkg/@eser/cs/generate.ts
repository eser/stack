// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { write } from "@eser/writer";
import { parseEnvFromFile } from "@eser/config/dotenv";
import { buildConfigMapFromContext, buildSecretFromContext } from "./sync.ts";

import type { KubectlResourceReference } from "./types.ts";

export interface GenerateOptions {
  format: "yaml" | "json";
  resource: KubectlResourceReference;
  namespace?: string;
  envFile?: string;
  baseDir?: string;
}

export const generate = async (options: GenerateOptions): Promise<string> => {
  // Extract resource information
  const resourceType = options.resource.type;
  const resourceName = options.resource.name;
  const resourceNamespace = options.resource.namespace ?? options.namespace;

  // Require environment file for generate command
  if (!options.envFile) {
    throw new Error(
      "Environment file is required for generate command. Use -f flag to specify the file.",
    );
  }

  // Load environment file data using @eser/config
  const envFileData = await parseEnvFromFile(options.envFile);

  // Merge with system environment variables (system vars override file vars)
  const systemEnv = Deno.env.toObject();
  const envData: Record<string, string> = {
    ...envFileData,
    ...systemEnv,
  };

  // Check if we have any data to generate
  if (Object.keys(envData).length === 0) {
    return `# No environment data found to generate ${resourceType}/${resourceName}`;
  }

  // Build resource based on type
  let resource;

  if (resourceType === "secret") {
    resource = buildSecretFromContext(
      resourceName,
      resourceNamespace,
      envData,
    );
  } else {
    resource = buildConfigMapFromContext(
      resourceName,
      resourceNamespace,
      envData,
    );
  }

  // Use @eser/writer to serialize resource
  const writeOptions = {
    pretty: true,
  };

  return write([resource], options.format, writeOptions);
};
