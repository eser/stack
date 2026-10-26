// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Client-side navigation for `Link` anchors, wherever they were rendered.
 *
 * laroux renders server components with its own RSC renderer and drops the
 * functions they render, so a `Link` in a server component reaches the browser
 * as a plain `<a>` without its click handler. `Link` therefore writes its
 * options to the {@link LINK_ATTRIBUTE} and {@link LINK_SCROLL_ATTRIBUTE}
 * attributes, and the laroux client bootstrap calls
 * {@link installLinkNavigation} once. From then on a click on a marked anchor
 * navigates on the client under the same rules `Link`'s own handler applies.
 * A `Link` that a client component renders handles the click itself and
 * prevents the default, so the document listener leaves that click alone.
 *
 * @module
 */

import * as navigation from "@eserstack/laroux/navigation";

/**
 * The attribute that marks a `Link` anchor. Its value is `"push"`, or
 * `"replace"` for a link that replaces the current history entry.
 */
export const LINK_ATTRIBUTE = "data-laroux-link";

/**
 * The attribute of a `Link` that keeps the scroll position; its value is
 * `"false"`. Links without it scroll to the top after navigating.
 */
export const LINK_SCROLL_ATTRIBUTE = "data-laroux-scroll";

/** How a link navigation changes the history and the scroll position. */
export type LinkNavigationOptions = {
  /** Replace the current history entry instead of adding one */
  readonly replace: boolean;
  /** Scroll to the top of the page after navigating */
  readonly scroll: boolean;
};

/**
 * Build the attributes that carry a link's options into the page.
 *
 * @param options - The link's history and scroll options
 * @returns The attributes to spread onto the `<a>` element
 */
export function buildLinkAttributes(
  options: LinkNavigationOptions,
): Readonly<Record<string, string>> {
  const history = options.replace ? "replace" : "push";

  return options.scroll
    ? { [LINK_ATTRIBUTE]: history }
    : { [LINK_ATTRIBUTE]: history, [LINK_SCROLL_ATTRIBUTE]: "false" };
}

/** What a click on a link carries that decides who handles it. */
export type LinkClick = {
  readonly href: string;
  readonly target: string | undefined;
  readonly download: unknown;
  readonly button: number;
  readonly defaultPrevented: boolean;
  readonly modifiers: navigation.ModifierKeys;
};

/**
 * Decide whether a link click navigates on the client.
 *
 * The browser keeps a click that an `onClick` handler already prevented, one
 * with a button other than the primary one, a link with a `target` other than
 * `_self` or with `download`, and everything `analyzeNavigation` leaves to it:
 * external and special-protocol URLs, hash links and modifier keys.
 *
 * @param click - The link's attributes and the click event's state
 * @returns Whether to prevent the default and navigate on the client
 */
export function shouldNavigateOnClient(click: LinkClick): boolean {
  if (click.defaultPrevented || click.button !== 0) {
    return false;
  }

  if (
    click.target !== undefined &&
    click.target !== "" &&
    click.target !== "_self"
  ) {
    return false;
  }

  if (
    click.download !== undefined &&
    click.download !== null &&
    click.download !== false
  ) {
    return false;
  }

  return navigation.analyzeNavigation(click.href, click.modifiers).shouldHandle;
}

/** The parts of `window` that a client-side navigation uses. */
export type NavigationWindow = {
  readonly history: {
    pushState(data: unknown, unused: string, url: string): void;
    replaceState(data: unknown, unused: string, url: string): void;
  };
  scrollTo(options: { top: number; behavior: "smooth" }): void;
  dispatchEvent(event: Event): boolean;
};

/**
 * Navigate on the client: add or replace the history entry, scroll to the top
 * unless the options say not to, and fire the navigation event that makes the
 * laroux client fetch and render the new page.
 *
 * @param target - The browser window
 * @param href - The URL to navigate to
 * @param options - The link's history and scroll options
 */
export function navigateOnClient(
  target: NavigationWindow,
  href: string,
  options: LinkNavigationOptions,
): void {
  if (options.replace) {
    target.history.replaceState({}, "", href);
  } else {
    target.history.pushState({}, "", href);
  }

  if (options.scroll) {
    target.scrollTo({ top: 0, behavior: "smooth" });
  }

  target.dispatchEvent(new Event(navigation.NAVIGATION_EVENT_NAME));
}

/** The part of an `<a>` element that link navigation reads. */
export type LinkAnchorElement = {
  getAttribute(name: string): string | null;
};

/** A click event; its target is the element the click landed on. */
export type LinkClickEvent = {
  readonly target: unknown;
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
};

/** The parts of a document that installing link navigation uses. */
export type LinkNavigationDocument = {
  addEventListener(
    type: "click",
    listener: (event: LinkClickEvent) => void,
  ): void;
  removeEventListener(
    type: "click",
    listener: (event: LinkClickEvent) => void,
  ): void;
};

type ClosestTarget = {
  closest(selectors: string): unknown;
};

const hasClosest = (value: unknown): value is ClosestTarget =>
  typeof value === "object" &&
  value !== null &&
  "closest" in value &&
  typeof value.closest === "function";

const isAnchorElement = (value: unknown): value is LinkAnchorElement =>
  typeof value === "object" &&
  value !== null &&
  "getAttribute" in value &&
  typeof value.getAttribute === "function";

/** The `Link` anchor a click landed in, or null for any other click. */
const findLinkAnchor = (target: unknown): LinkAnchorElement | null => {
  // The document and text nodes have no closest(); clicks on them are not
  // link clicks.
  if (!hasClosest(target)) {
    return null;
  }

  const anchor = target.closest(`a[${LINK_ATTRIBUTE}]`);
  return isAnchorElement(anchor) ? anchor : null;
};

/**
 * Navigate on the client when a click lands in a `Link` anchor and the
 * navigation rules allow it.
 *
 * @param event - The click event
 * @param target - The browser window
 * @returns Whether the click was taken over: the default was prevented and
 *   the navigation ran
 */
export function handleLinkClick(
  event: LinkClickEvent,
  target: NavigationWindow,
): boolean {
  const anchor = findLinkAnchor(event.target);
  if (anchor === null) {
    return false;
  }

  const href = anchor.getAttribute("href");
  if (href === null) {
    return false;
  }

  const navigate = shouldNavigateOnClient({
    href,
    target: anchor.getAttribute("target") ?? undefined,
    // getAttribute returns "" for a bare download attribute, which still
    // counts as a download.
    download: anchor.getAttribute("download") ?? undefined,
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
    return false;
  }

  event.preventDefault();
  navigateOnClient(target, href, {
    replace: anchor.getAttribute(LINK_ATTRIBUTE) === "replace",
    scroll: anchor.getAttribute(LINK_SCROLL_ATTRIBUTE) !== "false",
  });

  return true;
}

/**
 * Navigate on the client for every `Link` anchor on the page, for the rest of
 * the page's life.
 *
 * One click listener on the document sees clicks on anchors React renders
 * later as well. It runs after React's own handlers, which are attached to the
 * root container, so a click that a client-rendered `Link` already handled
 * arrives with its default prevented and is left alone.
 *
 * @param document - The page document
 * @param target - The browser window
 * @returns A function that removes the listener
 */
export function installLinkNavigation(
  document: LinkNavigationDocument,
  target: NavigationWindow,
): () => void {
  const onClick = (event: LinkClickEvent) => {
    handleLinkClick(event, target);
  };

  document.addEventListener("click", onClick);

  return () => {
    document.removeEventListener("click", onClick);
  };
}
