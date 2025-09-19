// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parseArgs } from "@std/cli/parse-args";
import { cyan, magenta, red } from "@std/fmt/colors";
import { ensureFile } from "@std/fs/ensure-file";
import { join, resolve } from "@std/path";
import { parse as parseJsonc } from "@std/jsonc/parse";
import {
  format as formatSemver,
  increment,
  parse as parseSemVer,
  type SemVer,
} from "@std/semver";
import { $ } from "@david/dax";
import { Octokit } from "octokit";

/**
 * Upgrade the versions of the packages in the workspace using Conventional Commits rules.
 *
 * The workflow of this function is:
 * - Read workspace info from the deno.json in the given `root`.
 * - Read commit messages between the given `start` and `base`.
 *   - `start` defaults to the latest tag in the current branch (=`git describe --tags --abbrev=0`)
 *   - `base` defaults to the current branch (=`git branch --show-current`)
 * - Detect necessary version updates from the commit messages.
 * - Update the versions in the deno.json files.
 * - Create a release note.
 * - Create a git commit with given `gitUserName` and `gitUserEmail`.
 * - Create a pull request, targeting the given `base` branch.
 *
 * @module
 */

// UTILITIES

export type VersionUpdate = "major" | "minor" | "patch" | "prerelease";

export type Commit = {
  subject: string;
  body: string;
  hash: string;
};

export type CommitWithTag = Commit & { tag: string };

export const pathProp = Symbol.for("path");

export type WorkspaceModule = {
  name: string;
  version: string;
  [pathProp]: string;
};

export type VersionBump = {
  module: string;
  tag: string;
  commit: Commit;
  version: VersionUpdate;
};

export type VersionBumpSummary = {
  module: string;
  version: VersionUpdate;
  commits: CommitWithTag[];
};

export type Diagnostic =
  | UnknownCommit
  | UnknownRangeCommit
  | SkippedCommit
  | MissingRange;

export type UnknownCommit = {
  type: "unknown_commit";
  commit: Commit;
  reason: string;
};

export type MissingRange = {
  type: "missing_range";
  commit: Commit;
  reason: string;
};

export type UnknownRangeCommit = {
  type: "unknown_range_commit";
  commit: Commit;
  reason: string;
};

export type SkippedCommit = {
  type: "skipped_commit";
  commit: Commit;
  reason: string;
};

export type AppliedVersionBump = {
  oldVersion: string;
  newVersion: string;
  diff: VersionUpdate;
  denoJson: string;
};

export type VersionUpdateResult = {
  from: string;
  to: string;
  diff: VersionUpdate;
  path: string;
  summary: VersionBumpSummary;
};

const RE_DEFAULT_PATTERN = /^([^:()]+)(?:\((.+)\))?: (.*)$/;

// Defines the version bump for each tag.
const TAG_TO_VERSION: Record<string, "major" | "minor" | "patch"> = {
  BREAKING: "major",
  feat: "minor",
  deprecation: "patch",
  fix: "patch",
  perf: "patch",
  docs: "patch",
  style: "patch",
  refactor: "patch",
  test: "patch",
  chore: "patch",
};

const TAG_PRIORITY = Object.keys(TAG_TO_VERSION);

export const DEFAULT_RANGE_REQUIRED = [
  "BREAKING",
  "feat",
  "fix",
  "perf",
  "deprecation",
];

export function defaultParseCommitMessage(
  commit: Commit,
  workspaceModules: WorkspaceModule[],
): VersionBump[] | Diagnostic {
  const match = RE_DEFAULT_PATTERN.exec(commit.subject);
  if (match === null) {
    return {
      type: "unknown_commit",
      commit,
      reason: "The commit message does not match the default pattern.",
    };
  }

  const [, tag, module, _message] = match;

  if (tag === undefined) {
    return {
      type: "unknown_commit",
      commit,
      reason: "The commit message does not match the default pattern.",
    };
  }

  const modules = module === "*"
    ? workspaceModules.map((x) => x.name)
    : module
    ? module.split(/\s*,\s*/)
    : [];

  if (modules.length === 0) {
    if (DEFAULT_RANGE_REQUIRED.includes(tag)) {
      return {
        type: "missing_range",
        commit,
        reason: "The commit message does not specify a module.",
      };
    }

    return {
      type: "skipped_commit",
      commit,
      reason: "The commit message does not specify a module.",
    };
  }

  const version = TAG_TO_VERSION[tag];
  if (version === undefined) {
    return {
      type: "unknown_commit",
      commit,
      reason: `Unknown commit tag: ${tag}.`,
    };
  }

  return modules.map((module) => ({ module, tag, version, commit }));
}

