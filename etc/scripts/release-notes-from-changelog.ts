// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Writes the CHANGELOG.md section for one tag to a file.
 *
 * The release-notes job runs this with a bare `node` while it holds a
 * contents: write token, so it imports only the dependency-free parser and
 * Node built-ins. Nothing is installed from a registry.
 *
 * Usage: node etc/scripts/release-notes-from-changelog.ts <tag> <out-file>
 *
 * @module
 */

// A bare `node` runs this script with no import map, so it imports `node:`
// built-ins, and its usage and result lines are the job's terminal output.
// deno-lint-ignore-file no-external-import no-console

import * as fs from "node:fs";
import * as process from "node:process";
import * as changelogText from "../../pkg/@eserstack/codebase/changelog-text.ts";

const [rawTag, outFile] = process.argv.slice(2);
if (rawTag === undefined || outFile === undefined) {
  console.error("usage: release-notes-from-changelog.ts <tag> <out-file>");
  process.exit(2);
}

const tag = changelogText.normalizeTag(rawTag);
const entry = changelogText
  .parseChangelogText(fs.readFileSync("CHANGELOG.md", "utf8"))
  .find((e) => e.tag === tag);

if (entry === undefined) {
  console.error(`No matching changelog section found for ${tag}.`);
  process.exit(1);
}

fs.writeFileSync(outFile, entry.notes);
console.log(`Wrote ${tag} notes (${entry.notes.length} bytes) to ${outFile}`);
