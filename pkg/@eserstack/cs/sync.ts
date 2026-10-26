// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as formats from "@eserstack/formats";
import * as dotenv from "@eserstack/config/dotenv";
import * as shellExec from "@eserstack/shell/exec";
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
 * Thrown when a Kubernetes resource name or namespace breaks the RFC 1123 DNS
 * subdomain rules, before any command runs.
 */
export class KubernetesResourceNameError extends Error {
  /** Creates the error with a message that names the field and the value. */
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
  const args: string[] = ["get", `${resourceType}/${resource.name}`];

  if (resource.namespace !== undefined) {
    args.push("-n", resource.namespace);
  }

  args.push("-o", "json");

  // Execute kubectl directly without shell wrapper
  const result = await shellExec.exec`kubectl ${args}`.noThrow().spawn();

  const { success, stdout, stderr } = result;

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
      `Failed to parse kubectl output as JSON: ${output.slice(
        0,
        ERROR_PREVIEW_LENGTH,
      )}...`,
    );
  }
};

// A manifest leaves out an empty or "default" namespace, as the Go builder
// does, so kubectl uses the namespace of its current context.
const isNamedNamespace = (namespace: string | undefined): boolean =>
  namespace !== undefined && namespace !== "" && namespace !== "default";

/**
 * Builds a Kubernetes Secret resource from the given context.
 *
 * @param name - The Secret name
 * @param namespace - The namespace; left out of the metadata when it is
 *   absent, empty or `"default"`
 * @param data - Map of key-value pairs to include in the Secret
 * @returns A Kubernetes Secret resource object
 *
 * @remarks
 * **Security Note:** Base64 encoding is NOT encryption.
 * Kubernetes Secrets are stored unencrypted in etcd by default. Base64 encoding is used
 * to support binary data and is required by the Kubernetes API, but it provides no
 * confidentiality. For sensitive data, consider:
 * - Enabling etcd encryption at rest
 * - Using external secret management (HashiCorp Vault, AWS Secrets Manager, etc.)
 * - Using sealed-secrets or similar solutions
 */
/**
 * Base64 of the UTF-8 bytes of a value, the bytes Kubernetes hands back
 * (btoa encodes Latin-1 and throws above U+00FF).
 */
const encodeBase64 = (value: string): string => {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

/**
 * The variables of an env map sorted by key, as the Go csfx writes them,
 * without the loader's symbol-keyed environment name.
 */
const sortedVariables = (data: dotenv.EnvMap): [string, string][] => {
  const entries: [string, string][] = [];
  for (const [key, value] of data) {
    if (typeof key === "string") {
      entries.push([key, value]);
    }
  }

  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
};

export const buildSecretFromContext = (
  name: string,
  namespace: string | undefined,
  data: dotenv.EnvMap,
): Secret => {
  const encodedData: Record<string, string> = {};

  // Base64 encode data for Kubernetes API compatibility (NOT for security)
  for (const [key, value] of sortedVariables(data)) {
    encodedData[key] = encodeBase64(value);
  }

  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      ...(isNamedNamespace(namespace) ? { namespace } : {}),
    },
    data: encodedData,
    type: "Opaque",
  };
};

/**
 * Builds a Kubernetes ConfigMap resource from the given context.
 *
 * @param name - The ConfigMap name
 * @param namespace - The namespace; left out of the metadata when it is
 *   absent, empty or `"default"`
 * @param data - Map of key-value pairs to include in the ConfigMap
 * @returns A Kubernetes ConfigMap resource object
 */
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
      ...(isNamedNamespace(namespace) ? { namespace } : {}),
    },
    data: Object.fromEntries(sortedVariables(data)),
  };
};

/**
 * Synchronizes environment variables with a Kubernetes ConfigMap or Secret.
 * Generates a kubectl patch command that can be executed to update the resource.
 *
 * The patch holds only the keys the resource already has. A key with no value
 * in the environment is left out and reported through `onMissingKey`.
 *
 * @param options - Sync configuration options
 * @returns A kubectl patch command string or the patch data (if stringOnly is true)
 * @throws {KubernetesResourceNameError} If resource name/namespace is invalid
 * @throws {Error} If kubectl command fails or sync operation fails
 *
 * @example
 * ```typescript
 * import * as cs from "@eserstack/cs";
 *
 * const command = await cs.sync({
 *   resource: { type: "configmap", name: "my-config", namespace: "staging" },
 *   env: "staging",
 *   format: "json",
 * });
 * // kubectl patch cm my-config -n staging --type=merge -p '{"data":{...}}'
 * ```
 */
export const sync = async (options: SyncOptions): Promise<string> => {
  // This stays in TypeScript when the Go library is loaded. The Go csfx.Sync
  // reads one env file by path and no process environment, while `env` here is
  // an environment name that selects layered .env files, and Go can neither
  // report missing keys nor use getResourceKeys.
  try {
    // Validate resource reference early (defense in depth)
    // executeKubectl also validates, but we validate here for early failure
    validateResourceReference(options.resource);

    // Get keys from Kubernetes resource
    const getResourceKeys = options.getResourceKeys ?? executeKubectl;
    const keys = await getResourceKeys(options.resource);

    if (keys.length === 0) {
      return `# No data found in ${options.resource.type}/${options.resource.name}`;
    }

    // Load environment data using @eserstack/config
    const envMap = await dotenv.load({
      baseDir: options.cwd ?? ".",
      env: options.env,
    });

    // Convert Map to Record and filter for the keys we need
    const envData: Record<string, string> = {};
    for (const key of keys) {
      const value = envMap.get(key);
      if (value !== undefined) {
        envData[key] = value;
      } else {
        options.onMissingKey?.(key);
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
        patchData[key] = encodeBase64(value);
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
      // A merge patch must be a mapping. serialize() writes its items as a
      // YAML sequence, so the patch goes through the YAML format's writeItem,
      // which writes one document followed by a "---" separator.
      patchString = formats.yamlFormat
        .writeItem(patchObject)
        .replace(/\n---\n$/, "")
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
    const resourceType =
      options.resource.type === "configmap" ? "cm" : "secret";
    const namespaceFlag =
      options.resource.namespace !== undefined
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
      { cause: error },
    );
  }
};

/**
 * Generates the `kubectl patch` command that applies the sync patch.
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

  // Quote the patch for a POSIX shell. Resource name and namespace are already
  // validated by sync()
  const resourceType = options.resource.type === "configmap" ? "cm" : "secret";
  const namespaceFlag =
    options.resource.namespace !== undefined
      ? ` -n ${options.resource.namespace}`
      : "";

  return `kubectl patch ${resourceType} ${options.resource.name}${namespaceFlag} --type=merge -p '${manifest.replace(
    /'/g,
    "'\"'\"'",
  )}'`;
};
