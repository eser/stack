// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Helper to render the App with Layout and Page components
 * Separated into .tsx file to avoid JSX in .ts files for JSR compatibility
 */

import * as React from "react";
import * as larouxRouter from "@eserstack/laroux/router";
import * as protocol from "@eserstack/laroux-react/protocol";

/**
 * Raw data of the request being rendered, which renderApp turns into the
 * `request` prop (a PageRequest from `@eserstack/laroux`).
 */
export type RenderAppRequestContext = {
  /** The Cookie header, or null when the request has none. */
  readonly cookieHeader?: string | null;
  /** The Host header, or null when the request has none. */
  readonly host?: string | null;
  /** The `locale` search parameter of the page's URL, or null. */
  readonly localeParam?: string | null;
};

/**
 * Props passed to the render function
 */
export type RenderAppProps = {
  /** Pathname of the page being rendered. */
  readonly pathname: string;
  /** Values of the route's dynamic segments; empty when left out. */
  readonly params?: larouxRouter.RouteParams;
  /**
   * Data of the request being rendered. It is passed with each render and
   * never kept in module scope, which concurrent requests share.
   */
  readonly requestContext?: RenderAppRequestContext;
};

/**
 * Renders the Layout with Page as children.
 *
 * The page receives `params`, `pathname` and `request` (PageProps from
 * `@eserstack/laroux`), and the layout `children` and `request`. A layout or
 * page that is a client component gets no `request`: its props are sent to
 * the browser, and the cookies would go with them, HttpOnly ones included.
 *
 * @param Layout - The Layout component to wrap the page
 * @param Page - The Page component for the matched route
 * @param props - Props including pathname, params, and request context; when
 *   left out, the page renders for "/" with no params and an empty request
 */
export function renderApp(
  Layout: React.ComponentType<larouxRouter.LayoutProps<React.ReactNode>>,
  Page: React.ComponentType<larouxRouter.PageProps>,
  props?: RenderAppProps,
): React.ReactElement {
  const requestContext = props?.requestContext;
  const request = larouxRouter.createPageRequest({
    cookieHeader: requestContext?.cookieHeader,
    host: requestContext?.host,
    locale: requestContext?.localeParam,
  });

  const pageProps = {
    params: props?.params ?? {},
    pathname: props?.pathname ?? "/",
  };
  // A client reference is not called here: the flight renderer sends the
  // props it is given to the browser, so it gets them without request. Its
  // declared props require request, hence the cast through unknown.
  const pageElement = protocol.isClientReference(Page)
    ? React.createElement(
        Page as unknown as React.ComponentType<
          Omit<larouxRouter.PageProps, "request">
        >,
        pageProps,
      )
    : React.createElement(Page, { ...pageProps, request });

  return protocol.isClientReference(Layout)
    ? React.createElement(
        Layout as unknown as React.ComponentType<{ children: React.ReactNode }>,
        null,
        pageElement,
      )
    : React.createElement(
        // children is the third argument, which the props type does not see
        Layout as React.ComponentType<
          Omit<larouxRouter.LayoutProps<React.ReactNode>, "children">
        >,
        { request },
        pageElement,
      );
}
