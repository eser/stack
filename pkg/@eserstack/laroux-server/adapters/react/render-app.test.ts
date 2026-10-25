// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as React from "react";
import type * as larouxRouter from "@eserstack/laroux/router";
import * as protocol from "@eserstack/laroux-react/protocol";
import * as renderApp from "./render-app.ts";

type LayoutComponent = React.ComponentType<
  larouxRouter.LayoutProps<React.ReactNode>
>;
type PageComponent = React.ComponentType<larouxRouter.PageProps>;

const Layout: LayoutComponent = (props) =>
  React.createElement("main", null, props.children);
const Page: PageComponent = (props) =>
  React.createElement("p", null, props.pathname);

/** The props a rendered layout element can carry. */
type RenderedLayoutProps = {
  readonly children?: unknown;
  readonly request?: unknown;
};

/** The props a rendered page element can carry. */
type RenderedPageProps = {
  readonly pathname?: unknown;
  readonly params?: unknown;
  readonly request?: unknown;
};

/** The props of the layout element and of the page element inside it. */
const propsOf = (element: React.ReactElement) => {
  const layoutProps = element.props as RenderedLayoutProps;
  const pageElement = layoutProps.children as React.ReactElement;
  return {
    layout: layoutProps,
    page: pageElement.props as RenderedPageProps,
  };
};

nodeTest.test("renderApp passes the request to the page and the layout", () => {
  const element = renderApp.renderApp(Layout, Page, {
    pathname: "/stories/hello",
    params: { slug: "hello" },
    requestContext: {
      cookieHeader: "user=ada%20l; theme=dark",
      host: "shop.test",
      localeParam: "tr",
    },
  });
  const { layout, page } = propsOf(element);

  assert.assertEquals(page.pathname, "/stories/hello");
  assert.assertEquals(page.params, { slug: "hello" });

  const request = page.request as larouxRouter.PageRequest;
  assert.assertEquals(request.cookies.get("user"), "ada l");
  assert.assertEquals(request.cookies.get("theme"), "dark");
  assert.assertEquals(request.host, "shop.test");
  assert.assertEquals(request.locale, "tr");
  assert.assertStrictEquals(layout.request, page.request);
});

nodeTest.test(
  "renderApp gives an empty request when the request data is left out",
  () => {
    const { page } = propsOf(renderApp.renderApp(Layout, Page));

    assert.assertEquals(page.pathname, "/");
    assert.assertEquals(page.params, {});
    const request = page.request as larouxRouter.PageRequest;
    assert.assertEquals(request.cookies.size, 0);
    assert.assertEquals(request.host, null);
    assert.assertEquals(request.locale, null);
  },
);

nodeTest.test("renderApp keeps the request away from client components", () => {
  // The bundler turns "use client" exports into references like these.
  const ClientLayout = protocol.createClientReference(
    "./layout.tsx",
    "Layout",
  ) as unknown as LayoutComponent;
  const ClientPage = protocol.createClientReference(
    "./page.tsx",
    "HomePage",
  ) as unknown as PageComponent;

  const element = renderApp.renderApp(ClientLayout, ClientPage, {
    pathname: "/",
    requestContext: { cookieHeader: "session=secret" },
  });
  const { layout, page } = propsOf(element);

  assert.assertEquals("request" in layout, false);
  assert.assertEquals("request" in page, false);
  assert.assertEquals(page.pathname, "/");
});
