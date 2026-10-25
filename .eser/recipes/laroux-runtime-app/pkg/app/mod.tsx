// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as react from "react";

type LayoutProps = {
  readonly children?: react.ReactNode;
};

type PageProps = {
  readonly selectedLayout: react.ComponentType<LayoutProps>;
};

type LayoutState = {
  readonly title: string;
  readonly description: string;
  readonly keywords: string;
  readonly styles: readonly string[];
  readonly scripts: readonly string[];
};

type Registry = {
  readonly register: (entry: (...args: never[]) => unknown) => void;
};

export const baseLayout = (props: LayoutProps) => {
  const [state] = react.useState<LayoutState>({
    title: "",
    description: "",
    keywords: "",
    styles: [],
    scripts: [],
  });

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{state.title}</title>
        <meta name="description" content={state.description} />
        <meta name="keywords" content={state.keywords} />
        {state.styles.map((style) => (
          <link key={style} rel="stylesheet" href={style} />
        ))}
      </head>
      <body>
        {props.children}
        {state.scripts.map((script) => (
          <script key={script} defer src={script}></script>
        ))}
      </body>
    </html>
  );
};

export const indexPage = (props: PageProps) => {
  return (
    <props.selectedLayout>
      <h1>Hello World</h1>
    </props.selectedLayout>
  );
};

export const sum = (a: number, b: number, c: number) => {
  return a + b + c;
};

export const appModule = (r: Registry) => {
  r.register(baseLayout);
  // = r.register(baseLayout, { type: "layout", name: "base", loc: "$/pkg/app/mod.tsx" });
  r.register(indexPage);
  // = r.register(indexPage, { type: "page", name: "index", path: "/", loc: "$/pkg/app/mod.tsx" });
  r.register(sum);
};
