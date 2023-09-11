import { type AppProps, type Handler } from "$cool/lime/server.ts";

export const handler: Handler = (_req, ctx) => {
  ctx.state.lang = "de";
  return ctx.render();
};

export default function App(
  { Component, state }: AppProps<unknown, { lang: string }>,
) {
  return (
    <html lang={state.lang} className="html">
      <head className="head">
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>cool lime title</title>
      </head>
      <body className="body">
        <div className="inner-body">
          <Component />
        </div>
      </body>
    </html>
  );
}