export function summarizeVersionBumpsByModule(
  versionBumps: VersionBump[],
): VersionBumpSummary[] {
  const result = {} as Record<string, VersionBumpSummary>;

  for (const versionBump of versionBumps) {
    const { module, version } = versionBump;
    const summary = result[module] = result[module] ?? {
      module,
      version,
      commits: [],
    };

    summary.version = maxVersion(summary.version, version);
    summary.commits.push({ ...versionBump.commit, tag: versionBump.tag });
  }

  for (const summary of Object.values(result)) {
    summary.commits.sort((a, b) => {
      const priorityA = TAG_PRIORITY.indexOf(a.tag);
      const priorityB = TAG_PRIORITY.indexOf(b.tag);

      if (priorityA === priorityB) {
        return 0;
      }

      return priorityA < priorityB ? -1 : 1;
    });
  }

  return Object.values(result).sort((a, b) => a.module < b.module ? -1 : 1);
}

export function maxVersion(
  v0: VersionUpdate,
  v1: VersionUpdate,
): VersionUpdate {
  if (v0 === "major" || v1 === "major") {
    return "major";
  }

  if (v0 === "minor" || v1 === "minor") {
    return "minor";
  }

  return "patch";
}

export async function tryGetDenoConfig(
  path: string,
  // deno-lint-ignore no-explicit-any
): Promise<[path: string, config: any]> {
  let denoJson: string | undefined;
  let denoJsonPath: string | undefined;

  try {
    denoJsonPath = join(path, "deno.json");
    denoJson = await Deno.readTextFile(denoJsonPath);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }

  if (!denoJson) {
    try {
      denoJsonPath = join(path, "deno.jsonc");
      denoJson = await Deno.readTextFile(denoJsonPath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        console.log(`No deno.json or deno.jsonc found in ${resolve(path)}`);
        Deno.exit(1);
      }

      throw e;
    }
  }

  try {
    return [denoJsonPath!, parseJsonc(denoJson)];
  } catch (e) {
    console.log("Invalid deno.json or deno.jsonc file.");
    console.log(e);
    Deno.exit(1);
  }
}

export async function getWorkspaceModules(
  root: string,
): Promise<[string, WorkspaceModule[]]> {
  const [path, denoConfig] = await tryGetDenoConfig(root);
  const workspaces = denoConfig.workspaces || denoConfig.workspace;

  if (!Array.isArray(workspaces)) {
    console.log(red("Error") + " deno.json doesn't have workspace field.");
    Deno.exit(1);
  }

  const result = [];
  for (const workspace of workspaces) {
    if (typeof workspace !== "string") {
      console.log("deno.json workspace field should be an array of strings.");
      Deno.exit(1);
    }

    const [path, workspaceConfig] = await tryGetDenoConfig(
      join(root, workspace),
    );

    if (!workspaceConfig.name) {
      continue;
    }

    result.push({ ...workspaceConfig, [pathProp]: path });
  }

  return [path, result];
}

export function getModule(module: string, modules: WorkspaceModule[]) {
  return modules.find((m) =>
    m.name === module || m.name.endsWith(`/${module}`)
  );
}

export function checkModuleName(
  versionBump: Pick<VersionBump, "module" | "commit" | "tag">,
  modules: WorkspaceModule[],
): Diagnostic | undefined {
  if (getModule(versionBump.module, modules)) {
    return undefined;
  }

  // The commit include unknown module name
  return {
    type: "unknown_range_commit",
    commit: versionBump.commit,
    reason: `Unknown module: ${versionBump.module}.`,
  };
}

function hasPrerelease(version: SemVer) {
  return version.prerelease !== undefined && version.prerelease.length > 0;
}

export function calcVersionDiff(
  newVersionStr: string,
  oldVersionStr: string,
): VersionUpdate {
  const newVersion = parseSemVer(newVersionStr);
  const oldVersion = parseSemVer(oldVersionStr);

  if (hasPrerelease(newVersion)) {
    return "prerelease";
  }

  if (newVersion.major !== oldVersion.major) {
    return "major";
  }

  if (newVersion.minor !== oldVersion.minor) {
    return "minor";
  }

  if (newVersion.patch !== oldVersion.patch) {
    return "patch";
  }

  if (
    hasPrerelease(oldVersion) && !hasPrerelease(newVersion) &&
    newVersion.major === oldVersion.major &&
    newVersion.minor === oldVersion.minor &&
    newVersion.patch === oldVersion.patch
  ) {
    // The prerelease version is removed like
    // 1.0.0-rc.1 -> 1.0.0
    if (newVersion.patch !== 0) {
      return "patch";
    }

    if (newVersion.minor !== 0) {
      return "minor";
    }

    if (newVersion.major !== 0) {
      return "major";
    }
  }

  throw new Error(
    `Unexpected manual version update: ${oldVersion} -> ${newVersion}`,
  );
}

