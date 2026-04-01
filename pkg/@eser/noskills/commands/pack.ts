// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills pack` — Manage installable rule/concern bundles.
 *
 * Subcommands: list, install, uninstall, inspect, search
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as packSchema from "../pack/schema.ts";
import * as syncEngine from "../sync/engine.ts";
import { BUILTIN_PACKS } from "../defaults/packs/mod.ts";
import { cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Constants
// =============================================================================

const PACKS_FILE = ".eser/packs.json";
const FETCH_TIMEOUT_MS = 30_000;

// =============================================================================
// Main
// =============================================================================

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "list") {
    return await packList();
  }

  if (subcommand === "install") {
    return await packInstall(args?.slice(1));
  }

  if (subcommand === "uninstall") {
    return await packUninstall(args?.slice(1));
  }

  if (subcommand === "inspect") {
    return await packInspect(args?.slice(1));
  }

  if (subcommand === "search") {
    return await packSearch(args?.slice(1));
  }

  const prefix = cmdPrefix();
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(
    `Usage: ${prefix} pack <list | install <name> | uninstall <name> | inspect <name> | search <query>>`,
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// Packs Persistence (.eser/packs.json)
// =============================================================================

export const readPacksFile = async (
  root: string,
): Promise<packSchema.InstalledPacksFile> => {
  const filePath = `${root}/${PACKS_FILE}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);

    return JSON.parse(content) as packSchema.InstalledPacksFile;
  } catch {
    return packSchema.createEmptyPacksFile();
  }
};

export const writePacksFile = async (
  root: string,
  packs: packSchema.InstalledPacksFile,
): Promise<void> => {
  const filePath = `${root}/${PACKS_FILE}`;

  await runtime.fs.mkdir(`${root}/.eser`, { recursive: true });
  await runtime.fs.writeTextFile(
    filePath,
    JSON.stringify(packs, null, 2) + "\n",
  );
};

// =============================================================================
// Built-in Pack Resolution
// =============================================================================

const resolveBuiltinPack = (
  name: string,
): packSchema.BuiltinPack | undefined => {
  return BUILTIN_PACKS.get(name);
};

// =============================================================================
// Remote Pack Resolution
// =============================================================================

/**
 * Parse a remote pack specifier.
 *
 * Formats:
 *   "github:eser/rules#typescript" → { owner: "eser", repo: "rules", ref: "main", path: "typescript" }
 *   "eser/rules#typescript"        → same
 *   "gh:eser/rules#typescript"     → same
 */
const parsePackSpecifier = (
  specifier: string,
): {
  owner: string;
  repo: string;
  ref: string;
  packPath: string;
} | null => {
  const cleaned = specifier
    .replace(/^github:/, "")
    .replace(/^gh:/, "");

  const hashIdx = cleaned.indexOf("#");
  if (hashIdx === -1) return null;

  const repoPath = cleaned.slice(0, hashIdx);
  const packPath = cleaned.slice(hashIdx + 1);

  const slashIdx = repoPath.indexOf("/");
  if (slashIdx === -1) return null;

  const owner = repoPath.slice(0, slashIdx);
  const repo = repoPath.slice(slashIdx + 1);

  if (owner.length === 0 || repo.length === 0 || packPath.length === 0) {
    return null;
  }

  return { owner, repo, ref: "main", packPath };
};

const fetchRemotePackManifest = async (
  specifier: string,
): Promise<packSchema.PackManifest> => {
  const parsed = parsePackSpecifier(specifier);

  if (parsed === null) {
    throw new Error(
      `Invalid pack specifier: ${specifier}. Expected format: github:owner/repo#pack-name`,
    );
  }

  const url =
    `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.ref}/packs/${parsed.packPath}/pack.json`;

  const response = await globalThis.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Could not fetch pack from ${specifier}. HTTP ${response.status}`,
    );
  }

  const data = JSON.parse(await response.text()) as unknown;

  return packSchema.validatePackManifest(data);
};

const fetchRemoteFile = async (
  specifier: string,
  filePath: string,
): Promise<string> => {
  const parsed = parsePackSpecifier(specifier);

  if (parsed === null) {
    throw new Error(`Invalid pack specifier: ${specifier}`);
  }

  const url =
    `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.ref}/packs/${parsed.packPath}/${filePath}`;

  const response = await globalThis.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Could not fetch ${filePath} from ${specifier}. HTTP ${response.status}`,
    );
  }

  return await response.text();
};

