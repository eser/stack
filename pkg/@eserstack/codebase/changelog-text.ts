// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CHANGELOG.md parsing with no imports, so a release job can extract notes
 * with a bare `node` and nothing installed from a registry.
 *
 * @module
 */

/**
 * A parsed entry from a CHANGELOG.md file.
 */
export type ChangelogEntry = {
  /** Version string (e.g., "4.0.43") */
  readonly version: string;
  /** Release date (e.g., "2024-07-16"), empty if not specified */
  readonly date: string;
  /** Git tag (e.g., "v4.0.43") */
  readonly tag: string;
  /** Formatted release notes markdown */
  readonly notes: string;
};

/**
 * Matches a release heading: `## 1.2.3 - 2026-01-01`, or the legacy
 * `## [v1.2.3] - 2026-01-01`. The validate job in build.yml mirrors it.
 */
export const HEADING_PATTERN =
  /^##\s{1,100}\[?([^\]\s]+)\]?\s{0,100}-?\s{0,100}([0-9]{4}-[0-9]{2}-[0-9]{2})?\s{0,100}$/;

/**
 * Normalizes a tag string by stripping `refs/tags/` prefix and ensuring a `v` prefix.
 *
 * @param rawTag - The raw tag string
 * @returns Normalized tag with `v` prefix
 */
export const normalizeTag = (rawTag: string): string => {
  const trimmed = rawTag.trim().replace(/^refs\/tags\//, "");
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
};

/**
 * Parses raw changelog text into structured entries.
 * This is a pure function with no I/O — useful for testing.
 *
 * @param text - Raw CHANGELOG.md content
 * @returns Array of changelog entries, most recent first
 */
export const parseChangelogText = (text: string): ChangelogEntry[] => {
  const lines = text.split(/\r?\n/);
  const headings: {
    version: string;
    date: string;
    headingLineIndex: number;
  }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const m = line.match(HEADING_PATTERN);
    if (m === null) {
      continue;
    }

    // The file carries both heading styles: bare "## 1.2.3 - date" from the
    // current generator and legacy "## [v1.2.3] - date" sections. Strip the
    // `v` first, or the legacy ones fail the digit test below and vanish from
    // the parse entirely.
    const version = m[1]!.replace(/^v/, "");

    // Skip non-version headings like [Unreleased]
    if (!/^\d/.test(version)) {
      continue;
    }

    headings.push({
      version,
      date: m[2] ?? "",
      headingLineIndex: index,
    });
  }

  if (headings.length === 0) {
    return [];
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const bodyStart = heading.headingLineIndex + 1;
    const bodyEnd = nextHeading !== undefined
      ? nextHeading.headingLineIndex
      : lines.length;

    const bodyLines = lines.slice(bodyStart, bodyEnd);
    while (bodyLines.length > 0 && bodyLines[0]!.trim() === "") {
      bodyLines.shift();
    }
    while (
      bodyLines.length > 0 && bodyLines[bodyLines.length - 1]!.trim() === ""
    ) {
      bodyLines.pop();
    }

    const notesParts = [
      `## ${heading.version}${heading.date !== "" ? ` - ${heading.date}` : ""}`,
    ];
    if (bodyLines.length > 0) {
      notesParts.push("", ...bodyLines);
    }

    return {
      version: heading.version,
      date: heading.date,
      tag: `v${heading.version}`,
      notes: `${notesParts.join("\n").trim()}\n`,
    };
  });
};
