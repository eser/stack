// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * User identity — resolves current user from ~/.config/eser/noskills/user.json
 * (or $XDG_CONFIG_HOME/eser/noskills/user.json) or git config. Per-machine
 * identity, not per-project.
 *
 * @module
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import { runtime } from "@eserstack/standards/cross-runtime";

export interface NoskillsUser {
  readonly name: string;
  readonly email: string;
}

// =============================================================================
// Config directory
// =============================================================================

// user.json holds a name and an email: only its owner reads it.
const USER_DIR_MODE = 0o700;
const USER_FILE_MODE = 0o600;

/** Reads an environment variable, with an empty value counting as unset. */
const envValue = (key: string): string | null => {
  const value = runtime.env.get(key);
  return value === undefined || value === "" ? null : value;
};

/**
 * Get the noskills config directory: $XDG_CONFIG_HOME/eser/noskills, else
 * ~/.config/eser/noskills from HOME (or USERPROFILE).
 *
 * @throws {Error} when none of those variables is set; a literal "~" would
 * be a folder under the working directory.
 */
export const getConfigDir = (): string => {
  const xdg = envValue("XDG_CONFIG_HOME");
  if (xdg !== null) return `${xdg}/eser/noskills`;

  const home = envValue("HOME") ?? envValue("USERPROFILE");
  if (home === null) {
    throw new Error(
      "cannot find the noskills config directory: set HOME, USERPROFILE or XDG_CONFIG_HOME",
    );
  }

  return `${home}/.config/eser/noskills`;
};

/**
 * Get the path to the user identity file.
 *
 * @throws {Error} when getConfigDir finds no config directory.
 */
export const getUserFilePath = (): string => `${getConfigDir()}/user.json`;

// =============================================================================
// Read / Write
// =============================================================================

/**
 * Get the configured user from user.json, or null if it is not set, cannot
 * be read, or there is no config directory to read it from.
 */
export const getCurrentUser = async (
  _root?: string,
): Promise<NoskillsUser | null> => {
  try {
    const content = await runtime.fs.readTextFile(getUserFilePath());
    const data = JSON.parse(content) as { name?: string; email?: string };

    if (typeof data.name !== "string" || data.name.length === 0) return null;

    return { name: data.name, email: data.email ?? "" };
  } catch {
    return null;
  }
};

/**
 * Write user identity to user.json, readable by its owner only.
 *
 * @throws {Error} when there is no config directory or the write fails.
 */
export const setCurrentUser = async (
  user: NoskillsUser,
): Promise<void> => {
  const dir = getConfigDir();
  const filePath = getUserFilePath();
  await runtime.fs.mkdir(dir, { recursive: true, mode: USER_DIR_MODE });
  await runtime.fs.writeTextFile(
    filePath,
    JSON.stringify({ name: user.name, email: user.email }, null, 2) + "\n",
    { mode: USER_FILE_MODE },
  );
  // The mode applies when the file is created; a user.json that existed
  // keeps its own mode until it is narrowed here.
  if (crossRuntime.getPlatform() !== "windows") {
    await runtime.fs.chmod(filePath, USER_FILE_MODE);
  }
};

/**
 * Remove user identity file. Returns false when there was none.
 *
 * @throws {Error} when there is no config directory, or the file exists and
 * cannot be removed.
 */
export const clearCurrentUser = async (): Promise<boolean> => {
  const filePath = getUserFilePath();
  try {
    await runtime.fs.remove(filePath);
    return true;
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) return false;
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`remove the user identity ${filePath}: ${reason}`, {
      cause: error,
    });
  }
};

/** Detect user from git config. Returns null if git is not available. */
export const detectGitUser = async (): Promise<NoskillsUser | null> => {
  try {
    const name = (await runtime.exec.exec("git", ["config", "user.name"]))
      .trim();
    const email = (await runtime.exec.exec("git", ["config", "user.email"]))
      .trim();

    if (name.length === 0) return null;
    return { name, email };
  } catch {
    return null;
  }
};

// =============================================================================
// Formatting
// =============================================================================

/** Format as "Name <email>" or just "Name" if no email. */
export const formatUser = (user: NoskillsUser): string => {
  if (user.email.length > 0) return `${user.name} <${user.email}>`;
  return user.name;
};

/** Just the name. */
export const shortUser = (user: NoskillsUser): string => user.name;

/** Fallback user when no identity is configured. */
export const unknownUser = (): NoskillsUser => ({
  name: "Unknown User",
  email: "",
});

// =============================================================================
// Resolution chain
// =============================================================================

/**
 * Resolve user: config file → git config → Unknown User.
 * Never returns null.
 */
export const resolveUser = async (
  _root?: string,
): Promise<NoskillsUser> => {
  // 1. Config file
  const configured = await getCurrentUser();
  if (configured !== null) return configured;

  // 2. Git config
  const gitUser = await detectGitUser();
  if (gitUser !== null) return gitUser;

  // 3. Fallback
  return unknownUser();
};
