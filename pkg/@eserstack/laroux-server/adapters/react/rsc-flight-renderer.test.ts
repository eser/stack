// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";
import * as larouxReact from "@eserstack/laroux-react";
import * as larouxBootstrap from "@eserstack/laroux-react/client/bootstrap";
import * as larouxClient from "@eserstack/laroux-react/client";
import * as protocol from "@eserstack/laroux-react/protocol";
import * as rscFlightRenderer from "./rsc-flight-renderer.ts";

/** Send a value the way an action result is sent, and decode it again. */
const roundTrip = (
  value: unknown,
  options: {
    readonly bundlerConfig?: rscFlightRenderer.BundlerConfig;
    readonly moduleLoader?: larouxClient.ModuleLoader;
  } = {},
): Promise<unknown> =>
  larouxClient.createValueFromReadableStream(
    rscFlightRenderer.renderValueToReadableStream(
      value,
      options.bundlerConfig ?? {},
    ),
    options.moduleLoader,
  );

const VALUE_CASES: { name: string; value: unknown }[] = [
  { name: "a Date", value: new Date("2026-01-02T03:04:05.000Z") },
  {
    name: "a Map with non-string keys and Date values",
    value: new Map<unknown, unknown>([
      ["published", new Date("2026-01-02T00:00:00.000Z")],
      [42, { views: 3 }],
    ]),
  },
  { name: "a Set", value: new Set(["news", "laroux"]) },
  { name: "undefined", value: undefined },
  { name: "a BigInt", value: 12345678901234567890n },
  {
    name: "numbers JSON turns into null or 0",
    value: [NaN, Infinity, -Infinity, -0, 1.5],
  },
  {
    name: "strings that start with $",
    value: ["$5", "$$", "$D2026", "$Q1", "$undefined", "$"],
  },
  {
    name: "the same object in two places",
    value: (() => {
      const tag = { name: "news" };
      return { primary: tag, tags: [tag] };
    })(),
  },
  {
    name: "nested plain data",
    value: {
      ok: true,
      count: 0,
      label: "",
      missing: undefined,
      items: [{ id: "a", at: new Date("2026-02-03T00:00:00.000Z") }],
    },
  },
];

for (const { name, value } of VALUE_CASES) {
  Deno.test(`renderValueToReadableStream sends ${name} to the client intact`, async () => {
    assert.assertEquals(await roundTrip(value), value);
  });
}

Deno.test("renderValueToReadableStream sends a Date, a Map and a React element in one result", async () => {
  const savedAt = new Date("2026-01-02T03:04:05.000Z");
  const result = await roundTrip({
    savedAt,
    counts: new Map([["views", 3]]),
    message: React.createElement("p", { className: "notice" }, "Saved $5"),
  }) as {
    savedAt: Date;
    counts: Map<string, number>;
    message: React.ReactElement<{ className: string; children: string }>;
  };

  assert.assertInstanceOf(result.savedAt, Date);
  assert.assertEquals(result.savedAt.getTime(), savedAt.getTime());
  assert.assertEquals(result.counts, new Map([["views", 3]]));
  assert.assertEquals(React.isValidElement(result.message), true);
  assert.assertEquals(result.message.type, "p");
  assert.assertEquals(result.message.props.className, "notice");
  assert.assertEquals(result.message.props.children, "Saved $5");
});

Deno.test("renderValueToReadableStream renders server components in a result", async () => {
  const Greeting = async (props: { readonly name: string }) => {
    await Promise.resolve();
    return React.createElement("strong", null, `Hello ${props.name}`);
  };

  const result = await roundTrip({
    message: React.createElement(Greeting, { name: "Ada" }),
  }) as { message: React.ReactElement<{ children: string }> };

  assert.assertEquals(result.message.type, "strong");
  assert.assertEquals(result.message.props.children, "Hello Ada");
});

Deno.test("renderValueToReadableStream sends client components as module references", async () => {
  const Counter = (props: { readonly start: number }) =>
    React.createElement("output", null, props.start);
  const loaded: string[] = [];

  const result = await roundTrip(
    React.createElement(
      // The bundler turns a "use client" export into this reference.
      protocol.createClientReference(
        "./counter.tsx",
        "Counter",
      ) as unknown as typeof Counter,
      { start: 2 },
    ),
    {
      bundlerConfig: {
        "./counter.tsx": {
          id: "/chunk-counter.js",
          chunks: ["chunk-counter.js"],
          name: "Counter",
        },
      },
      moduleLoader: (id, exportName) => {
        loaded.push(`${id}#${exportName}`);
        return Counter;
      },
    },
  ) as React.ReactElement<{ start: number }>;

  assert.assertEquals(loaded, ["/chunk-counter.js#Counter"]);
  assert.assertStrictEquals(result.type, Counter);
  assert.assertEquals(result.props.start, 2);
});

