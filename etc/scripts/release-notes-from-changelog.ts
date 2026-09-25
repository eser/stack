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

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import {
  normalizeTag,
  parseChangelogText,
} from "../../pkg/@eserstack/codebase/changelog-text.ts";

const [rawTag, outFile] = process.argv.slice(2);
if (rawTag === undefined || outFile === undefined) {
  console.error("usage: release-notes-from-changelog.ts <tag> <out-file>");
  process.exit(2);
}

const tag = normalizeTag(rawTag);
const entry = parseChangelogText(readFileSync("CHANGELOG.md", "utf8"))
  .find((e) => e.tag === tag);

if (entry === undefined) {
  console.error(`No matching changelog section found for ${tag}.`);
  process.exit(1);
}

writeFileSync(outFile, entry.notes);
console.log(`Wrote ${tag} notes (${entry.notes.length} bytes) to ${outFile}`);
