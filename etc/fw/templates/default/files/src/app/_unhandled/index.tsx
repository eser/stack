import { type Language } from "@hex/lib/i18n";
import { type Context, results } from "@hex/fw/web/page";

export interface PageProps {
  lang: Language;
}

export const Page = (_ctx: Context<PageProps>) => {
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

export { Page as default };
