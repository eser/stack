// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type AppProps } from "../../../../server.ts";
import { Partial } from "../../../../runtime.ts";
import { Fader } from "../../islands/Fader.tsx";

export default function AppLayout({ Component }: AppProps) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>cool lime title</title>
      </head>
      <body f-client-nav>
        <Partial name="body">
          <Fader>
            <Component />
          </Fader>
        </Partial>
        <p>
          <a
            className="page-a-link"
            href="/client_nav/page-a"
          >
            Page A
          </a>
        </p>
        <p>
          <a
            className="page-b-link"
            href="/client_nav/page-b"
          >
            Page B
          </a>
        </p>
        <p>
          <a
            className="page-c-link"
            href="/client_nav/page-c"
          >
            Page C
          </a>
        </p>

        <pre id="logs" />
      </body>
    </html>
  );
}
