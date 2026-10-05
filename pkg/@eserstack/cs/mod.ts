// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builds Kubernetes ConfigMaps and Secrets from `.env` files and environment
 * variables, and generates `kubectl patch` commands that bring an existing
 * resource in line with the environment.
 *
 * @example
 * ```typescript
 * import * as cs from "@eserstack/cs";
 *
 * const manifest = await cs.generate({
 *   resource: { type: "configmap", name: "app-config" },
 *   env: "production",
 *   format: "yaml",
 * });
 * ```
 *
 * @module
 */

export { generate, type GenerateOptions } from "./generate.ts";
export {
  buildConfigMapFromContext,
  buildSecretFromContext,
  executeKubectl,
  KubernetesResourceNameError,
  sync,
  syncApply,
  validateKubernetesResourceName,
  validateResourceReference,
} from "./sync.ts";
export {
  type ConfigMap,
  type ConfigMapBuilder,
  type ConfigMapContext,
  type KubectlResourceReference,
  type Secret,
  type SecretBuilder,
  type SyncConfig,
  type SyncOptions,
} from "./types.ts";
