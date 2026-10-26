// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Navigation module - Framework-agnostic navigation utilities
 *
 * @module
 */

export type {
  LinkConfig,
  ModifierKeys,
  NavigateOptions,
  NavigationAnalysis,
  RouterMethods,
} from "./types.ts";

export {
  analyzeNavigation,
  buildLinkConfig,
  isExternalUrl,
  isSpecialProtocol,
} from "./link-config.ts";

export { NAVIGATION_EVENT_NAME } from "./constants.ts";
