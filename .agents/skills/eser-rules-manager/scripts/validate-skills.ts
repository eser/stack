// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Validates every skill under `.agents/skills/` (or the skill directories
 * given as arguments) against the format in references/skill-format.md, and
 * checks that the eser-rules-manager tables list every skill.
 *
 * Uses only Node built-ins so it runs without an install:
 *   node .agents/skills/eser-rules-manager/scripts/validate-skills.ts
 *   deno run --allow-read .agents/skills/eser-rules-manager/scripts/validate-skills.ts
 *
 * `--fix` rewrites the `## Contents` list of every reference file longer than
 * the table-of-contents threshold before validating.
 *
 * Exits 1 when any error is found. Warnings do not fail the run.
 *
 * @module
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";

const MAX_SKILL_LINES = 80;
const MAX_DESCRIPTION = 1024;
// Every description sits in the context of every session; past this it
// usually repeats what the body says.
const TARGET_DESCRIPTION = 400;
// Anthropic's guidance: reference files over 100 lines start with a table of
// contents, so a partial read still shows everything the file covers.
const TOC_THRESHOLD = 100;
const TARGET_REFERENCE_LINES = 500;
const ALLOWED_KEYS = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
  // Claude Code fields that other agents ignore without changing how the skill
  // reads: a command-style skill the user starts, and its argument hint.
  "disable-model-invocation",
  "argument-hint",
]);

type Finding = { skill: string; level: "error" | "warning"; message: string };

const skillsRoot = resolve(import.meta.dirname ?? ".", "../..");

/** Headings of the given levels outside fenced code blocks, in order. */
const headingsAt = (text: string, prefix: RegExp): string[] => {
  const headings: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker !== null) {
      if (fence === null) fence = marker[1]!;
      else if (marker[1]!.startsWith(fence)) fence = null;
      continue;
    }
    const match = fence === null ? line.match(prefix) : null;
    if (match !== null) headings.push(line.slice(match[0].length).trim());
  }
  return headings;
};

