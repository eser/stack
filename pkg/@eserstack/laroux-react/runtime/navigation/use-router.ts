// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
"use client";

// Client-side router hook for programmatic navigation

import { useCallback } from "react";
import type {
  NavigateOptions,
  RouterMethods,
} from "@eserstack/laroux/navigation";
import { NAVIGATION_EVENT_NAME } from "@eserstack/laroux/navigation";

/**
 * Hook to access client-side router methods
 * Provides programmatic navigation similar to Next.js useRouter
 */
export function useRouter(): RouterMethods {
  const push = useCallback((href: string, options: NavigateOptions = {}) => {
    const { scroll = true } = options;

    // Update browser history
    globalThis.window.history.pushState({}, "", href);

    // Scroll to top if enabled
    if (scroll) {
      globalThis.window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Trigger navigation event for RSC update
    globalThis.window.dispatchEvent(new Event(NAVIGATION_EVENT_NAME));
  }, []);

  const replace = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      const { scroll = true } = options;

      // Update browser history
      globalThis.window.history.replaceState({}, "", href);

      // Scroll to top if enabled
      if (scroll) {
        globalThis.window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Trigger navigation event for RSC update
      globalThis.window.dispatchEvent(new Event(NAVIGATION_EVENT_NAME));
    },
    [],
  );

  const back = useCallback(() => {
    globalThis.window.history.back();
  }, []);

  const forward = useCallback(() => {
    globalThis.window.history.forward();
  }, []);

  const refresh = useCallback(() => {
    globalThis.window.location.reload();
  }, []);

  return {
    push,
    replace,
    back,
    forward,
    refresh,
  };
}
