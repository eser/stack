// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

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
