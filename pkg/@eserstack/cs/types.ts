// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Settings for building a ConfigMap: its name and metadata, where its data
 * comes from, and how the output is written.
 */
export interface SyncConfig {
  /** The ConfigMap to build: name, namespace, data source and metadata. */
  configMap: {
    name: string;
    namespace?: string;
    envFile?: string;
    data?: Record<string, string>;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  /** Output format, and whether the output is pretty-printed. */
  output?: {
    format?: "yaml" | "json";
    pretty?: boolean;
  };
}

/** A Kubernetes ConfigMap resource, as the `v1` API defines it. */
export interface ConfigMap {
  /** Always `"v1"`. */
  apiVersion: "v1";
  /** Always `"ConfigMap"`. */
  kind: "ConfigMap";
  /** Name, namespace, labels and annotations of the resource. */
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  /** UTF-8 values by key. */
  data?: Record<string, string>;
  /** Base64-encoded binary values by key. */
  binaryData?: Record<string, string>;
}

/** A Kubernetes Secret resource, as the `v1` API defines it. */
export interface Secret {
  /** Always `"v1"`. */
  apiVersion: "v1";
  /** Always `"Secret"`. */
  kind: "Secret";
  /** Name, namespace, labels and annotations of the resource. */
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  /** Base64-encoded values by key. */
  data?: Record<string, string>;
  /** Plain values by key, which the API server encodes on write. */
  stringData?: Record<string, string>;
  /** The Secret type, such as `"Opaque"`. */
  type?: string;
}

/** The values a {@link ConfigMapBuilder} or {@link SecretBuilder} builds from. */
export interface ConfigMapContext {
  /** The settings the build started from. */
  config: SyncConfig;
  /** Name of the resource to build. */
  name: string;
  /** Namespace of the resource; absent for the default namespace. */
  namespace?: string;
  /** Values to put in the resource, by key. */
  data: Record<string, string>;
  /** Labels to put in the resource metadata. */
  labels: Record<string, string>;
  /** Annotations to put in the resource metadata. */
  annotations: Record<string, string>;
}

/** Builds a ConfigMap from a context, or returns `null` to build nothing. */
export type ConfigMapBuilder = (context: ConfigMapContext) => ConfigMap | null;

/** Builds a Secret from a context, or returns `null` to build nothing. */
export type SecretBuilder = (context: ConfigMapContext) => Secret | null;

/** Points at one ConfigMap or Secret in a cluster. */
export interface KubectlResourceReference {
  /** Whether the resource is a ConfigMap or a Secret. */
  type: "configmap" | "secret";
  /** Resource name; must be a valid RFC 1123 DNS subdomain. */
  name: string;
  /** Namespace of the resource; kubectl's current namespace when absent. */
  namespace?: string;
}

/** Options for `sync()` and `syncApply()`. */
export interface SyncOptions {
  /** The ConfigMap or Secret to patch. */
  resource: KubectlResourceReference;
  /**
   * Environment name, such as `"production"`. It selects the `.env.<name>`
   * and `.env.<name>.local` files; when absent, the name comes from the
   * `ENV`, `APP_ENV` or `NODE_ENV` variable, then `"development"`.
   */
  env?: string;
  /** Format of the patch: `"json"` (the default) or `"yaml"`. */
  format?: "yaml" | "json";
  /** Return only the patch, without the `kubectl patch` command around it. */
  stringOnly?: boolean;
  /**
   * Directory to read the `.env` files from. Defaults to the working
   * directory. Set it to read another directory without calling chdir, which
   * changes the working directory of the whole process.
   */
  cwd?: string;
  /**
   * Reads the data keys of the resource. Defaults to `executeKubectl()`,
   * which runs `kubectl get`. Pass your own function to read the keys through
   * another client, or to test without a cluster.
   */
  getResourceKeys?: (
    resource: KubectlResourceReference,
  ) => Promise<ReadonlyArray<string>>;
  /**
   * Called for each key of the Kubernetes resource that has no value in the
   * loaded environment. The key is left out of the patch either way; the CLI
   * uses this to print a warning on stderr.
   */
  onMissingKey?: (key: string) => void;
}
