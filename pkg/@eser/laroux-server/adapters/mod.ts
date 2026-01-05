// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Adapters for @eser/laroux-server
 *
 * This module re-exports all available framework adapters.
 * Each adapter implements the domain port interfaces for a specific framework.
 *
 * Available adapters:
 * - React: RSC and SSR rendering for React applications
 *
 * @example
 * ```ts
 * import { reactRenderer } from "@eser/laroux-server/adapters";
 * // or
 * import { reactRenderer } from "@eser/laroux-server/adapters/react";
 * ```
 */

// React adapter
export {
  createReactHtmlShellBuilder,
  createReactRenderer,
  reactHtmlShellBuilder,
  reactRenderer,
} from "./react/mod.ts";