// =============================================================================
// Concern Prefix Numbering
// =============================================================================

const nextConcernPrefix = async (root: string): Promise<number> => {
  const concernsDir = `${root}/${persistence.paths.concernsDir}`;
  let maxPrefix = 0;

  try {
    for await (const entry of runtime.fs.readDir(concernsDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const match = entry.name.match(/^(\d+)-/);
        if (match !== null) {
          const num = parseInt(match[1]!, 10);
          if (num > maxPrefix) maxPrefix = num;
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return maxPrefix + 1;
};

// =============================================================================
// Install Logic
// =============================================================================

export const installBuiltinPack = async (
  root: string,
  name: string,
  builtin: packSchema.BuiltinPack,
): Promise<packSchema.InstalledPack> => {
  const installedRules: string[] = [];
  const installedConcerns: string[] = [];
  const installedFolderRules: string[] = [];

  // 1. Copy rules to .eser/rules/ with pack-{name}- prefix
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  await runtime.fs.mkdir(rulesDir, { recursive: true });

  for (const [ruleName, ruleContent] of Object.entries(builtin.ruleContents)) {
    const fileName = `pack-${name}-${ruleName}.md`;
    await runtime.fs.writeTextFile(
      `${rulesDir}/${fileName}`,
      ruleContent + "\n",
    );
    installedRules.push(fileName);
  }

  // 2. Copy concerns to .eser/concerns/ with numeric prefix
  if (builtin.concernContents.length > 0) {
    const concernsDir = `${root}/${persistence.paths.concernsDir}`;
    await runtime.fs.mkdir(concernsDir, { recursive: true });

    let prefix = await nextConcernPrefix(root);

    for (const concern of builtin.concernContents) {
      const paddedPrefix = String(prefix).padStart(3, "0");
      const fileName = `${paddedPrefix}-${concern.id}.json`;
      await runtime.fs.writeTextFile(
        `${concernsDir}/${fileName}`,
        JSON.stringify(concern, null, 2) + "\n",
      );
      installedConcerns.push(fileName);
      prefix++;
    }
  }

  // 3. Copy folder-rules to target directories
  if (builtin.folderRuleContents !== undefined) {
    for (
      const [targetDir, ruleContent] of Object.entries(
        builtin.folderRuleContents,
      )
    ) {
      const targetPath = `${root}/${targetDir}/.folder-rules.md`;
      await runtime.fs.mkdir(`${root}/${targetDir}`, { recursive: true });
      await runtime.fs.writeTextFile(targetPath, ruleContent + "\n");
      installedFolderRules.push(`${targetDir}/.folder-rules.md`);
    }
  }

  const installed: packSchema.InstalledPack = {
    name,
    version: builtin.manifest.version,
    installedAt: new Date().toISOString(),
    source: "builtin",
    rules: installedRules,
    concerns: installedConcerns,
    folderRules: installedFolderRules,
  };

  return installed;
};

export const installRemotePack = async (
  root: string,
  specifier: string,
  manifest: packSchema.PackManifest,
): Promise<packSchema.InstalledPack> => {
  const name = manifest.name;
  const installedRules: string[] = [];
  const installedConcerns: string[] = [];
  const installedFolderRules: string[] = [];

  // 1. Fetch and install rules
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  await runtime.fs.mkdir(rulesDir, { recursive: true });

  if (manifest.rules !== undefined) {
    for (const rulePath of manifest.rules) {
      const content = await fetchRemoteFile(specifier, rulePath);
      const ruleName = rulePath
        .replace(/^rules\//, "")
        .replace(/\.md$/, "");
      const fileName = `pack-${name}-${ruleName}.md`;
      await runtime.fs.writeTextFile(`${rulesDir}/${fileName}`, content);
      installedRules.push(fileName);
    }
  }

  // 2. Fetch and install concerns
  if (manifest.concerns !== undefined && manifest.concerns.length > 0) {
    const concernsDir = `${root}/${persistence.paths.concernsDir}`;
    await runtime.fs.mkdir(concernsDir, { recursive: true });

    let prefix = await nextConcernPrefix(root);

    for (const concernPath of manifest.concerns) {
      const content = await fetchRemoteFile(specifier, concernPath);
      const concern = JSON.parse(content) as { id: string };
      const paddedPrefix = String(prefix).padStart(3, "0");
      const fileName = `${paddedPrefix}-${concern.id}.json`;
      await runtime.fs.writeTextFile(
        `${concernsDir}/${fileName}`,
        content,
      );
      installedConcerns.push(fileName);
      prefix++;
    }
  }

  // 3. Install folder-rules
  if (manifest.folderRules !== undefined) {
    for (
      const [targetDir, sourcePath] of Object.entries(manifest.folderRules)
    ) {
      const content = await fetchRemoteFile(specifier, sourcePath);
      const targetPath = `${root}/${targetDir}/.folder-rules.md`;
      await runtime.fs.mkdir(`${root}/${targetDir}`, { recursive: true });
      await runtime.fs.writeTextFile(targetPath, content);
      installedFolderRules.push(`${targetDir}/.folder-rules.md`);
    }
  }

  const installed: packSchema.InstalledPack = {
    name,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    source: specifier,
    rules: installedRules,
    concerns: installedConcerns,
    folderRules: installedFolderRules,
  };

  return installed;
};

// =============================================================================
// pack list
// =============================================================================

const packList = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const packsFile = await readPacksFile(root);
  const installedNames = new Set(packsFile.installed.map((p) => p.name));

  // Built-in packs
  out.writeln(span.bold("Built-in packs:"));

  for (const [name, builtin] of BUILTIN_PACKS) {
    const ruleCount = Object.keys(builtin.ruleContents).length;
    const concernCount = builtin.concernContents.length;
    const parts = [];
    if (ruleCount > 0) parts.push(`${ruleCount} rules`);
    if (concernCount > 0) {
      parts.push(`${concernCount} concern${concernCount > 1 ? "s" : ""}`);
    }

    out.writeln(
      "  ",
      span.bold(name.padEnd(16)),
      span.dim(builtin.manifest.description),
      span.dim(` (${parts.join(", ")})`),
    );
  }

  // Installed packs
  out.writeln("");
  out.writeln(span.bold("Installed packs:"));

  if (packsFile.installed.length === 0) {
    out.writeln(span.dim("  No packs installed."));
  } else {
    for (const installed of packsFile.installed) {
      const date = installed.installedAt.slice(0, 10);
      out.writeln(
        "  ",
        installedNames.has(installed.name)
          ? span.green(installed.name.padEnd(16))
          : span.bold(installed.name.padEnd(16)),
        span.dim(`v${installed.version}`),
        span.dim(`  (installed ${date})`),
      );
    }
  }

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// pack install
// =============================================================================

const packInstall = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const nameOrSpecifier = args?.[0];

  if (nameOrSpecifier === undefined || nameOrSpecifier.length === 0) {
    const prefix = cmdPrefix();
    out.writeln(
      span.red("Please provide a pack name: "),
      span.bold(`${prefix} pack install typescript`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const packsFile = await readPacksFile(root);
  const isRemote = nameOrSpecifier.includes("/") ||
    nameOrSpecifier.includes(":");

  // Determine pack name
  const packName = isRemote
    ? (parsePackSpecifier(nameOrSpecifier)?.packPath ?? nameOrSpecifier)
    : nameOrSpecifier;

  // Check if already installed
  if (packsFile.installed.some((p) => p.name === packName)) {
    out.writeln(
      span.red(`Pack "${packName}" is already installed.`),
    );
    out.writeln(
      span.dim("  Uninstall first to re-install."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  let installed: packSchema.InstalledPack;

  if (isRemote) {
    // Remote install
    out.writeln(span.dim(`Fetching pack from ${nameOrSpecifier}...`));

    try {
      const manifest = await fetchRemotePackManifest(nameOrSpecifier);

      // Install requires first
      if (manifest.requires !== undefined) {
        for (const dep of manifest.requires) {
          if (!packsFile.installed.some((p) => p.name === dep)) {
            out.writeln(
              span.dim(`  Installing dependency: ${dep}`),
            );
            const depBuiltin = resolveBuiltinPack(dep);
            if (depBuiltin !== undefined) {
              const depInstalled = await installBuiltinPack(
                root,
                dep,
                depBuiltin,
              );
              (packsFile.installed as packSchema.InstalledPack[]).push(
                depInstalled,
              );
            }
          }
        }
      }

      installed = await installRemotePack(root, nameOrSpecifier, manifest);
    } catch (err) {
      out.writeln(
        span.red(
          `Failed to install: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
      await out.close();

      return results.fail({ exitCode: 1 });
    }
  } else {
    // Built-in install
    const builtin = resolveBuiltinPack(nameOrSpecifier);

    if (builtin === undefined) {
      out.writeln(
        span.red(`Unknown pack: ${nameOrSpecifier}`),
      );
      out.writeln(
        span.dim(
          `  Available built-in packs: ${[...BUILTIN_PACKS.keys()].join(", ")}`,
        ),
      );
      await out.close();

      return results.fail({ exitCode: 1 });
    }

    // Install requires first
    if (builtin.manifest.requires !== undefined) {
      for (const dep of builtin.manifest.requires) {
        if (!packsFile.installed.some((p) => p.name === dep)) {
          out.writeln(span.dim(`  Installing dependency: ${dep}`));
          const depBuiltin = resolveBuiltinPack(dep);
          if (depBuiltin !== undefined) {
            const depInstalled = await installBuiltinPack(
              root,
              dep,
              depBuiltin,
            );
            const mutableInstalled = [
              ...packsFile.installed,
              depInstalled,
            ];
            await writePacksFile(root, { installed: mutableInstalled });
          }
        }
      }
    }

    installed = await installBuiltinPack(root, nameOrSpecifier, builtin);
  }

  // Update packs.json
  const newPacksFile: packSchema.InstalledPacksFile = {
    installed: [...packsFile.installed, installed],
  };
  await writePacksFile(root, newPacksFile);

  // Auto-sync tool files
  const config = await persistence.readManifest(root);
  if (config !== null && config.tools.length > 0) {
    await syncEngine.syncAll(root, config.tools, config);
    out.writeln(span.dim("  Tool files synced."));
  }

  out.writeln(
    span.green("✔"),
    ` Pack "${installed.name}" v${installed.version} installed.`,
  );

  if (installed.rules.length > 0) {
    out.writeln(
      span.dim(`  Rules: ${installed.rules.join(", ")}`),
    );
  }
  if (installed.concerns.length > 0) {
    out.writeln(
      span.dim(`  Concerns: ${installed.concerns.join(", ")}`),
    );
  }

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// pack uninstall
// =============================================================================

const packUninstall = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const packName = args?.[0];

  if (packName === undefined || packName.length === 0) {
    const prefix = cmdPrefix();
    out.writeln(
      span.red("Please provide a pack name: "),
      span.bold(`${prefix} pack uninstall typescript`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const packsFile = await readPacksFile(root);
  const installed = packsFile.installed.find((p) => p.name === packName);

  if (installed === undefined) {
    out.writeln(span.red(`Pack "${packName}" is not installed.`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Check for dependents
  const dependents: string[] = [];
  for (const other of packsFile.installed) {
    if (other.name === packName) continue;
    const builtin = resolveBuiltinPack(other.name);
    if (
      builtin?.manifest.requires !== undefined &&
      builtin.manifest.requires.includes(packName)
    ) {
      dependents.push(other.name);
    }
  }

  if (dependents.length > 0) {
    out.writeln(
      span.red(
        `Warning: pack "${packName}" is required by: ${dependents.join(", ")}`,
      ),
    );
  }

  // Remove rule files
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  for (const ruleFile of installed.rules) {
    try {
      await runtime.fs.remove(`${rulesDir}/${ruleFile}`);
    } catch {
      // File may already be gone
    }
  }

  // Remove concern files
  const concernsDir = `${root}/${persistence.paths.concernsDir}`;
  for (const concernFile of installed.concerns) {
    try {
      await runtime.fs.remove(`${concernsDir}/${concernFile}`);
    } catch {
      // File may already be gone
    }
  }

  // Remove folder-rule files
  for (const folderRulePath of installed.folderRules) {
    try {
      await runtime.fs.remove(`${root}/${folderRulePath}`);
    } catch {
      // File may already be gone
    }
  }

  // Update packs.json
  const newPacksFile: packSchema.InstalledPacksFile = {
    installed: packsFile.installed.filter((p) => p.name !== packName),
  };
  await writePacksFile(root, newPacksFile);

  // Auto-sync tool files
  const config = await persistence.readManifest(root);
  if (config !== null && config.tools.length > 0) {
    await syncEngine.syncAll(root, config.tools, config);
    out.writeln(span.dim("  Tool files synced."));
  }

  out.writeln(
    span.green("✔"),
    ` Pack "${packName}" uninstalled.`,
  );

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// pack inspect
// =============================================================================

const packInspect = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const nameOrSpecifier = args?.[0];

  if (nameOrSpecifier === undefined || nameOrSpecifier.length === 0) {
    const prefix = cmdPrefix();
    out.writeln(
      span.red("Please provide a pack name: "),
      span.bold(`${prefix} pack inspect typescript`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const isRemote = nameOrSpecifier.includes("/") ||
    nameOrSpecifier.includes(":");

  let manifest: packSchema.PackManifest;
  let ruleContents: Readonly<Record<string, string>> | null = null;
  let concernDefs:
    | readonly {
      id: string;
      name: string;
      description: string;
      acceptanceCriteria: readonly string[];
    }[]
    | null = null;

  if (isRemote) {
    try {
      manifest = await fetchRemotePackManifest(nameOrSpecifier);
    } catch (err) {
      out.writeln(
        span.red(
          `Failed to fetch: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
      await out.close();

      return results.fail({ exitCode: 1 });
    }
  } else {
    const builtin = resolveBuiltinPack(nameOrSpecifier);

    if (builtin === undefined) {
      out.writeln(
        span.red(`Unknown pack: ${nameOrSpecifier}`),
      );
      await out.close();

      return results.fail({ exitCode: 1 });
    }

    manifest = builtin.manifest;
    ruleContents = builtin.ruleContents;
    concernDefs = builtin.concernContents;
  }

  // Display pack info
  out.writeln(
    span.bold(`Pack: ${manifest.name}`),
    span.dim(` v${manifest.version}`),
  );
  out.writeln(`Description: ${manifest.description}`);

  if (manifest.author !== undefined) {
    out.writeln(`Author: ${manifest.author}`);
  }

  if (manifest.tags !== undefined && manifest.tags.length > 0) {
    out.writeln(`Tags: ${manifest.tags.join(", ")}`);
  }

  // Rules
  out.writeln("");
  const ruleCount = manifest.rules?.length ?? 0;
  out.writeln(span.bold(`Rules (${ruleCount}):`));

  if (ruleContents !== null) {
    for (const [ruleName, content] of Object.entries(ruleContents)) {
      out.writeln(`  - ${ruleName}: `, span.dim(`"${content}"`));
    }
  } else if (manifest.rules !== undefined) {
    for (const rulePath of manifest.rules) {
      const name = rulePath.replace(/^rules\//, "").replace(/\.md$/, "");
      out.writeln(`  - ${name}`);
    }
  }

  // Concerns
  const concernCount = manifest.concerns?.length ?? 0;
  out.writeln("");
  out.writeln(span.bold(`Concerns (${concernCount}):`));

  if (concernDefs !== null && concernDefs.length > 0) {
    for (const concern of concernDefs) {
      out.writeln(`  - ${concern.id}: ${concern.name}`);
      if (concern.acceptanceCriteria.length > 0) {
        out.writeln(
          span.dim(
            `    ACs: "${concern.acceptanceCriteria.join('", "')}"`,
          ),
        );
      }
    }
  } else if (concernCount === 0) {
    out.writeln(span.dim("  none"));
  }

  // Folder rules
  const folderRuleCount = manifest.folderRules !== undefined
    ? Object.keys(manifest.folderRules).length
    : 0;
  out.writeln("");
  out.writeln(
    `Folder rules: ${folderRuleCount > 0 ? folderRuleCount : "none"}`,
  );

  // Dependencies
  const depCount = manifest.requires?.length ?? 0;
  out.writeln(
    `Dependencies: ${depCount > 0 ? manifest.requires!.join(", ") : "none"}`,
  );

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// pack search
// =============================================================================

const packSearch = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const query = args?.[0]?.toLowerCase();

  if (query === undefined || query.length === 0) {
    const prefix = cmdPrefix();
    out.writeln(
      span.red("Please provide a search query: "),
      span.bold(`${prefix} pack search typescript`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Search built-in packs first
  out.writeln(span.bold("Matching packs:"));
  let found = false;

  for (const [name, builtin] of BUILTIN_PACKS) {
    const tags = builtin.manifest.tags ?? [];
    const matchesName = name.includes(query);
    const matchesTag = tags.some((t) => t.includes(query));
    const matchesDesc = builtin.manifest.description.toLowerCase().includes(
      query,
    );

    if (matchesName || matchesTag || matchesDesc) {
      out.writeln(
        "  ",
        span.bold(name.padEnd(16)),
        span.dim(builtin.manifest.description),
        span.dim("  [builtin]"),
      );
      found = true;
    }
  }

  // Try remote registry
  const root = runtime.process.cwd();
  const config = await persistence.readManifest(root);
  const registryUrl = (config as Record<string, unknown> | null)
    ?.["packRegistry"] as
      | string
      | undefined;

  if (registryUrl !== undefined) {
    try {
      const response = await globalThis.fetch(registryUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.ok) {
        const registry = JSON.parse(
          await response.text(),
        ) as packSchema.PackRegistry;

        for (const entry of registry.packs) {
          const tags = entry.tags ?? [];
          const matchesName = entry.name.includes(query);
          const matchesTag = tags.some((t) => t.includes(query));
          const matchesDesc = entry.description.toLowerCase().includes(query);

          if (matchesName || matchesTag || matchesDesc) {
            out.writeln(
              "  ",
              span.bold(entry.name.padEnd(16)),
              span.dim(entry.description),
              span.dim(`  [${entry.source}]`),
            );
            found = true;
          }
        }
      }
    } catch {
      // Registry unavailable, silently skip
    }
  }

  if (!found) {
    out.writeln(span.dim(`  No packs matching "${query}" found.`));
  }

  await out.close();

  return results.ok(undefined);
};
