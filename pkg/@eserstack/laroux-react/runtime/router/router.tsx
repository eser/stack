// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Server-side Router component

import type { ComponentType, ReactNode } from "react";
import type { RouteDefinition, RouteParams } from "@eserstack/laroux/router";
import { findMatchingRoute, normalizePath } from "@eserstack/laroux/router";

/**
 * React-specific route component props
 */
interface RouteComponentProps {
  params: RouteParams & { locale: string };
}

/**
 * React-specific layout component props
 */
interface LayoutComponentProps extends RouteComponentProps {
  children: ReactNode;
}

interface RouterProps {
  routes: RouteDefinition[];
  pathname: string;
  locale?: string;
  notFound?: ReactNode;
}

/**
 * Server Component that matches and renders routes
 * This runs on the server and determines which component to render
 */
export function Router(
  { routes, pathname, locale, notFound }: RouterProps,
): ReactNode {
  const normalizedPath = normalizePath(pathname);
  const match = findMatchingRoute(normalizedPath, routes);

  if (!match) {
    return notFound || <div>404 - Page Not Found</div>;
  }

  const { route, params } = match;
  // Cast generic component types to React component types
  const Component = route.component as ComponentType<RouteComponentProps>;
  const Layout = route.layout as
    | ComponentType<LayoutComponentProps>
    | undefined;

  // Merge locale into params for route components
  const enrichedParams = { ...params, locale: locale ?? "en" };

  // Render with layout if provided
  if (Layout) {
    return (
      <Layout params={enrichedParams}>
        <Component params={enrichedParams} />
      </Layout>
    );
  }

  // Render component directly
  return <Component params={enrichedParams} />;
}
