// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as path from "@std/path";
import { load } from "@eser/config/file";
import type { SyncConfig } from "./types.ts";

const DEFAULT_CONFIG: SyncConfig = {
  configMap: {
    name: "my-config",
    namespace: "default",
    data: {},
    labels: {},
    annotations: {},
  },
  output: {
    format: "yaml",
    pretty: true,
  },
};

export const loadConfig = async (
  configPath?: string,
  searchParents = true,
): Promise<SyncConfig> => {
  const baseDir = configPath ? path.dirname(configPath) : Deno.cwd();
  const configNames = configPath ? [path.basename(configPath)] : [
    "k8s.yaml",
    "k8s.yml",
    "k8s.json",
    "k8s.toml",
    "kubernetes.yaml",
    "kubernetes.yml",
    "kubernetes.json",
    "kubernetes.toml",
    ".k8s.yaml",
    ".k8s.yml",
    ".k8s.json",
    ".k8s.toml",
  ];

  try {
    const result = await load<Partial<SyncConfig>>(
      baseDir,
      configNames,
      undefined,
      searchParents,
    );

    if (result.content !== undefined) {
      return mergeConfigs(DEFAULT_CONFIG, result.content);
    }
  } catch (error) {
    console.warn(
      `Warning: Could not load config file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Load from environment variables
  const envConfig = loadFromEnvironment();
  return mergeConfigs(DEFAULT_CONFIG, envConfig);
};

const loadFromEnvironment = (): Partial<SyncConfig> => {
  const env = Deno.env.toObject();
  const config: Partial<SyncConfig> = {};

  // ConfigMap configuration
  const configMapName = env["K8S_CONFIGMAP_NAME"];
  const configMapNamespace = env["K8S_CONFIGMAP_NAMESPACE"];
  const configMapEnvFile = env["K8S_CONFIGMAP_ENV_FILE"];

  if (
    configMapName !== undefined || configMapNamespace !== undefined ||
    configMapEnvFile !== undefined
  ) {
    config.configMap = {
      name: configMapName !== undefined ? configMapName : "my-config",
      namespace: configMapNamespace !== undefined
        ? configMapNamespace
        : "default",
      envFile: configMapEnvFile,
      data: {},
      labels: {},
      annotations: {},
    };
  }

  // Output configuration
  const outputFormat = env["K8S_OUTPUT_FORMAT"];
  if (
    outputFormat !== undefined &&
    (outputFormat === "yaml" || outputFormat === "json")
  ) {
    config.output = {
      format: outputFormat,
    };
  }

  return config;
};

const mergeConfigs = (
  base: SyncConfig,
  override: Partial<SyncConfig>,
): SyncConfig => {
  const merged = { ...base };

  if (override.configMap !== undefined) {
    merged.configMap = { ...merged.configMap, ...override.configMap };
  }

  if (override.output !== undefined) {
    merged.output = { ...merged.output, ...override.output };
  }

  return merged;
};

export const getDefaultConfig = (): SyncConfig => {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
};
