// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Copied from $std/_tools/check_license.ts

import * as runtime from "../../standards/runtime.ts";
import { walk } from "./deps.ts";

const EXTENSIONS = ["*.js", ".ts", "*.jsx", ".tsx"];

const ROOT = new URL("../../", import.meta.url);
const CHECK = runtime.args.includes("--check");
const BASE_YEAR = "2023";
// const CURRENT_YEAR = new Date().getFullYear();
const RX_COPYRIGHT = new RegExp(
  `// Copyright ([0-9]{4})-present Eser Ozvataf and other contributors\\. All rights reserved\\. ([0-9A-Za-z-.]+) license\\.\n`,
);
const COPYRIGHT =
  `// Copyright ${BASE_YEAR}-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.`;

let failed = false;

for await (
  const entry of walk.walk(ROOT, {
    exts: EXTENSIONS,
    skip: [
      /_etc\/coverage\/*$/,
      /_etc\/temp\/*$/,
      /_etc\/templates\/*$/,
      /manifest\.gen\.ts$/,
    ],
    includeDirs: false,
  })
) {
  const content = await runtime.readTextFile(entry.path);
  const match = content.match(RX_COPYRIGHT);

  if (!match) {
    if (CHECK) {
      console.error(`Missing copyright header: ${entry.path}`);
      failed = true;
    } else {
      const contentWithCopyright = COPYRIGHT + "\n" + content;
      await runtime.writeTextFile(entry.path, contentWithCopyright);
      console.log("Copyright header automatically added to " + entry.path);
    }
  } else if (match[1] !== BASE_YEAR) {
    if (CHECK) {
      console.error(`Incorrect copyright year: ${entry.path}`);
      failed = true;
    } else {
      const index = match.index ?? 0;
      const contentWithoutCopyright = content.replace(match[0], "");
      const contentWithCopyright = contentWithoutCopyright.substring(0, index) +
        COPYRIGHT + "\n" + contentWithoutCopyright.substring(index);
      await runtime.writeTextFile(entry.path, contentWithCopyright);
      console.log("Copyright header automatically updated in " + entry.path);
    }
  }
}

if (failed) {
  console.info(`Copyright header should be "${COPYRIGHT}"`);
  runtime.exit(1);
}
