import { defineApp } from "../../../server.ts";

export default defineApp((_res, ctx) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>test</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body f-client-nav>
        <ctx.Component />
      </body>
    </html>
  );
});
