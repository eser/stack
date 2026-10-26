// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
"use client";

// Client-side router hook for programmatic navigation

import type {
  NavigateOptions,
  RouterMethods,
} from "@eserstack/laroux/navigation";
import * as linkNavigation from "./link-navigation.ts";

// The methods hold no state, so every call of useRouter returns this one
// object and its functions keep their identity across renders.
const router: RouterMethods = {
  push: (href: string, options: NavigateOptions = {}) => {
    linkNavigation.navigateOnClient(globalThis.window, href, {
      replace: false,
      scroll: options.scroll !== false,
    });
  },
  replace: (href: string, options: NavigateOptions = {}) => {
    linkNavigation.navigateOnClient(globalThis.window, href, {
      replace: true,
      scroll: options.scroll !== false,
    });
  },
  back: () => {
    globalThis.window.history.back();
  },
  forward: () => {
    globalThis.window.history.forward();
  },
  refresh: () => {
    globalThis.window.location.reload();
  },
};

/**
 * Access the client-side router for programmatic navigation, such as after a
 * successful submit. `push` and `replace` navigate like `Link` and scroll to
 * the top unless `scroll` is `false`; `refresh` reloads the whole page.
 *
 * @returns The router methods; the same object on every call
 */
export function useRouter(): RouterMethods {
  return router;
}