/** Apply the version bump to the file system. */
export async function applyVersionBump(
  summary: VersionBumpSummary,
  module: WorkspaceModule,
  oldModule: WorkspaceModule | undefined,
  denoJson: string,
  dryRun = false,
): Promise<[denoJson: string, VersionUpdateResult]> {
  if (!oldModule) {
    // The module is newly added
    console.info(`New module ${module.name} detected.`);

    const diff = calcVersionDiff(module.version, "0.0.0");
    summary.version = diff;

    return [denoJson, {
      from: "0.0.0",
      to: module.version,
      diff,
      summary,
      path: module[pathProp],
    }];
  }

  if (oldModule.version !== module.version) {
    // The version is manually updated
    console.info(
      `Manual version update detected for ${module.name}: ${oldModule.version} -> ${module.version}`,
    );

    const diff = calcVersionDiff(module.version, oldModule.version);
    summary.version = diff;

    return [denoJson, {
      from: oldModule.version,
      to: module.version,
      diff,
      summary,
      path: module[pathProp],
    }];
  }

  const currentVersionStr = module.version;
  const currentVersion = parseSemVer(currentVersionStr);
  let diff = summary.version;

  if (currentVersion.prerelease && currentVersion.prerelease.length > 0) {
    // If the current version is a prerelease version, the version bump type is always prerelease
    diff = "prerelease";
  } else if (currentVersion.major === 0) {
    // Change the version bump type for 0.x.y
    // This is aligned with the spec proposal discussed in https://github.com/semver/semver/pull/923
    if (diff === "major") {
      // breaking change is considered as minor in 0.x.y
      diff = "minor";
    } else if (diff === "minor") {
      // new feature is considered as patch in 0.x.y
      diff = "patch";
    }
  }

  summary.version = diff;

  const newVersion = increment(currentVersion, diff);
  const newVersionStr = formatSemver(newVersion);
  module.version = newVersionStr;

  const path = module[pathProp];
  if (!dryRun) {
    await Deno.writeTextFile(path, JSON.stringify(module, null, 2) + "\n");
  }

  denoJson = denoJson.replace(
    new RegExp(`${module.name}@([^~]?)${currentVersionStr}`, "g"),
    `${module.name}@$1${newVersionStr}`,
  );

  if (path.endsWith("deno.jsonc")) {
    console.warn(
      `Currently this tool doesn't keep the comments in deno.jsonc files. Comments in the path "${path}" might be removed by this update.`,
    );
  }

  return [denoJson, {
    from: currentVersionStr,
    to: newVersionStr,
    diff,
    summary,
    path,
  }];
}
export function createReleaseNote(
  updates: VersionUpdateResult[],
  modules: WorkspaceModule[],
  date: Date,
) {
  const heading = `### ${createReleaseTitle(date)}\n\n`;

  return heading + updates.map((u) => {
    const module = getModule(u.summary.module, modules)!;

    return `#### ${module.name} ${u.to} (${u.diff}) \n` +
      u.summary.commits.map((c) => `- ${c.subject}\n`).join("");
  }).join("\n");
}

export function createPrBody(
  updates: VersionUpdateResult[],
  diagnostics: Diagnostic[],
  githubRepo: string,
  releaseBranch: string,
) {
  const table = updates.map((u) =>
    "|" + [u.summary.module, u.from, u.to, u.diff].join("|") + "|"
  ).join("\n");

  const unknownCommitsNotes = createDiagnosticsNotes(
    "The following commits are not recognized. Please handle them manually if necessary:",
    "unknown_commit",
  );
  const unknownRangesNotes = createDiagnosticsNotes(
    "The following commits have unknown scopes. Please handle them manually if necessary:",
    "unknown_range_commit",
  );
  const missingRangesNotes = createDiagnosticsNotes(
    "Required scopes are missing in the following commits. Please handle them manually if necessary:",
    "missing_range",
  );
  const ignoredCommitsNotes = createDiagnosticsNotes(
    "The following commits are ignored:",
    "skipped_commit",
  );
  return `The following updates are detected:

| module   | from    | to      | type  |
|----------|---------|---------|-------|
${table}

Please ensure:
- [ ] Versions in deno.json files are updated correctly
- [ ] Releases.md is updated correctly

${unknownCommitsNotes}

${unknownRangesNotes}

${missingRangesNotes}

${ignoredCommitsNotes}

---

To make edits to this PR:

\`\`\`sh
git fetch upstream ${releaseBranch} && git checkout -b ${releaseBranch} upstream/${releaseBranch}
\`\`\`
`;
  function createDiagnosticsNotes(
    note: string,
    type: string,
  ) {
    const diagnostics_ = diagnostics.filter((d) => d.type === type);
    if (diagnostics_.length === 0) {
      return "";
    }
    return `${note}\n\n` +
      diagnostics_.map((d) =>
        `- [${d.commit.subject}](/${githubRepo}/commit/${d.commit.hash})`
      ).join("\n");
  }
}

