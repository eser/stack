// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * User identity — resolves current user from ~/.config/noskills/user.json
 * or git config. Per-machine identity, not per-project.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";

export interface NoskillsUser {
  readonly name: string;
  readonly email: string;
}

// =============================================================================
// Config directory
// =============================================================================

/** Get the noskills config directory (~/.config/noskills or XDG_CONFIG_HOME/noskills). */
export const getConfigDir = (): string => {
  const xdg = runtime.env.get("XDG_CONFIG_HOME");
  if (xdg !== undefined && xdg.length > 0) return `${xdg}/eser/noskills`;
  const home = runtime.env.get("HOME") ??
    runtime.env.get("USERPROFILE") ?? "~";
  return `${home}/.config/eser/noskills`;
};

/** Get the path to the user identity file. */
export const getUserFilePath = (): string => `${getConfigDir()}/user.json`;

// =============================================================================
// Read / Write
// =============================================================================

/** Get the configured user from ~/.config/noskills/user.json, or null if not set. */
export const getCurrentUser = async (
  _root?: string,
): Promise<NoskillsUser | null> => {
  const filePath = getUserFilePath();

  try {
    const content = await runtime.fs.readTextFile(filePath);
    const data = JSON.parse(content) as { name?: string; email?: string };

    if (typeof data.name !== "string" || data.name.length === 0) return null;

    return { name: data.name, email: data.email ?? "" };
  } catch {
    return null;
  }
};

/** Write user identity to ~/.config/noskills/user.json. */
export const setCurrentUser = async (
  user: NoskillsUser,
): Promise<void> => {
  const dir = getConfigDir();
  await runtime.fs.mkdir(dir, { recursive: true });
  await runtime.fs.writeTextFile(
    getUserFilePath(),
    JSON.stringify({ name: user.name, email: user.email }, null, 2) + "\n",
  );
};

/** Remove user identity file. */
export const clearCurrentUser = async (): Promise<boolean> => {
  try {
    await runtime.fs.remove(getUserFilePath());
    return true;
  } catch {
    return false;
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
