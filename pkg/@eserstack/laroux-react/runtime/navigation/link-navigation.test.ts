// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import type * as React from "react";
import * as navigation from "@eserstack/laroux/navigation";
import * as link from "./link.ts";
import * as linkNavigation from "./link-navigation.ts";

const NAVIGATED = `event ${navigation.NAVIGATION_EVENT_NAME}`;

/** A window that records what a navigation does to it. */
const createWindow = (): linkNavigation.NavigationWindow & {
  readonly calls: string[];
} => {
  const calls: string[] = [];

  return {
    calls,
    history: {
      pushState: (_data, _unused, url) => {
        calls.push(`push ${url}`);
      },
      replaceState: (_data, _unused, url) => {
        calls.push(`replace ${url}`);
      },
    },
    scrollTo: () => {
      calls.push("scroll");
    },
    dispatchEvent: (event) => {
      calls.push(`event ${event.type}`);
      return true;
    },
  };
};

/**
 * An `<a>` with these attributes, and the element a click lands on: the anchor
 * itself, or a child of it. closest() finds the anchor only when it carries
 * the Link marker, as the browser's would for the bootstrap's selector.
 */
const createAnchor = (attributes: Record<string, string>) => {
  const anchor = {
    getAttribute: (name: string) => attributes[name] ?? null,
  };
  const marked = linkNavigation.LINK_ATTRIBUTE in attributes;
  const closest = (selectors: string) =>
    selectors === `a[${linkNavigation.LINK_ATTRIBUTE}]` && marked
      ? anchor
      : null;

  return { anchor: { ...anchor, closest }, child: { closest } };
};

type ClickOptions = {
  readonly button?: number;
  readonly metaKey?: boolean;
  readonly defaultPrevented?: boolean;
};

