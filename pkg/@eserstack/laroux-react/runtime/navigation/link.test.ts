// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type * as React from "react";
import * as navigation from "@eserstack/laroux/navigation";
import * as link from "./link.ts";

type ClickResult = {
  readonly prevented: boolean;
  readonly calls: readonly string[];
};

type ClickOptions = {
  readonly button?: number;
  readonly metaKey?: boolean;
};

// Link reads history, scrolling and events from globalThis.window. Node has
// no window, so each click gets a recording stand-in that is removed after.
const click = (
  props: link.LinkProps,
  options: ClickOptions = {},
): ClickResult => {
  const calls: string[] = [];
  const target = globalThis as { window?: unknown };
  const previousWindow = target.window;

  target.window = {
    history: {
      pushState: (_state: unknown, _title: string, url: string) =>
        calls.push(`push ${url}`),
      replaceState: (_state: unknown, _title: string, url: string) =>
        calls.push(`replace ${url}`),
    },
    scrollTo: () => calls.push("scroll"),
    dispatchEvent: (event: Event) => {
      calls.push(`event ${event.type}`);
      return true;
    },
  };

  let prevented = false;
  const event = {
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

  try {
    const element = link.Link(props);
    const anchorProps =
      element.props as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    anchorProps.onClick?.(
      event as unknown as React.MouseEvent<HTMLAnchorElement>,
    );
  } finally {
    target.window = previousWindow;
  }

  return { prevented, calls };
};

nodeTest.test("Link navigates on the client for an internal path", () => {
  const result = click({ href: "/stories", children: "Stories" });

  assert.assertEquals(result.prevented, true);
  assert.assertEquals(result.calls, [
    "push /stories",
    "scroll",
    `event ${navigation.NAVIGATION_EVENT_NAME}`,
  ]);
});

nodeTest.test(
  "Link replaces the history entry without scrolling when asked",
  () => {
    const result = click({
      href: "/stories",
      children: "Stories",
      replace: true,
      scroll: false,
    });

    assert.assertEquals(result.calls, [
      "replace /stories",
      `event ${navigation.NAVIGATION_EVENT_NAME}`,
    ]);
  },
);

// prevented is what the browser sees: Link prevents nothing in these cases,
// so only an onClick of the app's own can prevent the default.
const browserCases: ReadonlyArray<{
  name: string;
  props: link.LinkProps;
  options?: ClickOptions;
  prevented: boolean;
}> = [
  {
    name: "a target of _blank",
    props: { href: "/stories", children: "Stories", target: "_blank" },
    prevented: false,
  },
  {
    name: "a target of _parent",
    props: { href: "/stories", children: "Stories", target: "_parent" },
    prevented: false,
  },
  {
    name: "a download attribute",
    props: { href: "/report.pdf", children: "Report", download: true },
    prevented: false,
  },
  {
    name: "a download file name",
    props: { href: "/report.pdf", children: "Report", download: "q3.pdf" },
    prevented: false,
  },
  {
    name: "an onClick that prevents default",
    props: {
      href: "/stories",
      children: "Stories",
      onClick: (event) => event.preventDefault(),
    },
    prevented: true,
  },
  {
    name: "a modifier key",
    props: { href: "/stories", children: "Stories" },
    options: { metaKey: true },
    prevented: false,
  },
  {
    name: "a non-primary button",
    props: { href: "/stories", children: "Stories" },
    options: { button: 1 },
    prevented: false,
  },
];

for (const testCase of browserCases) {
  nodeTest.test(
    `Link leaves a click with ${testCase.name} to the browser`,
    () => {
      const result = click(testCase.props, testCase.options);

      assert.assertEquals(result.calls, []);
      assert.assertEquals(result.prevented, testCase.prevented);
    },
  );
}

nodeTest.test("Link calls onClick for links it leaves to the browser", () => {
  const clicked: string[] = [];

  click({
    href: "https://example.com",
    children: "Example",
    onClick: () => clicked.push("external"),
  });

  assert.assertEquals(clicked, ["external"]);
});

nodeTest.test("Link handles a click with a target of _self", () => {
  const result = click({
    href: "/stories",
    children: "Stories",
    target: "_self",
  });

  assert.assertEquals(result.prevented, true);
});

nodeTest.test(
  "Link writes its options to data attributes for server-rendered links",
  () => {
    const element = link.Link({
      href: "/stories",
      children: "Stories",
      replace: true,
      scroll: false,
    });

    assert.assertEquals(element.type, "a");
    assert.assertObjectMatch(element.props as Record<string, unknown>, {
      href: "/stories",
      "data-laroux-link": "replace",
      "data-laroux-scroll": "false",
    });
  },
);
