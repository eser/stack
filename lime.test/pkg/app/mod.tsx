// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { useState } from "npm:react";

export const baseLayout = () => {
  const [state] = useState({
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
        {state.styles.map((style) => <link rel="stylesheet" href={style} />)}
      </head>
      <body>
        {props.children}
        {state.scripts.map((script) => <script defer src={script}></script>)}
      </body>
    </html>
  );
};

export const indexPage = (props) => {
  return (
    <props.selectedLayout>
      <h1>Hello World</h1>
    </props.selectedLayout>
  );
};

export const anyFnc = (a, b, c) => {
  return a + b + c;
};

export const limeModule = (r) => {
  r.register(baseLayout);
  // = r.register(baseLayout, { type: "layout", name: "base", loc: "$/pkg/app/mod.tsx" });
  r.register(indexPage);
  // = r.register(indexPage, { type: "page", name: "index", path: "/", loc: "$/pkg/app/mod.tsx" });
  r.register(anyFnc);
};
