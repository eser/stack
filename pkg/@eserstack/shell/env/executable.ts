// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Finding an executable on PATH, without spawning anything.
 *
 * @module
 */

import { getPlatform, runtime } from "@eserstack/standards/cross-runtime";

/**
 * Reports whether path is a file this process could execute.
 *
 * The mode check matters: a non-executable file with the right name would
 * otherwise be "found" and then fail at spawn with a confusing error, which is
 * the failure mode PATH lookup exists to prevent.
 */
const isExecutableFile = async (path: string): Promise<boolean> => {
  try {
    // runtime.fs.stat rather than a Deno global: this ships inside the npm CLI
    // too, where `Deno` is undefined and the ReferenceError would be swallowed
    // by this very catch, making every lookup silently return false.
    const info = await runtime.fs.stat(path);

    if (!info.isFile) {
      return false;
    }

    // Windows has no execute bit; existence plus a PATHEXT match is the test.
    if (getPlatform() === "windows") {
      return true;
    }

    // null means the platform did not report mode. Treating that as "not
    // executable" would fail closed on any runtime whose stat omits it, so only
    // an explicitly clear execute bit rejects.
    return info.mode === null || (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

/**
 * Resolves an executable name to its full path, or null when it is not on PATH.
 *
 * PATH is walked here rather than shelling out to `which`. Three reasons, all
 * practical:
 *
 *   - it costs a subprocess per lookup, on paths that are often the startup path
 *   - `which` is not available on Windows, where the equivalent is `where`
 *   - the shared exec path runs through the Go native library, which caches the
 *     environment it was started with, so a PATH exported after load is not
 *     observed — making `which` both slower AND less accurate than reading the
 *     variable directly
 *
 * Names containing a path separator are rejected: they are not executable names,
 * and resolving them against every PATH entry is not meaningful.
 */
export const resolveExecutable = async (
  name: string,
): Promise<string | null> => {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return null;
  }

  const isWindows = getPlatform() === "windows";
  const pathValue = runtime.env.get("PATH") ?? runtime.env.get("Path") ?? "";

  if (pathValue === "") {
    return null;
  }

  // PATHEXT is what makes a lookup for `foo` find `foo.cmd` on Windows; an
  // empty suffix covers every POSIX case and a Windows binary named without
  // one.
  const extensions = isWindows
    ? ["", ...(runtime.env.get("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";")]
    : [""];

  const separator = isWindows ? "\\" : "/";

  for (const dir of pathValue.split(isWindows ? ";" : ":")) {
    if (dir === "") {
      continue;
    }

    for (const extension of extensions) {
      const candidate = `${dir}${separator}${name}${
        isWindows ? extension : extension.toLowerCase()
      }`;

      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
};

/** Whether an executable is available on PATH. */
export const hasExecutable = async (name: string): Promise<boolean> =>
  (await resolveExecutable(name)) !== null;