const createClick = (target: unknown, options: ClickOptions = {}) => {
  let prevented = options.defaultPrevented ?? false;

  return {
    target,
    button: options.button ?? 0,
    metaKey: options.metaKey ?? false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
};

const ATTRIBUTE_CASES: readonly {
  readonly name: string;
  readonly options: linkNavigation.LinkNavigationOptions;
  readonly expected: Readonly<Record<string, string>>;
}[] = [
  {
    name: "marks a link that adds a history entry",
    options: { replace: false, scroll: true },
    expected: { "data-laroux-link": "push" },
  },
  {
    name: "marks a link that replaces the history entry",
    options: { replace: true, scroll: true },
    expected: { "data-laroux-link": "replace" },
  },
  {
    name: "adds the scroll attribute for a link that keeps the scroll position",
    options: { replace: false, scroll: false },
    expected: { "data-laroux-link": "push", "data-laroux-scroll": "false" },
  },
];

for (const { name, options, expected } of ATTRIBUTE_CASES) {
  Deno.test(`buildLinkAttributes ${name}`, () => {
    assert.assertEquals(linkNavigation.buildLinkAttributes(options), expected);
  });
}

Deno.test("handleLinkClick navigates on the client for a click on a Link anchor", () => {
  const window = createWindow();
  const { anchor } = createAnchor({
    href: "/stories",
    "data-laroux-link": "push",
  });
  const click = createClick(anchor);

  const handled = linkNavigation.handleLinkClick(click, window);

  assert.assertEquals(handled, true);
  assert.assertEquals(click.defaultPrevented, true);
  assert.assertEquals(window.calls, ["push /stories", "scroll", NAVIGATED]);
});

Deno.test("handleLinkClick reads replace and scroll from the anchor's attributes", () => {
  const window = createWindow();
  const { child } = createAnchor({
    href: "/stories?page=2",
    "data-laroux-link": "replace",
    "data-laroux-scroll": "false",
  });

  // The click lands on an element inside the anchor, such as an icon.
  linkNavigation.handleLinkClick(createClick(child), window);

  assert.assertEquals(window.calls, ["replace /stories?page=2", NAVIGATED]);
});

const BROWSER_CASES: ReadonlyArray<{
  name: string;
  attributes: Record<string, string>;
  options?: ClickOptions;
}> = [
  {
    name: "an anchor without the Link marker",
    attributes: { href: "/stories" },
  },
  {
    name: "a Link anchor without an href",
    attributes: { "data-laroux-link": "push" },
  },
  {
    name: "a target of _blank",
    attributes: {
      href: "/stories",
      "data-laroux-link": "push",
      target: "_blank",
    },
  },
  {
    name: "a bare download attribute",
    attributes: {
      href: "/report.pdf",
      "data-laroux-link": "push",
      download: "",
    },
  },
  {
    name: "a download file name",
    attributes: {
      href: "/report.pdf",
      "data-laroux-link": "push",
      download: "q3.pdf",
    },
  },
  {
    name: "an external URL",
    attributes: { href: "https://example.com/", "data-laroux-link": "push" },
  },
  {
    name: "a hash link",
    attributes: { href: "#comments", "data-laroux-link": "push" },
  },
  {
    name: "a modifier key",
    attributes: { href: "/stories", "data-laroux-link": "push" },
    options: { metaKey: true },
  },
  {
    name: "a non-primary button",
    attributes: { href: "/stories", "data-laroux-link": "push" },
    options: { button: 1 },
  },
  {
    name: "a default another handler already prevented",
    attributes: { href: "/stories", "data-laroux-link": "push" },
    options: { defaultPrevented: true },
  },
];

for (const { name, attributes, options } of BROWSER_CASES) {
  Deno.test(`handleLinkClick leaves a click on ${name} to the browser`, () => {
    const window = createWindow();
    const { anchor } = createAnchor(attributes);
    const click = createClick(anchor, options);

    const handled = linkNavigation.handleLinkClick(click, window);

    assert.assertEquals(handled, false);
    assert.assertEquals(window.calls, []);
    assert.assertEquals(
      click.defaultPrevented,
      options?.defaultPrevented ?? false,
    );
  });
}

Deno.test("handleLinkClick ignores a click whose target has no closest()", () => {
  const window = createWindow();

  // A click dispatched on the document itself has the document as target.
  const handled = linkNavigation.handleLinkClick(createClick({}), window);

  assert.assertEquals(handled, false);
  assert.assertEquals(window.calls, []);
});

type ClickListener = (event: linkNavigation.LinkClickEvent) => void;

const createDocument = () => {
  const listeners = new Set<ClickListener>();

  return {
    listeners,
    addEventListener: (_type: "click", listener: ClickListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: "click", listener: ClickListener) => {
      listeners.delete(listener);
    },
    click: (event: linkNavigation.LinkClickEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
};

Deno.test("installLinkNavigation navigates for Link clicks until it is removed", () => {
  const window = createWindow();
  const document = createDocument();
  const { anchor } = createAnchor({
    href: "/stories",
    "data-laroux-link": "push",
  });

  const uninstall = linkNavigation.installLinkNavigation(document, window);
  document.click(createClick(anchor));
  uninstall();
  document.click(createClick(anchor));

  assert.assertEquals(document.listeners.size, 0);
  assert.assertEquals(window.calls, ["push /stories", "scroll", NAVIGATED]);
});

Deno.test("a click a client-rendered Link handled is not navigated a second time", () => {
  const window = createWindow();
  const document = createDocument();
  linkNavigation.installLinkNavigation(document, window);

  // Link's handler uses globalThis.window; Deno has none, so the recording
  // window stands in for the click.
  const target = globalThis as { window?: unknown };
  const previousWindow = target.window;
  target.window = window;

  try {
    const element = link.Link({ href: "/stories", children: "Stories" });
    const anchorProps = element.props as Record<string, unknown> & {
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    };
    const attributes: Record<string, string> = {};
    for (const [name, value] of Object.entries(anchorProps)) {
      if (typeof value === "string") {
        attributes[name] = value;
      }
    }
    const click = createClick(createAnchor(attributes).anchor);

    // React's handler on the root container runs first, then the event
    // bubbles to the document.
    anchorProps.onClick(
      click as unknown as React.MouseEvent<HTMLAnchorElement>,
    );
    document.click(click);
  } finally {
    target.window = previousWindow;
  }

  assert.assertEquals(window.calls, ["push /stories", "scroll", NAVIGATED]);
});
