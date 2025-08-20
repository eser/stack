// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Copied from $std/_tools/check_license.ts

import * as posix from "@std/path/posix";
import * as walk from "@std/fs/walk";
import * as jsRuntime from "@eser/standards/js-runtime";

const main = async () => {
  const EXTENSIONS = ["*.js", ".ts", "*.jsx", ".tsx"];
  const EXCLUDES = [
    /docs\/*$/,
    /etc\/coverage\/*$/,
    /etc\/temp\/*$/,
    /etc\/templates\/*$/,
    /node_modules\/*$/,
    /test\/apps\/cf-workers-app\/node_modules\/*$/,
    /test\/apps\/cf-workers-app\/worker-configuration\.d\.ts$/,
    /manifest\.gen\.ts$/,
  ];

  const baseUrl = new URL(".", import.meta.url);
  const basePath = posix.join(
    posix.fromFileUrl(baseUrl.href),
    "..",
  );

  const CHECK = jsRuntime.current.getArgs().includes("--check");
  const BASE_YEAR = "2023";
  // const CURRENT_YEAR = new Date().getFullYear();
  const RX_COPYRIGHT = new RegExp(
    `// Copyright ([0-9]{4})-present Eser Ozvataf and other contributors\\. All rights reserved\\. ([0-9A-Za-z-.]+) license\\.\n`,
  );
  const COPYRIGHT =
    `// Copyright ${BASE_YEAR}-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.`;

  let failed = false;

  for await (
    const entry of walk.walk(basePath, {
      exts: EXTENSIONS,
      skip: EXCLUDES,
      includeDirs: false,
    })
  ) {
    const content = await jsRuntime.current.readTextFile(entry.path);
    const match = content.match(RX_COPYRIGHT);

    if (match) {
      if (match[1] === BASE_YEAR) {
        // everything is fine
        continue;
      }

      if (CHECK) {
        console.error(`Incorrect copyright year: ${entry.path}`);
        failed = true;
        continue;
      }

      const index = match.index ?? 0;
      const contentWithoutCopyright = content.replace(match[0], "");
      const contentWithCopyright = contentWithoutCopyright.substring(0, index) +
        COPYRIGHT + "\n" + contentWithoutCopyright.substring(index);
      await jsRuntime.current.writeTextFile(entry.path, contentWithCopyright);
      console.log("Copyright header automatically updated in " + entry.path);

      continue;
    }

    if (CHECK) {
      console.error(`Missing copyright header: ${entry.path}`);
      failed = true;
      continue;
    }

    const contentWithCopyright = COPYRIGHT + "\n" + content;
    await jsRuntime.current.writeTextFile(entry.path, contentWithCopyright);
    console.log("Copyright header automatically added to " + entry.path);
  }

  if (failed) {
    console.info(`Copyright header should be "${COPYRIGHT}"`);
    jsRuntime.current.exit(1);
  }
};

main();
