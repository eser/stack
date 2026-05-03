// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// recordSep and unitSep are ASCII separators used to delimit git log records.
const recordSep = "\x1e"
const unitSep = "\x1f"

// runGit runs a git command in the given directory and returns stdout.
func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...) //nolint:gosec
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if strings.Contains(msg, "not a git repository") {
			return "", fmt.Errorf("runGit: %w", ErrNotAGitRepo)
		}

		if msg == "" {
			msg = err.Error()
		}

		return "", fmt.Errorf("runGit %q: %s", args[0], msg)
	}

	return strings.TrimRight(stdout.String(), "\n"), nil
}

// GetLatestTag returns the most recent semver tag reachable from HEAD.
func GetLatestTag(ctx context.Context, dir string) (string, error) {
	out, err := runGit(ctx, dir, "describe", "--tags", "--abbrev=0")
	if err != nil {
		if strings.Contains(err.Error(), "No names found") ||
			strings.Contains(err.Error(), "No tags can describe") ||
			strings.Contains(err.Error(), "no tags") {
			return "", fmt.Errorf("GetLatestTag: %w", ErrNoTags)
		}

		return "", fmt.Errorf("GetLatestTag: %w", err)
	}

	return out, nil
}

// GetCurrentBranch returns the name of the currently checked-out branch.
func GetCurrentBranch(ctx context.Context, dir string) (string, error) {
	out, err := runGit(ctx, dir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("GetCurrentBranch: %w", err)
	}

	return out, nil
}

// GetCommitsBetween returns all commits in the range (start, end] using the
// git log format: hash \x1f subject \x1f body \x1e.
func GetCommitsBetween(ctx context.Context, dir, start, end string) ([]Commit, error) {
	format := "%H" + unitSep + "%s" + unitSep + "%b" + recordSep
	ref := start + ".." + end

	out, err := runGit(ctx, dir, "log", "--pretty=format:"+format, ref)
	if err != nil {
		return nil, fmt.Errorf("GetCommitsBetween: %w", err)
	}

	return parseCommitLog(out), nil
}

// GetCommitsSinceDate returns all commits since the given ISO-8601 date string.
func GetCommitsSinceDate(ctx context.Context, dir, date string) ([]Commit, error) {
	format := "%H" + unitSep + "%s" + unitSep + "%b" + recordSep

	out, err := runGit(ctx, dir, "log", "--pretty=format:"+format, "--since="+date)
	if err != nil {
		return nil, fmt.Errorf("GetCommitsSinceDate: %w", err)
	}

	return parseCommitLog(out), nil
}

// Checkout switches to the given ref (branch, tag, or commit hash).
func Checkout(ctx context.Context, dir, ref string) error {
	if _, err := runGit(ctx, dir, "checkout", ref); err != nil {
		return fmt.Errorf("Checkout %q: %w", ref, err)
	}

	return nil
}

// CheckoutPrevious switches to the previously checked-out branch.
func CheckoutPrevious(ctx context.Context, dir string) error {
	if _, err := runGit(ctx, dir, "checkout", "-"); err != nil {
		return fmt.Errorf("CheckoutPrevious: %w", err)
	}

	return nil
}

// CreateAndCheckoutBranch creates a new branch and switches to it.
func CreateAndCheckoutBranch(ctx context.Context, dir, name string) error {
	if _, err := runGit(ctx, dir, "checkout", "-b", name); err != nil {
		return fmt.Errorf("CreateAndCheckoutBranch %q: %w", name, err)
	}

	return nil
}

// StageAll stages all changes (git add -A).
func StageAll(ctx context.Context, dir string) error {
	if _, err := runGit(ctx, dir, "add", "-A"); err != nil {
		return fmt.Errorf("StageAll: %w", err)
	}

	return nil
}

// CommitChanges creates a commit with the given message and author.
func CommitChanges(ctx context.Context, dir, message string, author CommitAuthor) error {
	args := []string{"commit", "--message=" + message}

	if author.Name != "" {
		args = append(args, "--author="+author.Name+" <"+author.Email+">")
	}

	if _, err := runGit(ctx, dir, args...); err != nil {
		return fmt.Errorf("CommitChanges: %w", err)
	}

	return nil
}

// Push pushes the branch to the remote.
func Push(ctx context.Context, dir, remote, branch string) error {
	if _, err := runGit(ctx, dir, "push", remote, branch); err != nil {
		return fmt.Errorf("Push %s %s: %w", remote, branch, err)
	}

	return nil
}

// CreateTag creates an annotated tag at HEAD.
func CreateTag(ctx context.Context, dir, tag, message string) error {
	if _, err := runGit(ctx, dir, "tag", "-a", tag, "-m", message); err != nil {
		return fmt.Errorf("CreateTag %q: %w", tag, err)
	}

	return nil
}

// PushTag pushes a single tag to the remote.
func PushTag(ctx context.Context, dir, remote, tag string) error {
	if _, err := runGit(ctx, dir, "push", remote, "refs/tags/"+tag); err != nil {
		return fmt.Errorf("PushTag %q: %w", tag, err)
	}

	return nil
}

// DeleteTag deletes a local tag.
func DeleteTag(ctx context.Context, dir, tag string) error {
	if _, err := runGit(ctx, dir, "tag", "-d", tag); err != nil {
		return fmt.Errorf("DeleteTag %q: %w", tag, err)
	}

	return nil
}

// DeleteRemoteTag deletes a tag from the remote.
func DeleteRemoteTag(ctx context.Context, dir, remote, tag string) error {
	if _, err := runGit(ctx, dir, "push", remote, "--delete", "refs/tags/"+tag); err != nil {
		return fmt.Errorf("DeleteRemoteTag %q: %w", tag, err)
	}

	return nil
}

// IsCleanWorkTree returns true when there are no uncommitted changes.
func IsCleanWorkTree(ctx context.Context, dir string) (bool, error) {
	out, err := runGit(ctx, dir, "status", "--porcelain")
	if err != nil {
		return false, fmt.Errorf("IsCleanWorkTree: %w", err)
	}

	return out == "", nil
}

// --- helpers ---

// parseCommitLog splits raw git log output into Commit structs.
// The expected format per commit: hash \x1f subject \x1f body \x1e
func parseCommitLog(raw string) []Commit {
	var commits []Commit

	records := strings.Split(raw, recordSep)
	for _, rec := range records {
		rec = strings.TrimSpace(rec)
		if rec == "" {
			continue
		}

		parts := strings.SplitN(rec, unitSep, 3)

		commit := Commit{Hash: strings.TrimSpace(parts[0])}

		if len(parts) > 1 {
			commit.Subject = strings.TrimSpace(parts[1])
		}

		if len(parts) > 2 {
			commit.Body = strings.TrimSpace(parts[2])
		}

		commits = append(commits, commit)
	}

	return commits
}
