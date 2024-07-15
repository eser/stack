// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type ConfigItemMeta = {
  description: string;
  type: string;
  ttl: number;
  disallowSource: string[];
};

export type ConfigItem<T = unknown> = {
  key: string;
  value: T;
  meta: ConfigItemMeta;
};

export type RequestContext = {
  [key: string]: unknown;
};

export interface ContainerReadable {
  getBooleanValue(
    flagKey: string,
    defaultValue: boolean,
    requestContext?: RequestContext,
  ): Promise<boolean>;
  getNumberValue<T = number>(
    flagKey: string,
    defaultValue: boolean,
    requestContext?: RequestContext,
  ): Promise<T>;
  getObjectValue<T>(
    flagKey: string,
    defaultValue: boolean,
    requestContext?: RequestContext,
  ): Promise<T>;
  getStringValue<T = string>(
    flagKey: string,
    defaultValue: boolean,
    requestContext?: RequestContext,
  ): Promise<T>;
}

export type SourceState = {
  id: string;
};

export type Source = {
  readonly state: SourceState;
};

export type Provider = ContainerReadable & {
  sources: Array<Source>;
};
