// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
"use client";

// Client-side Link component for navigation

import * as React from "react";
import * as linkNavigation from "./link-navigation.ts";

/** Props of {@link Link}: the anchor's attributes plus the navigation options. */
export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** The URL to navigate to; relative paths navigate on the client */
  href: string;
  /** The link's content */
  children: React.ReactNode;
  /** Replace the current history entry instead of adding one */
  replace?: boolean;
  /** Scroll to the top after navigating (default: true) */
  scroll?: boolean;
}

/**
 * A link that navigates on the client for internal paths.
 *
 * It renders a real `<a href>`. Its click handler navigates through the History
 * API and leaves to the browser what `shouldNavigateOnClient` in
 * link-navigation.ts names. The anchor also carries its options in data
 * attributes, so a `Link` that a server component renders, which reaches the
 * browser without its click handler, navigates on the client through the
 * listener the laroux client bootstrap installs.
 */
export function Link(props: LinkProps): React.JSX.Element {
  const { replace, scroll, onClick, children, ...anchorProps } = props;
  const options: linkNavigation.LinkNavigationOptions = {
    replace: replace === true,
    scroll: scroll !== false,
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    const navigate = linkNavigation.shouldNavigateOnClient({
      href: props.href,
      target: props.target,
      download: props.download,
      button: event.button,
      defaultPrevented: event.defaultPrevented,
      modifiers: {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      },
    });

    if (!navigate) {
      return;
    }

    event.preventDefault();
    linkNavigation.navigateOnClient(globalThis.window, props.href, options);
  };

  return (
    React.createElement("a", {
      ...anchorProps,
      ...linkNavigation.buildLinkAttributes(options),
      onClick: handleClick,
    }, children)
  );
}
