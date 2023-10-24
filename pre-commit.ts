import metadata from "./metadata.json" assert { type: "json" };
import { deno, posix } from "./deps.ts";

const main = async () => {
  const baseUrl = new URL(".", import.meta.url);
  const basePath = posix.fromFileUrl(baseUrl.href);

  await deno.writeTextFile(`${basePath}/version.txt`, `${metadata.version}\n`);
};

main();
