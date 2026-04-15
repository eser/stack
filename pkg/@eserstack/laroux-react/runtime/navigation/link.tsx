// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
"use client";

// Client-side Link component for navigation

import type React from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  analyzeNavigation,
  NAVIGATION_EVENT_NAME,
} from "@eserstack/laroux/navigation";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children: ReactNode;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
}

/**
 * Client Component for client-side navigation
 * Intercepts clicks and uses History API for SPA-like navigation
 */
export function Link({
  href,
  children,
  replace = false,
  scroll = true,
  prefetch: _prefetch = false,
  onClick,
  ...props
}: LinkProps): React.JSX.Element {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Use framework-agnostic navigation analysis
    const analysis = analyzeNavigation(href, {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });

    // Allow default behavior for external links, special protocols, or modifier keys
    if (!analysis.shouldHandle) {
      return;
    }

    // Call custom onClick if provided
    if (onClick) {
      onClick(event);
    }

    // Prevent default navigation
    event.preventDefault();

    // Update browser history
    if (replace) {
      globalThis.window.history.replaceState({}, "", href);
    } else {
      globalThis.window.history.pushState({}, "", href);
    }

    // Scroll to top if enabled
    if (scroll) {
      globalThis.window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Trigger navigation event for RSC update
    globalThis.window.dispatchEvent(new Event(NAVIGATION_EVENT_NAME));
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
