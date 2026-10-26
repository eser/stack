// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Client Module Entry Point
 * Re-exports all client-side modules for the RSC bundler
 */

export { ErrorBoundary } from "./error-boundary.ts";
export type {
  ErrorBoundaryProps,
  ErrorBoundaryState,
} from "./error-boundary.ts";
export { ErrorOverlay } from "./error-overlay.ts";
export { initializeHMR } from "./hmr-client.ts";
export { LazyChunkLoader } from "./lazy-loader.ts";
export {
  initializeSmartRefresh,
  triggerSmartRefresh,
} from "./smart-refresh.ts";
export {
  installLinkNavigation,
  LINK_ATTRIBUTE,
  LINK_SCROLL_ATTRIBUTE,
} from "../../runtime/navigation/link-navigation.ts";
export type {
  LinkClickEvent,
  LinkNavigationDocument,
  NavigationWindow,
} from "../../runtime/navigation/link-navigation.ts";
