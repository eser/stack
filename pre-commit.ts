import metadata from "./src/metadata.json" assert { type: "json" };
import * as pathPosix from "https://deno.land/std@0.160.0/path/posix.ts";

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = pathPosix.fromFileUrl(baseUrl.href);

  await Deno.writeTextFile(`${basePath}/version.txt`, `${metadata.version}\n`);
};

main();
