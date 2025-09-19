// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Configuration types
export interface SyncConfig {
  configMap: {
    name: string;
    namespace?: string;
    envFile?: string;
    data?: Record<string, string>;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  output?: {
    format?: "yaml" | "json";
    pretty?: boolean;
  };
}

// Kubernetes ConfigMap resource type
export interface ConfigMap {
  apiVersion: "v1";
  kind: "ConfigMap";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  data?: Record<string, string>;
  binaryData?: Record<string, string>;
}

// Kubernetes Secret resource type
export interface Secret {
  apiVersion: "v1";
  kind: "Secret";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  type?: string;
}

export interface ConfigMapContext {
  config: SyncConfig;
  name: string;
  namespace?: string;
  data: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export type ConfigMapBuilder = (
  context: ConfigMapContext,
) => ConfigMap | null;

export type SecretBuilder = (
  context: ConfigMapContext,
) => Secret | null;

// Kubectl command options
export interface KubectlResourceReference {
  type: "configmap" | "secret";
  name: string;
  namespace?: string;
}

export interface SyncOptions {
  resource: KubectlResourceReference;
  envFile?: string;
  format?: "yaml" | "json";
  output?: string;
}
