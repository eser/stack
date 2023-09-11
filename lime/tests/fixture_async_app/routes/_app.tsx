import { delay } from "$std/async/delay.ts";
import { type AppContext } from "$cool/lime/src/server/types.ts";

export default async function App(_req: Request, ctx: AppContext) {
  await delay(100);

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>cool lime title</title>
      </head>
      <body>
        <div className="app">
          App template
          <ctx.Component />
        </div>
      </body>
    </html>
  );
}
