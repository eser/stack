import React from "npm:react@18.2.0";

import {
  dumper,
  dumperReact,
  executeFromCli,
  type HexFunctionInput,
  results,
} from "$cool/hex/functions/mod.ts";
import { type Language } from "$cool/hex/i18n/mod.ts";

export interface PageProps {
  lang: Language;
}

export const Page = (_input: HexFunctionInput<PageProps>) => {
  return results.reactView(
    <div>
      <h1>Homepage</h1>
    </div>,
    {
      title: "Homepage",
      description: "This is the homepage",
      layout: "$app/shared/layout/layout.tsx",
    },
  );
};

if (import.meta.main) {
  const result = executeFromCli(Page);
  // dumper(result);
  dumperReact(result);
}

export { Page as default };
