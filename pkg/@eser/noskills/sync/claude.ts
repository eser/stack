// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code sync — generates/updates CLAUDE.md with noskills instructions.
 *
 * @module
 */

const NOS_SECTION_START = "<!-- noskills:start -->";
const NOS_SECTION_END = "<!-- noskills:end -->";

const buildSection = (rules: readonly string[]): string => {
  const lines = [
    NOS_SECTION_START,
    "## noskills orchestrator",
    "",
    "This project uses noskills. Do not read skill files, concern files,",
    "or rule files directly.",
    "",
    "At every step, run:",
    "",
    "    npx eser noskills next",
    "",
    "Follow the output. To submit a result or answer:",
    "",
    '    npx eser noskills next --answer="your response here"',
    "",
    "Do not make architectural decisions independently.",
    "noskills will tell you what to do next.",
  ];

  if (rules.length > 0) {
    lines.push("", "### Active Rules", "");
    for (const rule of rules) {
      lines.push(`- ${rule}`);
    }
  }

  lines.push(NOS_SECTION_END);

  return lines.join("\n");
};

export const sync = async (
  root: string,
  rules: readonly string[],
): Promise<void> => {
  const filePath = `${root}/CLAUDE.md`;
  const section = buildSection(rules);

  let content: string;

  try {
    content = await Deno.readTextFile(filePath);

    // Replace existing section or append
    const startIdx = content.indexOf(NOS_SECTION_START);
    const endIdx = content.indexOf(NOS_SECTION_END);

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + section +
        content.slice(endIdx + NOS_SECTION_END.length);
    } else {
      content = content.trimEnd() + "\n\n" + section + "\n";
    }
  } catch {
    content = section + "\n";
  }

  await Deno.writeTextFile(filePath, content);
};
