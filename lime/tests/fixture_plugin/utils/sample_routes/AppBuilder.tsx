import { type AppProps } from "$cool/lime/server.ts";
import { Head } from "../../../../runtime.ts";
import { type Options } from "../route-plugin.ts";

export function AppBuilder(options: Options) {
  return ({ Component }: AppProps) => {
    return (
      <>
        <Head>
          <title>{options.title}</title>
        </Head>
        <main className="max-w-screen-md px-4 pt-16 mx-auto">
          <Component />
        </main>
      </>
    );
  };
}
