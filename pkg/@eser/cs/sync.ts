// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eser/standards/runtime";
import * as writer from "@eser/writer";
import * as dotenv from "@eser/config/dotenv";
import type {
  ConfigMap,
  KubectlResourceReference,
  Secret,
  SyncOptions,
} from "./types.ts";

// Constants
const K8S_MAX_NAME_LENGTH = 253; // RFC 1123 DNS subdomain max length
const ERROR_PREVIEW_LENGTH = 100; // Characters to show in error previews

/**
 * Kubernetes resource name validation error
 */
export class KubernetesResourceNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KubernetesResourceNameError";
  }
}

/**
 * Validates a Kubernetes resource name according to RFC 1123 DNS subdomain naming rules.
 * - Must be 253 characters or less
 * - Must contain only lowercase alphanumeric characters, '-', or '.'
 * - Must start and end with an alphanumeric character
 *
 * @param name - The resource name to validate
 * @param fieldName - The field name for error messages (e.g., "resource name", "namespace")
 * @throws {KubernetesResourceNameError} If the name is invalid
 */
export const validateKubernetesResourceName = (
  name: string,
  fieldName: string = "resource name",
): void => {
  if (name === undefined || name === null) {
    throw new KubernetesResourceNameError(`${fieldName} is required`);
  }

  if (typeof name !== "string") {
    throw new KubernetesResourceNameError(`${fieldName} must be a string`);
  }

  if (name.length === 0) {
    throw new KubernetesResourceNameError(`${fieldName} cannot be empty`);
  }

  if (name.length > K8S_MAX_NAME_LENGTH) {
    throw new KubernetesResourceNameError(
      `${fieldName} must be 253 characters or less (got ${name.length})`,
    );
  }

  // RFC 1123 DNS subdomain: lowercase alphanumeric, '-', or '.'
  // Must start and end with alphanumeric
  const validPattern = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

  if (!validPattern.test(name)) {
    throw new KubernetesResourceNameError(
      `${fieldName} "${name}" is invalid. Must contain only lowercase alphanumeric characters, '-', or '.', and must start and end with an alphanumeric character`,
    );
  }

  // Check for consecutive dots or dashes which are not allowed
  if (name.includes("..") || name.includes("--")) {
    throw new KubernetesResourceNameError(
      `${fieldName} "${name}" cannot contain consecutive dots or dashes`,
    );
  }
};

/**
 * Validates a KubectlResourceReference, checking both name and namespace if provided.
 *
 * @param resource - The resource reference to validate
 * @throws {KubernetesResourceNameError} If validation fails
 */
export const validateResourceReference = (
  resource: KubectlResourceReference,
): void => {
  validateKubernetesResourceName(resource.name, "resource name");

  if (resource.namespace !== undefined && resource.namespace !== null) {
    validateKubernetesResourceName(resource.namespace, "namespace");
  }
};

/**
 * Executes a kubectl get command to retrieve keys from a Kubernetes resource.
 * Uses direct command invocation (no shell) for security.
 *
 * @param resource - The Kubernetes resource reference
 * @returns Array of data keys from the resource
 * @throws {Error} If kubectl command fails
 * @throws {KubernetesResourceNameError} If resource name/namespace is invalid
 */
export const executeKubectl = async (
  resource: KubectlResourceReference,
): Promise<string[]> => {
  // Validate inputs before executing any commands
  validateResourceReference(resource);

  const resourceType = resource.type === "configmap" ? "cm" : "secret";

  // Build command arguments array (safe from injection)
  const args: string[] = [
    "get",
    `${resourceType}/${resource.name}`,
  ];

  if (resource.namespace) {
    args.push("-n", resource.namespace);
  }

  args.push("-o", "json");

  // Execute kubectl directly without shell wrapper
  const { success, stdout, stderr } = await runtime.exec.spawn(
    "kubectl",
    args,
    {
      stdout: "piped",
      stderr: "piped",
    },
  );

  if (!success) {
    const errorMessage = new TextDecoder().decode(stderr);
    throw new Error(`kubectl command failed: ${errorMessage}`);
  }

  // Parse JSON in JavaScript instead of using jq (removes external dependency)
  const output = new TextDecoder().decode(stdout);

  try {
    const resourceData = JSON.parse(output);
    const data = resourceData.data ?? {};
    return Object.keys(data);
  } catch (_parseError) {
    throw new Error(
      `Failed to parse kubectl output as JSON: ${
        output.substring(0, ERROR_PREVIEW_LENGTH)
      }...`,
    );
  }
};