export function createReleaseBranchName(date: Date) {
  return "release-" +
    date.toISOString().replace("T", "-").replaceAll(":", "-").replace(
      /\..+/,
      "",
    );
}

export function createReleaseTitle(d: Date) {
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const date = d.getUTCDate().toString().padStart(2, "0");
  return `${year}.${month}.${date}`;
}

// MAIN

// A random separator that is unlikely to be in a commit message.
const separator = "#%$".repeat(35);

/** The option for {@linkcode bumpWorkspaces} */
export type BumpWorkspaceOptions = {
  /** The git tag or commit hash to start from. The default is the latest tag. */
  start?: string;
  /** The base branch name to compare commits. The default is the current branch. */
  base?: string;
  parseCommitMessage?: (
    commit: Commit,
    workspaceModules: WorkspaceModule[],
  ) => VersionBump[] | Diagnostic;
  /** The root directory of the workspace. */
  root?: string;
  /** The git user name which is used for making a commit */
  gitUserName?: string;
  /** The git user email which is used for making a commit */
  gitUserEmail?: string;
  /** The github token e.g. */
  githubToken?: string;
  /** The github repository e.g. denoland/deno_std */
  githubRepo?: string;
  /** Perform all operations if false.
   * Doesn't perform file edits and network operations when true.
   * Perform fs ops, but doesn't perform git operations when "network" */
  dryRun?: boolean | "git";
  /** The path to release note markdown file. The dfault is `Releases.md` */
  releaseNotePath?: string;
};

/**
 * Upgrade the versions of the packages in the workspace using Conventional Commits rules.
 *
 * The workflow of this function is:
 * - Read workspace info from the deno.json in the given `root`.
 * - Read commit messages between the given `start` and `base`.
 *   - `start` defaults to the latest tag in the current branch (=`git describe --tags --abbrev=0`)
 *   - `base` defaults to the current branch (=`git branch --show-current`)
 * - Detect necessary version updates from the commit messages.
 * - Update the versions in the deno.json files.
 * - Create a release note.
 * - Create a git commit with given `gitUserName` and `gitUserEmail`.
 * - Create a pull request, targeting the given `base` branch.
 */
