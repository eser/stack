// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.
// Copied from $std/_tools/check_license.ts

import * as runtime from "../../standards/runtime.ts";
import { walk } from "$std/fs/walk.ts";

const EXTENSIONS = ["*.js", ".ts", "*.jsx", ".tsx"];

const ROOT = new URL("../../", import.meta.url);
const CHECK = runtime.args.includes("--check");
const CURRENT_YEAR = new Date().getFullYear();
const RX_COPYRIGHT = new RegExp(
  `// Copyright ([0-9]{4})-present the cool authors\\. All rights reserved\\. ([0-9A-Za-z\-\.]+) license\\.\n`,
);
const COPYRIGHT =
  `// Copyright ${CURRENT_YEAR}-present the cool authors. All rights reserved. Apache-2.0 license.`;

let failed = false;

for await (
  const entry of walk(ROOT, {
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
  } else if (parseInt(match[1]) !== CURRENT_YEAR) {
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
