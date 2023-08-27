import { type Language } from "$cool/hex/i18n/mod.ts";
import { BodyContents, HeadContents } from "$cool/hex/web/page.ts";

export interface LayoutProps {
  lang: Language;
  children: JSX.Element;
}

export const Layout = (props: LayoutProps) => {
  return (
    <html lang={props.lang.code}>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <link rel="icon" href="/favicon.ico" />

        <HeadContents />
      </head>
      <body>
        <div id="app">
          <Routes content={props.children}>
            <PathBasedRoutes />
          </Routes>
        </div>

        <BodyContents />
      </body>
    </html>
  );
};

export { Layout as default };
