// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { ConfigMapBuilder, ConfigMapContext } from "./types.ts";

const createConfigMapMetadata = (
  context: ConfigMapContext,
) => {
  const metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  } = {
    name: context.name,
  };

  if (
    context.namespace !== undefined && context.namespace !== "" &&
    context.namespace !== "default"
  ) {
    metadata.namespace = context.namespace;
  }

  if (context.labels !== undefined && Object.keys(context.labels).length > 0) {
    metadata.labels = context.labels;
  }

  if (
    context.annotations !== undefined &&
    Object.keys(context.annotations).length > 0
  ) {
    metadata.annotations = context.annotations;
  }

  return metadata;
};

export const buildConfigMap: ConfigMapBuilder = (context) => {
  if (context.data === undefined || Object.keys(context.data).length === 0) {
    return null;
  }

  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: createConfigMapMetadata(context),
    data: context.data,
  };
};

export const createConfigMapContext = (
  config: {
    configMap: {
      name: string;
      namespace?: string;
      data?: Record<string, string>;
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
  },
  envData: Record<string, string>,
): ConfigMapContext => {
  const configMapConfig = config.configMap;

  return {
    config,
    name: configMapConfig.name,
    namespace: configMapConfig.namespace,
    data: {
      ...envData,
      ...(configMapConfig.data !== undefined ? configMapConfig.data : {}),
    },
    labels: configMapConfig.labels !== undefined ? configMapConfig.labels : {},
    annotations: configMapConfig.annotations !== undefined
      ? configMapConfig.annotations
      : {},
  };
};
