// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { write } from "@eser/writer";
import { type EnvMap, load } from "@eser/config/dotenv";
import type {
  ConfigMap,
  KubectlResourceReference,
  Secret,
  SyncOptions,
} from "./types.ts";

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

export const buildSecretFromContext = (
  name: string,
  namespace: string | undefined,
  data: EnvMap,
): Secret => {
  const encodedData: Record<string, string> = {};

  // Encode data to base64 for Secrets
  for (const [key, value] of data) {
    encodedData[String(key)] = btoa(value);
  }

  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      ...(namespace !== undefined && namespace !== "default"
        ? { namespace }
        : {}),
    },
    data: encodedData,
    type: "Opaque",
  };
};

export const buildConfigMapFromContext = (
  name: string,
  namespace: string | undefined,
  data: EnvMap,
): ConfigMap => {
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      ...(namespace && namespace !== "default" ? { namespace } : {}),
    },
    data: Object.fromEntries(data.entries()),
  };
};

export const sync = async (options: SyncOptions): Promise<string> => {
  try {
    // Get keys from Kubernetes resource
    const keys = await executeKubectl(options.resource);

    if (keys.length === 0) {
      return `# No data found in ${options.resource.type}/${options.resource.name}`;
    }

    // Load environment data using @eser/config
    const envMap = await load({ env: options.env });

    // Convert Map to Record and filter for the keys we need
    const envData: Record<string, string> = {};
    for (const key of keys) {
      const value = envMap.get(key);
      if (value !== undefined) {
        envData[key] = value;
      } else {
        console.warn(
          `Warning: Environment variable ${key} not found in environment`,
        );
      }
    }

    if (Object.keys(envData).length === 0) {
      return `# No matching environment variables found for ${options.resource.type}/${options.resource.name}`;
    }

    // Prepare data for patch
    let patchData: Record<string, string>;

    if (options.resource.type === "secret") {
      // Base64 encode values for secrets
      patchData = {};
      for (const [key, value] of Object.entries(envData)) {
        patchData[key] = btoa(value);
      }
    } else {
      // Use values as-is for configmaps
      patchData = envData;
    }

    // Generate patch content based on format
    const format = options.format ?? "json";
    const patchObject = { data: patchData };

    let patchString: string;
    if (format === "yaml") {
      patchString = write([patchObject], "yaml", { pretty: true }).trim();
    } else {
      patchString = JSON.stringify(patchObject);
    }

    // Return string-only if requested
    if (options.stringOnly) {
      return patchString;
    }

    // Generate kubectl patch command
    const resourceType = options.resource.type === "configmap"
      ? "cm"
      : "secret";
    const namespaceFlag = options.resource.namespace
      ? ` -n ${options.resource.namespace}`
      : "";

    // Escape the patch for shell usage
    const escapedPatch = patchString.replace(/'/g, "'\"'\"'");

    return `kubectl patch ${resourceType} ${options.resource.name}${namespaceFlag} --type=merge -p '${escapedPatch}'`;
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