/**
 * Builds a Kubernetes Secret resource from the given context.
 *
 * @param name - The Secret name
 * @param namespace - The namespace (optional)
 * @param data - Map of key-value pairs to include in the Secret
 * @returns A Kubernetes Secret resource object
 *
 * @remarks
 * **Security Note:** The btoa() function performs Base64 encoding, which is NOT encryption.
 * Kubernetes Secrets are stored unencrypted in etcd by default. Base64 encoding is used
 * to support binary data and is required by the Kubernetes API, but it provides no
 * confidentiality. For sensitive data, consider:
 * - Enabling etcd encryption at rest
 * - Using external secret management (HashiCorp Vault, AWS Secrets Manager, etc.)
 * - Using sealed-secrets or similar solutions
 */
export const buildSecretFromContext = (
  name: string,
  namespace: string | undefined,
  data: dotenv.EnvMap,
): Secret => {
  const encodedData: Record<string, string> = {};

  // Base64 encode data for Kubernetes API compatibility (NOT for security)
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
  data: dotenv.EnvMap,
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

/**
 * Synchronizes environment variables with a Kubernetes ConfigMap or Secret.
 * Generates a kubectl patch command that can be executed to update the resource.
 *
 * @param options - Sync configuration options
 * @returns A kubectl patch command string or the patch data (if stringOnly is true)
 * @throws {KubernetesResourceNameError} If resource name/namespace is invalid
 * @throws {Error} If kubectl command fails or sync operation fails
 *
 * @example
 * ```typescript
 * const command = await sync({
 *   resource: { type: "configmap", name: "my-config", namespace: "default" },
 *   format: "json"
 * });
 * // Returns: kubectl patch cm my-config -n default --type=merge -p '{"data":{...}}'
 * ```
 */
export const sync = async (options: SyncOptions): Promise<string> => {
  // Register formats lazily when needed
  writer.registerBuiltinFormats();

  try {
    // Validate resource reference early (defense in depth)
    // executeKubectl also validates, but we validate here for early failure
    validateResourceReference(options.resource);

    // Get keys from Kubernetes resource
    const keys = await executeKubectl(options.resource);

    if (keys.length === 0) {
      return `# No data found in ${options.resource.type}/${options.resource.name}`;
    }

    // Load environment data using @eser/config
    const envMap = await dotenv.load({ env: options.env });

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
      // Base64 encode values for Kubernetes API (NOT for security - see buildSecretFromContext docs)
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
      patchString = writer.write([patchObject], "yaml", { pretty: true })
        .trim();
    } else {
      patchString = JSON.stringify(patchObject);
    }

    // Return string-only if requested
    if (options.stringOnly) {
      return patchString;
    }

    // Generate kubectl patch command
    // Resource name and namespace have been validated above (RFC 1123 compliant)
    // so they are safe to include in the command string
    const resourceType = options.resource.type === "configmap"
      ? "cm"
      : "secret";
    const namespaceFlag = options.resource.namespace
      ? ` -n ${options.resource.namespace}`
      : "";

    // Escape single quotes in the patch data for shell usage
    const escapedPatch = patchString.replace(/'/g, "'\"'\"'");

    return `kubectl patch ${resourceType} ${options.resource.name}${namespaceFlag} --type=merge -p '${escapedPatch}'`;
  } catch (error) {
    if (error instanceof KubernetesResourceNameError) {
      throw error; // Re-throw validation errors as-is
    }
    throw new Error(
      `Failed to sync with kubectl: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

/**
 * Generates a command to apply the sync patch using kubectl apply.
 *
 * @param options - Sync configuration options
 * @returns A shell command string that applies the patch
 * @throws {KubernetesResourceNameError} If resource name/namespace is invalid
 * @throws {Error} If sync operation fails
 *
 * @remarks
 * This function generates a shell command string. The resource name and namespace
 * are validated according to RFC 1123 DNS subdomain naming rules before being
 * included in the output.
 */
export const syncApply = async (options: SyncOptions): Promise<string> => {
  // Validate early for better error messages
  validateResourceReference(options.resource);

  const manifest = await sync({ ...options, stringOnly: true });

  if (manifest.startsWith("# No")) {
    return manifest;
  }

  // Generate a heredoc-style command which is safer than echo with escaping
  // Resource name/namespace are already validated by sync()
  const resourceType = options.resource.type === "configmap" ? "cm" : "secret";
  const namespaceFlag = options.resource.namespace
    ? ` -n ${options.resource.namespace}`
    : "";

  // Use heredoc for safer shell command generation
  return `kubectl patch ${resourceType} ${options.resource.name}${namespaceFlag} --type=merge -p '${
    manifest.replace(/'/g, "'\"'\"'")
  }'`;
};
