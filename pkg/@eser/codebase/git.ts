// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Git utility functions for working with git repositories.
 * Uses @eser/standards/runtime for cross-runtime command execution.
 *
 * @module
 */

import { runtime } from "@eser/standards/runtime";

/**
 * Represents a git commit with its metadata.
 */
export type Commit = {
  /** The commit subject (first line of commit message) */
  subject: string;
  /** The commit body (rest of the commit message) */
  body: string;
  /** The full commit hash (40 characters) */
  hash: string;
};

/**
 * Represents a git user for commit authorship.
 */
export type CommitUser = {
  /** The user's name */
  name: string;
  /** The user's email address */
  email: string;
};

// A random separator that is unlikely to be in a commit message.
const COMMIT_SEPARATOR = "#%$".repeat(35);

/**
 * Parses commit log output into Commit objects.
 * Shared by getCommitsBetween and getCommitsSinceDate.
 */
const parseCommitLog = (text: string): Commit[] => {
  const commits = text.split(COMMIT_SEPARATOR).map((commit) => {
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

  return commits;
};

/**
 * Gets the latest tag in the current branch.
 *
 * @returns The latest tag name
 * @throws If no tags are found or git command fails
 *
 * @example
 * ```typescript
 * const tag = await getLatestTag();
 * console.log(tag); // "v1.0.0"
 * ```
 */
export const getLatestTag = async (): Promise<string> => {
  return await runtime.exec.exec("git", ["describe", "--tags", "--abbrev=0"]);
};

/**
 * Gets the name of the current git branch.
 *
 * @returns The current branch name
 * @throws If not in a git repository or in detached HEAD state
 *
 * @example
 * ```typescript
 * const branch = await getCurrentBranch();
 * console.log(branch); // "main"
 * ```
 */
export const getCurrentBranch = async (): Promise<string> => {
  return await runtime.exec.exec("git", ["branch", "--show-current"]);
};

/**
 * Checks out a specific git reference (branch, tag, or commit).
 *
 * @param ref - The reference to checkout (branch name, tag, or commit hash)
 *
 * @example
 * ```typescript
 * await checkout("main");
 * await checkout("v1.0.0");
 * await checkout("abc123");
 * ```
 */
export const checkout = async (ref: string): Promise<void> => {
  await runtime.exec.spawn("git", ["checkout", ref]);
};

/**
 * Checks out the previous git reference (equivalent to `git checkout -`).
 *
 * @example
 * ```typescript
 * await checkout("feature-branch");
 * // do some work
 * await checkoutPrevious(); // goes back to previous branch
 * ```
 */
export const checkoutPrevious = async (): Promise<void> => {
  await runtime.exec.spawn("git", ["checkout", "-"]);
};

/**
 * Creates a new branch and checks it out.
 *
 * @param name - The name of the new branch
 *
 * @example
 * ```typescript
 * await createAndCheckoutBranch("feature/new-feature");
 * ```
 */
export const createAndCheckoutBranch = async (name: string): Promise<void> => {
  await runtime.exec.spawn("git", ["checkout", "-b", name]);
};

/**
 * Gets all commits between two git references.
 *
 * @param start - The starting reference (exclusive)
 * @param end - The ending reference (inclusive)
 * @returns Array of commits with hash, subject, and body
 *
 * @example
 * ```typescript
 * const commits = await getCommitsBetween("v1.0.0", "main");
 * for (const commit of commits) {
 *   console.log(`${commit.hash}: ${commit.subject}`);
 * }
 * ```
 */
export const getCommitsBetween = async (
  start: string,
  end: string,
): Promise<Commit[]> => {
  const text = await runtime.exec.exec("git", [
    "--no-pager",
    "log",
    `--pretty=format:${COMMIT_SEPARATOR}%H%B`,
    `${start}..${end}`,
  ]);

  return parseCommitLog(text);
};

/**
 * Gets all commits since a specific date.
 *
 * @param date - The date in YYYY.MM.DD or YYYY-MM-DD format
 * @returns Array of commits with hash, subject, and body
 *
 * @example
 * ```typescript
 * const commits = await getCommitsSinceDate("2024.07.16");
 * for (const commit of commits) {
 *   console.log(`${commit.hash}: ${commit.subject}`);
 * }
 * ```
 */
export const getCommitsSinceDate = async (
  date: string,
): Promise<Commit[]> => {
  // Convert YYYY.MM.DD to YYYY-MM-DD if needed
  const gitDate = date.replace(/\./g, "-");

  const text = await runtime.exec.exec("git", [
    "--no-pager",
    "log",
    `--after=${gitDate}`,
    `--pretty=format:${COMMIT_SEPARATOR}%H%B`,
  ]);

  return parseCommitLog(text);
};

/**
 * Stages all changes in the working directory.
 *
 * @example
 * ```typescript
 * await stageAll();
 * ```
 */
export const stageAll = async (): Promise<void> => {
  await runtime.exec.spawn("git", ["add", "."]);
};

/**
 * Creates a commit with the specified message and user.
 *
 * @param message - The commit message
 * @param user - The commit author (name and email)
 *
 * @example
 * ```typescript
 * await commit("feat: add new feature", {
 *   name: "John Doe",
 *   email: "john@example.com"
 * });
 * ```
 */
export const commit = async (
  message: string,
  user: CommitUser,
): Promise<void> => {
  await runtime.exec.spawn("git", [
    "-c",
    `user.name=${user.name}`,
    "-c",
    `user.email=${user.email}`,
    "commit",
    "-m",
    message,
  ]);
};

/**
 * Pushes a branch to a remote repository.
 *
 * @param remote - The remote name (e.g., "origin")
 * @param branch - The branch name to push
 *
 * @example
 * ```typescript
 * await push("origin", "feature-branch");
 * ```
 */
export const push = async (remote: string, branch: string): Promise<void> => {
  await runtime.exec.spawn("git", ["push", remote, branch]);
};
