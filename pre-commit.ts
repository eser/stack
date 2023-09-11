import metadata from "./metadata.json" assert { type: "json" };
import { deno, pathPosix } from "./deps.ts";

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = pathPosix.fromFileUrl(baseUrl.href);

  await deno.writeTextFile(`${basePath}/version.txt`, `${metadata.version}\n`);
};

main();
