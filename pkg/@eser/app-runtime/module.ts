// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Represents a manifest with metadata about a module
 */
export type ModuleManifest = {
  /** Module name */
  name?: string;
  /** Module version following semver */
  version?: string;
  /** Module description */
  description?: string;
  /** Module author information */
  author?: string | { name: string; email?: string };
  /** Module license */
  license?: string;
  /** Module dependencies */
  dependencies?: Record<string, string>;
  /** Additional metadata */
  [key: string]: unknown;
};

/**
 * Service identifier that can be a string key or constructor function
 */
export type ServiceIdentifier<T = unknown> =
  | string
  | (new (...args: unknown[]) => T);

/**
 * Function that can be used as module entrypoint
 */
export type ModuleEntrypoint = () => void | Promise<void>;

/**
 * Function that returns a module or a promise of a module
 */
export type ModuleLoader = () => Module | Promise<Module>;

/**
 * Represents a module in the application runtime
 */
export type Module = {
  /** Optional module name */
  name?: string;

  /** Module manifest with metadata */
  manifest: ModuleManifest;

  /** Dependencies this module requires from other modules */
  uses?: ReadonlyArray<ServiceIdentifier>;
  /** Services this module provides to other modules */
  provides: ReadonlyArray<ServiceIdentifier>;

  /** Function to execute when module is loaded */
  entrypoint: ModuleEntrypoint;

  /** Whether this module should be loaded lazily */
  lazy?: boolean;
};

/**
 * Represents a lazy module that hasn't been loaded yet
 */
export type LazyModule = {
  /** Optional module name */
  name?: string;

  /** Module loader function */
  loader: ModuleLoader;

  /** Whether this module has been loaded */
  loaded: boolean;

  /** The actual module once loaded */
  module?: Module;

  /** Loading promise to prevent duplicate loads */
  loadingPromise?: Promise<Module>;
};
