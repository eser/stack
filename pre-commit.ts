import metadata from "./metadata.json" assert { type: "json" };
import { deno } from "./deps.ts";
import { fromFileUrl } from "$std/path/posix.ts";

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = fromFileUrl(baseUrl.href);

  await deno.writeTextFile(`${basePath}/version.txt`, `${metadata.version}\n`);
};

main();