export async function bumpWorkspaces(
  {
    parseCommitMessage = defaultParseCommitMessage,
    start,
    base,
    gitUserName,
    gitUserEmail,
    githubToken,
    githubRepo,
    dryRun = false,
    releaseNotePath = "Releases.md",
    root = ".",
  }: BumpWorkspaceOptions = {},
) {
  const now = new Date();
  start ??= await $`git describe --tags --abbrev=0`.text();
  base ??= await $`git branch --show-current`.text();
  if (!base) {
    console.error("The current branch is not found.");
    Deno.exit(1);
  }

  await $`git checkout ${start}`;
  const [_oldConfigPath, oldModules] = await getWorkspaceModules(root);
  await $`git checkout -`;
  await $`git checkout ${base}`;
  const [configPath, modules] = await getWorkspaceModules(root);
  await $`git checkout -`;

  const newBranchName = createReleaseBranchName(now);
  releaseNotePath = join(root, releaseNotePath);

  const text =
    await $`git --no-pager log --pretty=format:${separator}%H%B ${start}..${base}`
      .text();

  const commits = text.split(separator).map((commit) => {
    const hash = commit.slice(0, 40);
    commit = commit.slice(40);
    const i = commit.indexOf("\n");
    if (i < 0) {
      return { hash, subject: commit.trim(), body: "" };
    }
    const subject = commit.slice(0, i).trim();
    const body = commit.slice(i + 1).trim();
    return { hash, subject, body };
  });
  commits.shift(); // drop the first empty item

  console.log(
    `Found ${cyan(commits.length.toString())} commits between ${
      magenta(start)
    } and ${magenta(base)}.`,
  );
  const versionBumps: VersionBump[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const commit of commits) {
    if (/^v?\d+\.\d+\.\d+/.test(commit.subject)) {
      // Skip if the commit subject is version bump
      continue;
    }
    if (/^Release \d+\.\d+\.\d+/.test(commit.subject)) {
      // Skip if the commit subject is release
      continue;
    }
    const parsed = parseCommitMessage(commit, modules);
    if (Array.isArray(parsed)) {
      for (const versionBump of parsed) {
        const diagnostic = checkModuleName(versionBump, modules);
        if (diagnostic) {
          diagnostics.push(diagnostic);
        } else {
          versionBumps.push(versionBump);
        }
      }
    } else {
      // The commit message is completely unknown
      diagnostics.push(parsed);
    }
  }
  const summaries = summarizeVersionBumpsByModule(versionBumps);

  if (summaries.length === 0) {
    console.log("No version bumps.");
    return;
  }

  console.log(`Updating the versions:`);
  const updates: Record<string, VersionUpdateResult> = {};
  let denoJson = await Deno.readTextFile(configPath);
  for (const summary of summaries) {
    const module = getModule(summary.module, modules)!;
    const oldModule = getModule(summary.module, oldModules);
    const [denoJson_, versionUpdate] = await applyVersionBump(
      summary,
      module,
      oldModule,
      denoJson,
      dryRun === true,
    );
    denoJson = denoJson_;
    updates[module.name] = versionUpdate;
  }
  console.table(updates, ["diff", "from", "to", "path"]);

  console.log(
    `Found ${cyan(diagnostics.length.toString())} diagnostics:`,
  );
  for (const unknownCommit of diagnostics) {
    console.log(`  ${unknownCommit.type} ${unknownCommit.commit.subject}`);
  }

  const releaseNote = createReleaseNote(Object.values(updates), modules, now);

  if (dryRun === true) {
    console.log();
    console.log(cyan("The release note:"));
    console.log(releaseNote);
    console.log(cyan("Skip making a commit."));
    console.log(cyan("Skip making a pull request."));
  } else {
    // Updates deno.json
    await Deno.writeTextFile(configPath, denoJson);

    // Prepend release notes
    await ensureFile(releaseNotePath);
    await Deno.writeTextFile(
      releaseNotePath,
      releaseNote + "\n" + await Deno.readTextFile(releaseNotePath),
    );

    await $`deno fmt ${releaseNotePath}`;

    if (dryRun === false) {
      gitUserName ??= Deno.env.get("GIT_USER_NAME");
      if (gitUserName === undefined) {
        console.error("GIT_USER_NAME is not set.");
        Deno.exit(1);
      }
      gitUserEmail ??= Deno.env.get("GIT_USER_EMAIL");
      if (gitUserEmail === undefined) {
        console.error("GIT_USER_EMAIL is not set.");
        Deno.exit(1);
      }
      githubToken ??= Deno.env.get("GITHUB_TOKEN");
      if (githubToken === undefined) {
        console.error("GITHUB_TOKEN is not set.");
        Deno.exit(1);
      }
      githubRepo ??= Deno.env.get("GITHUB_REPOSITORY");
      if (githubRepo === undefined) {
        console.error("GITHUB_REPOSITORY is not set.");
        Deno.exit(1);
      }

      // Makes a commit
      console.log(
        `Creating a git commit in the new branch ${magenta(newBranchName)}.`,
      );
      await $`git checkout -b ${newBranchName}`;
      await $`git add .`;
      await $`git -c "user.name=${gitUserName}" -c "user.email=${gitUserEmail}" commit -m "chore: update versions"`;

      console.log(`Pushing the new branch ${magenta(newBranchName)}.`);
      await $`git push origin ${newBranchName}`;

      // Makes a PR
      console.log(`Creating a pull request.`);
      const octoKit = new Octokit({ auth: githubToken });
      const [owner, repo] = githubRepo.split("/");
      const openedPr = await octoKit.request(
        "POST /repos/{owner}/{repo}/pulls",
        {
          owner,
          repo,
          base: base,
          head: newBranchName,
          draft: true,
          title: `chore: release ${createReleaseTitle(now)}`,
          body: createPrBody(
            Object.values(updates),
            diagnostics,
            githubRepo,
            newBranchName,
          ),
        },
      );

      console.log("New pull request:", cyan(openedPr.data.html_url));
    }

    console.log("Done.");
  }
}

// CLI

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run"],
  });
  await bumpWorkspaces({ dryRun: args["dry-run"] });
}
