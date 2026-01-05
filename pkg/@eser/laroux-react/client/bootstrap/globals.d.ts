// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Global type declarations for HMR and Smart Refresh runtime
 * Extends globalThis with the properties used by the client bootstrap
 */

/**
 * Chunk manifest structure from bundler
 */
export type ChunkManifest = {
  chunks: Record<string, string>;
};

/**
 * Laroux global runtime state
 */
export type LarouxGlobals = {
  /** Chunk manifest injected by bundler */
  __CHUNK_MANIFEST__?: ChunkManifest;

  /** Whether Smart Refresh is enabled */
  __SMART_REFRESH_ENABLED__?: boolean;

  /** Whether a refresh is currently pending */
  __REFRESH_PENDING__?: boolean;

  /** Last changed modules for debugging */
  __LAST_CHANGED_MODULES__?: string[];

  /** Perform smart refresh with module awareness */
  __performSmartRefresh__?: (changedModules?: string[]) => Promise<void>;

  /** Clear RSC cache for changed modules */
  __clearRSCCache__?: (changedModules?: string[]) => void;

  /** Refresh RSC root component */
  __refreshRSCRoot__?: (changedModules?: string[]) => Promise<void>;
};

declare global {
  var __CHUNK_MANIFEST__: ChunkManifest | undefined;
  var __SMART_REFRESH_ENABLED__: boolean | undefined;
  var __REFRESH_PENDING__: boolean | undefined;
  var __LAST_CHANGED_MODULES__: string[] | undefined;
  var __performSmartRefresh__:
    | ((changedModules?: string[]) => Promise<void>)
    | undefined;
  var __clearRSCCache__: ((changedModules?: string[]) => void) | undefined;
  var __refreshRSCRoot__:
    | ((changedModules?: string[]) => Promise<void>)
    | undefined;
  /** Runtime modules registry for HMR mode */
  var __RUNTIME_MODULES__: Record<string, unknown> | undefined;
}