Deno.test("renderValueToReadableStream sends server actions as callable references", async () => {
  const save = Object.assign(() => Promise.resolve(), {
    $$typeof: Symbol.for("react.server.reference"),
    $$id: "src/app/actions#save",
    $$bound: null,
  });

  const result = await roundTrip({ save }) as {
    save: { $$id: string };
  };

  assert.assertEquals(typeof result.save, "function");
  assert.assertEquals(result.save.$$id, "src/app/actions#save");
});

const UNSUPPORTED_CASES = [
  {
    name: "a plain function",
    value: { user: { onSave: () => {} } },
    message: "value.user.onSave is a function",
  },
  {
    name: "a symbol",
    value: [Symbol("secret")],
    message: "value[0] is a symbol",
  },
  {
    name: "a promise",
    value: { pending: Promise.resolve(1) },
    message: "value.pending is a promise",
  },
  {
    name: "an object that contains itself",
    value: (() => {
      const draft: { title: string; revisions: unknown[] } = {
        title: "Draft",
        revisions: [],
      };
      draft.revisions.push(draft);
      return draft;
    })(),
    message: "value.revisions[0] contains itself",
  },
];

for (const { name, value, message } of UNSUPPORTED_CASES) {
  Deno.test(`renderValueToReadableStream rejects ${name} with a message that names it`, async () => {
    await assert.assertRejects(() => roundTrip(value), Error, message);
  });
}

Deno.test("renderToReadableStream escapes text and props that start with $", async () => {
  const RSCTreeRoot = await larouxClient.createFromReadableStream(
    rscFlightRenderer.renderToReadableStream(
      React.createElement("p", { title: "$5 off" }, "$D-day"),
      {},
    ),
  );
  // Let the stream apply before the tree is read.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const element = RSCTreeRoot() as React.ReactElement<
    { title: string; children: string }
  >;
  assert.assertEquals(element.props.title, "$5 off");
  assert.assertEquals(element.props.children, "$D-day");
});

Deno.test("renderToReadableStream sends the items of an array a server component returns", async () => {
  const List = () => [
    React.createElement("li", { key: "a" }, "A"),
    React.createElement("li", { key: "b" }, "B"),
  ];

  const items = await larouxClient.createValueFromReadableStream(
    rscFlightRenderer.renderToReadableStream(React.createElement(List), {}),
  ) as React.ReactElement<{ children: string }>[];

  assert.assertEquals(items.map((item) => item.type), ["li", "li"]);
  assert.assertEquals(items.map((item) => item.props.children), ["A", "B"]);
});

Deno.test("a Link that a server component renders navigates on the client", async () => {
  // laroux calls a server component as a plain function, so the Link in it
  // runs on the server too.
  const StoriesNav = () =>
    React.createElement(larouxReact.Link, {
      href: "/stories",
      replace: true,
      children: "Stories",
    });

  const anchor = await larouxClient.createValueFromReadableStream(
    rscFlightRenderer.renderToReadableStream(
      React.createElement(StoriesNav),
      {},
    ),
  ) as React.ReactElement<{
    readonly onClick?: unknown;
    readonly [name: string]: unknown;
  }>;

  // The click handler does not survive the trip to the browser; the anchor's
  // options do, in its data attributes, in the RSC tree and in the HTML.
  assert.assertEquals(anchor.type, "a");
  assert.assertEquals(anchor.props.onClick, undefined);
  assert.assertEquals(
    ReactDOMServer.renderToStaticMarkup(anchor),
    '<a href="/stories" data-laroux-link="replace">Stories</a>',
  );

  // The browser side: the listener the client bootstrap installs, and a click
  // on the rendered anchor.
  const calls: string[] = [];
  const window: larouxBootstrap.NavigationWindow = {
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
  const listeners: ((event: larouxBootstrap.LinkClickEvent) => void)[] = [];
  const document: larouxBootstrap.LinkNavigationDocument = {
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: () => {},
  };
  const anchorElement = {
    getAttribute: (name: string) => {
      const value = anchor.props[name];
      return typeof value === "string" ? value : null;
    },
    closest: (selectors: string) =>
      selectors === `a[${larouxBootstrap.LINK_ATTRIBUTE}]`
        ? anchorElement
        : null,
  };
  let prevented = false;
  const click: larouxBootstrap.LinkClickEvent = {
    target: anchorElement,
    button: 0,
    metaKey: false,
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

  const uninstall = larouxBootstrap.installLinkNavigation(document, window);
  for (const listener of listeners) {
    listener(click);
  }
  uninstall();

  assert.assertEquals(prevented, true);
  assert.assertEquals(calls, [
    "replace /stories",
    "scroll",
    "event __laroux_navigate",
  ]);
});
