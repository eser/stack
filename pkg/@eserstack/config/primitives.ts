// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * What a configuration key holds: its purpose, its type, how long a read value
 * stays valid, and the sources it must not be read from.
 */
export type ConfigItemMeta = {
  description: string;
  type: string;
  ttl: number;
  disallowSource: string[];
};

/** One configuration key with its value and metadata. */
export type ConfigItem<T = unknown> = {
  key: string;
  value: T;
  meta: ConfigItemMeta;
};

/**
 * Values about the current request, such as a user or tenant id, that a
 * source may use to pick a value.
 */
export type RequestContext = {
  [key: string]: unknown;
};

/**
 * Reads typed configuration values by key. Each method resolves to the
 * default value when no source has the key.
 */
export interface ContainerReadable {
  /** Reads a boolean value. */
  getBooleanValue(
    flagKey: string,
    defaultValue: boolean,
    requestContext?: RequestContext,
  ): Promise<boolean>;
  /** Reads a number value. */
  getNumberValue<T = number>(
    flagKey: string,
    defaultValue: T,
    requestContext?: RequestContext,
  ): Promise<T>;
  /** Reads an object value. */
  getObjectValue<T>(
    flagKey: string,
    defaultValue: T,
    requestContext?: RequestContext,
  ): Promise<T>;
  /** Reads a string value. */
  getStringValue<T = string>(
    flagKey: string,
    defaultValue: T,
    requestContext?: RequestContext,
  ): Promise<T>;
}

/** State every configuration source carries: an id that names the source. */
export type SourceState = {
  id: string;
};

/** A place configuration values come from, such as `.env` files. */
export type Source = {
  readonly state: SourceState;
};

/** Reads configuration values from a list of sources. */
export type Provider = ContainerReadable & {
  sources: Array<Source>;
};
