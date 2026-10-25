// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as navigation from "@eserstack/laroux/navigation";
import * as useRouter from "./use-router.ts";

const NAVIGATED = `event ${navigation.NAVIGATION_EVENT_NAME}`;

// The router reads globalThis.window when it navigates. Node has no window,
// so each test runs with a recording stand-in that is removed after.
const withWindow = (fn: () => void): readonly string[] => {
  const calls: string[] = [];
  const target = globalThis as { window?: unknown };
  const previousWindow = target.window;

  target.window = {
    history: {
      pushState: (_data: unknown, _unused: string, url: string) =>
        calls.push(`push ${url}`),
      replaceState: (_data: unknown, _unused: string, url: string) =>
        calls.push(`replace ${url}`),
      back: () => calls.push("back"),
      forward: () => calls.push("forward"),
    },
    location: { reload: () => calls.push("reload") },
    scrollTo: () => calls.push("scroll"),
    dispatchEvent: (event: Event) => {
      calls.push(`event ${event.type}`);
      return true;
    },
  };

  try {
    fn();
  } finally {
    target.window = previousWindow;
  }

  return calls;
};

const ROUTER_CASES: ReadonlyArray<{
  name: string;
  run: (router: ReturnType<typeof useRouter.useRouter>) => void;
  expected: readonly string[];
}> = [
  {
    name: "push adds a history entry, scrolls and navigates",
    run: (router) => router.push("/stories"),
    expected: ["push /stories", "scroll", NAVIGATED],
  },
  {
    name: "push keeps the scroll position when scroll is false",
    run: (router) => router.push("/stories", { scroll: false }),
    expected: ["push /stories", NAVIGATED],
  },
  {
    name: "replace replaces the history entry and navigates",
    run: (router) => router.replace("/stories?page=2"),
    expected: ["replace /stories?page=2", "scroll", NAVIGATED],
  },
  {
    name: "back goes back in the history",
    run: (router) => router.back(),
    expected: ["back"],
  },
  {
    name: "forward goes forward in the history",
    run: (router) => router.forward(),
    expected: ["forward"],
  },
  {
    name: "refresh reloads the page",
    run: (router) => router.refresh(),
    expected: ["reload"],
  },
];

for (const { name, run, expected } of ROUTER_CASES) {
  nodeTest.test(`useRouter ${name}`, () => {
    const calls = withWindow(() => run(useRouter.useRouter()));

    assert.assertEquals(calls, expected);
  });
}

nodeTest.test("useRouter returns the same methods on every call", () => {
  assert.assertStrictEquals(useRouter.useRouter(), useRouter.useRouter());
});