const sectionHeadings = (text: string): string[] => headingsAt(text, /^## /);

const lineCount = (text: string): number =>
  text.replace(/\n$/, "").split("\n").length;

const buildContents = (headings: readonly string[]): string =>
  `## Contents\n\n${
    headings.filter((h) => h !== "Contents").map((h) => `- ${h}`).join("\n")
  }\n`;

/**
 * Inserts or refreshes the `## Contents` block, which sits after the H1 and
 * its intro paragraph and ends at the next `---` or `## ` line.
 */
const withContents = (text: string): string => {
  const headings = sectionHeadings(text);
  const block = buildContents(headings);
  const existing = text.match(/^## Contents\n[\s\S]*?(?=\n---\n|\n## )/m);
  if (existing !== null) {
    return text.replace(existing[0], block.replace(/\n$/, ""));
  }
  const firstSection = text.search(/^(---|## )/m);
  if (firstSection < 0) return text;
  return `${text.slice(0, firstSection)}${block}\n---\n\n${
    text.slice(firstSection).replace(/^---\n\n/, "")
  }`;
};

const contentsMatches = (text: string): boolean => {
  const block = text.match(/^## Contents\n([\s\S]*?)(?=\n---\n|\n## )/m);
  if (block === null) return false;
  const listed = [...block[1]!.matchAll(/^- (.+)$/gm)].map((m) => m[1]!.trim());
  const actual = sectionHeadings(text).filter((h) => h !== "Contents");
  return listed.length === actual.length &&
    listed.every((h, i) => h === actual[i]);
};

const referenceFiles = (dir: string): string[] => {
  const refs = join(dir, "references");
  if (!existsSync(refs)) return [];
  return readdirSync(refs).filter((f) => f.endsWith(".md")).sort();
};

const parseFrontmatter = (
  text: string,
): Record<string, string> | null => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (match === null) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv === null) continue;
    fields[kv[1]!] = kv[2]!.replace(/^(["'])([\s\S]*)\1$/, "$2");
  }
  return fields;
};

const validateSkill = (dir: string): Finding[] => {
  const skill = basename(dir);
  const findings: Finding[] = [];
  const error = (message: string) =>
    findings.push({ skill, level: "error", message });
  const warn = (message: string) =>
    findings.push({ skill, level: "warning", message });

  const skillFile = join(dir, "SKILL.md");
  if (!existsSync(skillFile)) {
    error("SKILL.md not found");
    return findings;
  }
  const text = readFileSync(skillFile, "utf8");

  const fm = parseFrontmatter(text);
  if (fm === null) {
    error("SKILL.md has no YAML frontmatter (--- name/description ---)");
    return findings;
  }

  for (const key of Object.keys(fm)) {
    if (!ALLOWED_KEYS.has(key)) {
      error(
        `unexpected frontmatter key "${key}"; allowed: ${
          [...ALLOWED_KEYS].join(", ")
        }`,
      );
    }
  }

  const name = fm["name"] ?? "";
  if (name === "") error("frontmatter is missing name");
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    error(`name "${name}" must be kebab-case and at most 64 characters`);
  } else if (name !== skill) {
    error(`name "${name}" does not match the directory name "${skill}"`);
  }

  const description = fm["description"] ?? "";
  if (description === "") error("frontmatter is missing description");
  else {
    if (description.length > MAX_DESCRIPTION) {
      error(
        `description is ${description.length} characters; the limit is ${MAX_DESCRIPTION}`,
      );
    } else if (description.length > TARGET_DESCRIPTION) {
      warn(
        `description is ${description.length} characters; aim for under ${TARGET_DESCRIPTION}`,
      );
    }
    if (/[<>]/.test(description)) {
      error("description contains < or >, which some loaders reject");
    }
    const userInvoked = /^(true|yes|on|1)$/i.test(
      fm["disable-model-invocation"] ?? "",
    );
    if (!userInvoked && !/\buse (it )?(when|for|before)\b/i.test(description)) {
      error('description has no "Use when/for ..." trigger clause');
    }
  }

  const lines = lineCount(text);
  if (lines > MAX_SKILL_LINES) {
    error(
      `SKILL.md is ${lines} lines; the limit is ${MAX_SKILL_LINES}. Move detail to references/`,
    );
  }

  for (const heading of ["## Always", "## References"]) {
    if (!text.includes(`\n${heading}`)) warn(`SKILL.md has no "${heading}"`);
  }

  for (const [, target] of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
    if (/^[a-z]+:/.test(target!)) continue;
    if (!existsSync(join(dir, target!))) {
      error(`SKILL.md links to ${target}, which does not exist`);
    }
  }

  for (const file of referenceFiles(dir)) {
    const ref = `references/${file}`;
    if (!text.includes(`](${ref})`)) {
      error(
        `${ref} is not linked from SKILL.md; link every reference file directly`,
      );
    }
    const body = readFileSync(join(dir, ref), "utf8");
    const refLines = lineCount(body);
    if (refLines > TOC_THRESHOLD && !contentsMatches(body)) {
      error(
        `${ref} is ${refLines} lines and its "## Contents" list is missing or out of date; run with --fix`,
      );
    }
    if (refLines > TARGET_REFERENCE_LINES) {
      warn(
        `${ref} is ${refLines} lines; consider splitting it by topic (aim for under ${TARGET_REFERENCE_LINES})`,
      );
    }
  }

  return findings;
};

/**
 * Cross-skill pointers are written as `skill-name: Section Title`. Each one
 * must name a skill that exists and start with one of its section headings.
 */
const validateCrossReferences = (dirs: readonly string[]): Finding[] => {
  const findings: Finding[] = [];
  const headingsBySkill = new Map<string, string[]>();
  for (const dir of dirs) {
    const files = [
      "SKILL.md",
      ...referenceFiles(dir).map((f) => `references/${f}`),
    ];
    headingsBySkill.set(
      basename(dir),
      files.flatMap((f) =>
        headingsAt(readFileSync(join(dir, f), "utf8"), /^#{2,4} /)
      ),
    );
  }
  const names = [...headingsBySkill.keys()].join("|");
  const pointer = new RegExp(`\\b(${names}): ([A-Za-z\`][^\\n]*)`, "g");
  for (const dir of dirs) {
    const skill = basename(dir);
    const files = [
      "SKILL.md",
      ...referenceFiles(dir).map((f) => `references/${f}`),
    ];
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8").replace(
        /[ \t]*\n(?!\n)[ \t]*/g,
        " ",
      );
      for (const [, target, rest] of text.matchAll(pointer)) {
        const headings = headingsBySkill.get(target!) ?? [];
        if (!headings.some((h) => rest!.startsWith(h))) {
          findings.push({
            skill,
            level: "warning",
            message: `${file} points to "${target}: ${
              rest!.slice(0, 50)
            }", which matches no section heading in ${target}`,
          });
        }
      }
    }
  }
  return findings;
};

const fixContents = (dirs: readonly string[]): void => {
  for (const dir of dirs) {
    for (const file of referenceFiles(dir)) {
      const path = join(dir, "references", file);
      const text = readFileSync(path, "utf8");
      if (lineCount(text) <= TOC_THRESHOLD || contentsMatches(text)) continue;
      writeFileSync(path, withContents(text));
      console.log(`updated contents: ${basename(dir)}/references/${file}`);
    }
  }
};

/** Every skill must appear in both eser-rules-manager tables. */
const validateInventory = (skills: readonly string[]): Finding[] => {
  const findings: Finding[] = [];
  const manager = join(skillsRoot, "eser-rules-manager");
  const tables: Array<[string, string]> = [
    ["SKILL.md", "Available Skills table"],
    ["references/skill-discovery.md", "Skill Trigger Keywords table"],
  ];
  for (const [file, label] of tables) {
    const path = join(manager, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const skill of skills) {
      if (skill === "eser-rules-manager") continue;
      if (!text.includes(`| \`${skill}\``)) {
        findings.push({
          skill,
          level: "error",
          message: `missing from the ${label} in eser-rules-manager/${file}`,
        });
      }
    }
  }
  return findings;
};

const main = (): number => {
  const fix = process.argv.includes("--fix");
  const args = process.argv.slice(2).filter((a) => a !== "--fix");
  const dirs = args.length > 0
    ? args.map((a) => resolve(a))
    : readdirSync(skillsRoot)
      .map((d) => join(skillsRoot, d))
      .filter((d) => statSync(d).isDirectory());

  if (fix) fixContents(dirs);

  const findings = dirs.flatMap(validateSkill);
  if (args.length === 0) {
    findings.push(...validateInventory(dirs.map((d) => basename(d))));
    findings.push(...validateCrossReferences(dirs));
  }

  for (const f of findings) {
    console.log(`${f.level === "error" ? "✗" : "!"} ${f.skill}: ${f.message}`);
  }
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.length - errors;
  console.log(
    `${dirs.length} skill(s) checked in ${
      args.length > 0 ? dirname(dirs[0]!) : skillsRoot
    }: ${errors} error(s), ${warnings} warning(s)`,
  );
  return errors > 0 ? 1 : 0;
};

process.exit(main());
