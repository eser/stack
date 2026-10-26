// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// GenerateChangelog reads git history since the last tag, parses conventional
// commits, generates a changelog section, and optionally writes CHANGELOG.md.
// The heading version comes from opts.Version when the caller supplies one — a
// release knows the version it is publishing, which the tag history does not.
// The next-patch fallback only serves standalone changelog-gen runs that have
// no release driving them.
func GenerateChangelog(ctx context.Context, opts GenerateChangelogOptions) (GenerateChangelogResult, error) {
	root := opts.Root
	if root == "" {
		root = "."
	}

	root, err := filepath.Abs(root)
	if err != nil {
		return GenerateChangelogResult{}, fmt.Errorf("GenerateChangelog: %w", err)
	}

	// lastTag also bounds the commit range below, so it is read either way.
	lastTag, err := GetLatestTag(ctx, root)
	if err != nil {
		lastTag = "v0.0.0"
	}

	// Trim BEFORE testing for empty. A whitespace-only Version (a stray newline
	// from a file read, say) would otherwise pass the check, trim to "" further
	// down, and yield a "##  - <date>" heading -- which also disables dedup,
	// since InsertIntoChangelog skips replacement when version is empty, so
	// every re-run would append another copy.
	nextVersion := strings.TrimPrefix(strings.TrimSpace(opts.Version), "v")

	if nextVersion == "" {
		nextVersion, err = BumpVersion(lastTag, VersionCommandPatch, "")
		if err != nil {
			nextVersion = lastTag
		}

		nextVersion = strings.TrimPrefix(strings.TrimSpace(nextVersion), "v")
	}

	// Fetch commits since the last tag.
	var commits []Commit

	if lastTag != "v0.0.0" {
		commits, err = GetCommitsBetween(ctx, root, lastTag, "HEAD")
		if err != nil {
			return GenerateChangelogResult{}, fmt.Errorf("GenerateChangelog: %w", err)
		}
	} else {
		commits, err = GetCommitsSinceDate(ctx, root, "1970-01-01")
		if err != nil {
			return GenerateChangelogResult{}, fmt.Errorf("GenerateChangelog: %w", err)
		}
	}

	conventional := ParseConventionalCommits(commits)
	conventional = DeduplicateCommits(conventional)

	section := GenerateChangelogSection(nextVersion, conventional)

	result := GenerateChangelogResult{
		Version:     nextVersion,
		CommitCount: len(commits),
		EntryCount:  len(conventional),
		Content:     section,
		DryRun:      opts.DryRun,
	}

	if opts.DryRun {
		return result, nil
	}

	// Read existing CHANGELOG.md or start fresh.
	changelogPath := filepath.Join(root, "CHANGELOG.md")
	existing := "# Changelog\n\nAll notable changes to this project will be documented here.\n"

	if raw, err := os.ReadFile(changelogPath); err == nil { //nolint:gosec
		existing = string(raw)
	}

	updated := InsertIntoChangelog(existing, section, nextVersion)
	if err := os.WriteFile(changelogPath, []byte(updated), 0o644); err != nil { //nolint:gosec
		return result, fmt.Errorf("GenerateChangelog writing CHANGELOG.md: %w", err)
	}

	return result, nil
}
