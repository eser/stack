// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// typeToSection maps conventional commit types to changelog sections.
var typeToSection = map[string]ChangelogSection{
	"feat":     SectionAdded,
	"fix":      SectionFixed,
	"revert":   SectionFixed,
	"refactor": SectionChanged,
	"perf":     SectionChanged,
	"style":    SectionChanged,
	"docs":     SectionChanged,
	"test":     SectionChanged,
	"build":    SectionChanged,
	"ci":       SectionChanged,
	"chore":    SectionChanged,
}

// sectionOrder defines the display order of changelog sections.
var sectionOrder = []ChangelogSection{
	SectionAdded,
	SectionFixed,
	SectionChanged,
	SectionRemoved,
}

// GroupBySection maps parsed commits to their changelog sections.
// Breaking changes always appear in SectionRemoved.
func GroupBySection(commits []ConventionalCommit) map[ChangelogSection][]ConventionalCommit {
	out := make(map[ChangelogSection][]ConventionalCommit)

	for _, c := range commits {
		if c.Breaking {
			out[SectionRemoved] = append(out[SectionRemoved], c)
			continue
		}

		section, ok := typeToSection[c.Type]
		if !ok {
			section = SectionChanged
		}

		out[section] = append(out[section], c)
	}

	return out
}

// GenerateChangelogSection renders one version block in Keep-a-Changelog markdown.
// The format is:
//
//	## [version] - YYYY-MM-DD
//	### Added
//	- message
func GenerateChangelogSection(version string, commits []ConventionalCommit) string {
	grouped := GroupBySection(commits)

	var b strings.Builder

	b.WriteString("## [")
	b.WriteString(version)
	b.WriteString("] - ")
	b.WriteString(time.Now().UTC().Format("2006-01-02"))
	b.WriteString("\n")

	for _, section := range sectionOrder {
		items := grouped[section]
		if len(items) == 0 {
			continue
		}

		b.WriteString("\n### ")
		b.WriteString(string(section))
		b.WriteString("\n")

		for _, c := range items {
			msg := StripTakeSuffix(c.Message)

			b.WriteString("- ")

			if c.Scope != "" {
				b.WriteString("**")
				b.WriteString(c.Scope)
				b.WriteString("**: ")
			}

			b.WriteString(msg)

			if c.Hash != "" {
				b.WriteString(" (")
				short := c.Hash
				if len(short) > 7 {
					short = short[:7]
				}

				b.WriteString(short)
				b.WriteString(")")
			}

			b.WriteString("\n")
		}
	}

	return b.String()
}

// InsertIntoChangelog inserts newSection just after the first "# Changelog"
// heading (or prepends it). version is used only for finding an existing
// duplicate entry to replace; pass "" to always insert fresh.
func InsertIntoChangelog(changelogContent, newSection, version string) string {
	lines := strings.Split(changelogContent, "\n")
	insertAt := -1

	for i, line := range lines {
		stripped := strings.TrimSpace(line)

		// If this version already exists, replace it
		if version != "" && strings.HasPrefix(stripped, "## ["+version+"]") {
			// Find the end of this section (next ## heading)
			end := len(lines)
			for j := i + 1; j < len(lines); j++ {
				if strings.HasPrefix(strings.TrimSpace(lines[j]), "## ") {
					end = j

					break
				}
			}

			before := strings.Join(lines[:i], "\n")
			after := strings.Join(lines[end:], "\n")

			return before + "\n" + newSection + "\n" + after
		}

		// Insert before the first ## section heading
		if insertAt < 0 && strings.HasPrefix(stripped, "## ") {
			insertAt = i
		}
	}

	if insertAt >= 0 {
		before := strings.Join(lines[:insertAt], "\n")
		after := strings.Join(lines[insertAt:], "\n")

		return before + "\n" + newSection + "\n" + after
	}

	// No existing ## section — append after first # heading
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "# ") {
			before := strings.Join(lines[:i+1], "\n")
			after := strings.Join(lines[i+1:], "\n")

			return before + "\n\n" + newSection + "\n" + after
		}
	}

	// Fallback: prepend
	return newSection + "\n" + changelogContent
}

// GenerateChangelog reads git history since the last tag, parses conventional
// commits, generates a changelog section, and optionally writes CHANGELOG.md.
func GenerateChangelog(ctx context.Context, opts GenerateChangelogOptions) (GenerateChangelogResult, error) {
	root := opts.Root
	if root == "" {
		root = "."
	}

	root, err := filepath.Abs(root)
	if err != nil {
		return GenerateChangelogResult{}, fmt.Errorf("GenerateChangelog: %w", err)
	}

	// Determine the new version (next patch by default).
	lastTag, err := GetLatestTag(ctx, root)
	if err != nil {
		lastTag = "v0.0.0"
	}

	nextVersion, err := BumpVersion(lastTag, VersionCommandPatch, "")
	if err != nil {
		nextVersion = lastTag
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
