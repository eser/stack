// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Global type declarations for HMR and Smart Refresh runtime
 * Extends globalThis with the properties used by the client bootstrap
 */

import type { ChunkManifest } from "@eserstack/laroux";

/** The chunk manifest laroux-server injects into the page. */
export type { ChunkManifest };

/**
 * Laroux global runtime state
 * Use `globalThis as LarouxGlobalThis` for typed access
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

  /**
   * Re-render the RSC root with fresh data. The client entry's version returns
   * once the render is scheduled; smart refresh awaits the result, so a version
   * that returns a promise works too.
   */
  __refreshRSCRoot__?: (changedModules?: string[]) => void | Promise<void>;

  /** Runtime modules registry for HMR mode */
  __RUNTIME_MODULES__?: Record<string, unknown>;
};

/**
 * Typed globalThis with Laroux runtime properties
 */
export type LarouxGlobalThis = typeof globalThis & LarouxGlobals;
