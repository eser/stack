// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { write } from "@eser/writer";
import { load as loadEnv } from "@eser/config/dotenv";
import type {
  ConfigMap,
  KubectlResourceReference,
  Secret,
  SyncOptions,
} from "./types.ts";

interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
  };
  data?: Record<string, string>;
  stringData?: Record<string, string>;
}

export const executeKubectl = async (
  resource: KubectlResourceReference,
): Promise<string[]> => {
  const resourceType = resource.type === "configmap" ? "cm" : "secret";
  const namespaceFlag = resource.namespace ? `-n ${resource.namespace}` : "";

  const command =
    `kubectl get ${resourceType}/${resource.name} ${namespaceFlag} -o json | jq -r '.data | keys[]'`;

  const kubectlProcess = new Deno.Command("sh", {
    args: ["-c", command],
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stdout, stderr } = await kubectlProcess.output();

  if (!success) {
    const errorMessage = new TextDecoder().decode(stderr);
    throw new Error(`kubectl command failed: ${errorMessage}`);
  }

  const output = new TextDecoder().decode(stdout);
  const keys = output.trim().split("\n").filter((key) => key.length > 0);

  return keys;
};

export const readEnvironmentValues = async (
  keys: string[],
  _envFile?: string,
): Promise<Record<string, string>> => {
  // Load environment variables using @eser/config
  const envMap = await loadEnv({ baseDir: "." });

  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = envMap.get(key);
    if (value !== undefined) {
      result[key] = value;
    } else {
      console.warn(
        `Warning: Environment variable ${key} not found in environment`,
      );
    }
  }

  return result;
};

export const buildSecretFromContext = (
  name: string,
  namespace: string | undefined,
  data: Record<string, string>,
): Secret => {
  const encodedData: Record<string, string> = {};

  // Encode data to base64 for Secrets
  for (const [key, value] of Object.entries(data)) {
    encodedData[key] = btoa(value);
  }

  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      ...(namespace && namespace !== "default" ? { namespace } : {}),
    },
    data: encodedData,
    type: "Opaque",
  };
};

export const buildConfigMapFromContext = (
  name: string,
  namespace: string | undefined,
  data: Record<string, string>,
): ConfigMap => {
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      ...(namespace && namespace !== "default" ? { namespace } : {}),
    },
    data,
  };
};

export const sync = async (options: SyncOptions): Promise<string> => {
  try {
    // Get keys from Kubernetes resource
    const keys = await executeKubectl(options.resource);

    if (keys.length === 0) {
      return `# No data found in ${options.resource.type}/${options.resource.name}`;
    }

    // Read environment variable values
    const envData = await readEnvironmentValues(keys, options.envFile);

    if (Object.keys(envData).length === 0) {
      return `# No matching environment variables found for ${options.resource.type}/${options.resource.name}`;
    }

    // Build the appropriate resource type
    let resource: ConfigMap | Secret;

    if (options.resource.type === "secret") {
      resource = buildSecretFromContext(
        options.resource.name,
        options.resource.namespace,
        envData,
      );
    } else {
      resource = buildConfigMapFromContext(
        options.resource.name,
        options.resource.namespace,
        envData,
      );
    }

    // Generate output based on format
    const format = options.format ?? "yaml";
    const writeOptions = {
      pretty: true,
    };

    return write([resource], format, writeOptions);
  } catch (error) {
    throw new Error(
      `Failed to sync with kubectl: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

export const syncApply = async (options: SyncOptions): Promise<string> => {
  const manifest = await sync(options);

  if (manifest.startsWith("# No")) {
    return manifest;
  }

  return `echo '${manifest.replace(/'/g, "'\"'\"'")}' | kubectl apply -f -`;
};
