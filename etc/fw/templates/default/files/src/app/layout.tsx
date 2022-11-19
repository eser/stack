import { type Language } from "@hex/lib/i18n";
import { BodyContents, HeadContents } from "@hex/fw/web/page";

interface LayoutProps {
  lang: Language;
  children: JSX.Element;
}

const Layout = (props: LayoutProps) => {
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

export { Layout, Layout as default };
