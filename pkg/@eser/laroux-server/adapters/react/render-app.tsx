// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Helper to render the App with Layout and Page components
 * Separated into .tsx file to avoid JSX in .ts files for JSR compatibility
 */

import React from "react";

/**
 * Props passed to the render function
 */
interface RenderAppProps {
  pathname: string;
  params?: Record<string, string | string[]>;
  requestContext?: {
    cookieHeader?: string | null;
    host?: string;
    localeParam?: string | null;
  };
}

/**
 * Renders the Layout with Page as children
 * @param Layout - The Layout component to wrap the page
 * @param Page - The Page component for the matched route
 * @param props - Props including pathname, params, and request context
 */
export function renderApp(
  Layout: React.ComponentType<{ children: React.ReactNode }>,
  Page: React.ComponentType<Record<string, unknown>>,
  props?: RenderAppProps,
): React.ReactElement {
  const pageElement = React.createElement(Page, {
    params: props?.params,
    pathname: props?.pathname,
  });

  return React.createElement(Layout, { children: pageElement });
}
