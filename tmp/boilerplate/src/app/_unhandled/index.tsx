import { type Context, results } from "@hex/web/page";
import { type Language } from "@hex/i18n";

interface PageProps {
  lang: Language;
}

const Page = function HomeIndex(ctx: Context<PageProps>) {
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

export { Page, Page as default };
