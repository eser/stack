import React from "https://jspm.dev/react@17.0.2";

import {
  dumper,
  dumperReact,
  executeFromCli,
  type HexFunctionInput,
  results,
} from "@hex/functions/mod.ts";
import { type Language } from "@hex/i18n/mod.ts";

interface PageProps {
  lang: Language;
}

const Page = function HomeIndex(input: HexFunctionInput<PageProps>) {
  return results.reactView(
    <div>
      <h1>Homepage</h1>
    </div>,
    {
      title: "Homepage",
      description: "This is the homepage",
      layout: "@app/shared/layout/layout.tsx",
    },
  );
};

const result = executeFromCli(Page);
// dumper(result);
dumperReact(result);

export { Page, Page as default };
