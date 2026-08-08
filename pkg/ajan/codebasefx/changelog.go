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
//	## version - YYYY-MM-DD
//
//	### Added
//
//	- message
//
// Callers may pass a v-prefixed version; the heading always carries the bare
// one so the release-notes parser can match it against a `vX.Y.Z` git tag.
func GenerateChangelogSection(version string, commits []ConventionalCommit) string {
	version = strings.TrimPrefix(version, "v")

	grouped := GroupBySection(commits)

	var b strings.Builder

	b.WriteString("## ")
	b.WriteString(version)
	b.WriteString(" - ")
	b.WriteString(time.Now().UTC().Format("2006-01-02"))
	b.WriteString("\n")

	for _, section := range sectionOrder {
		items := grouped[section]
		if len(items) == 0 {
			continue
		}

		// The blank line after the heading matches the repo's CHANGELOG.md
		// style; emitting it here keeps `deno fmt` a no-op on the result.
		b.WriteString("\n### ")
		b.WriteString(string(section))
		b.WriteString("\n\n")

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

// isVersionHeading reports whether stripped is the "## " heading for bare
// (a version with no "v" prefix). Both the current "## 1.2.3 - date" style and
// the legacy bracketed "## [1.2.3]" / "## [v1.2.3]" styles are recognized,
// because older sections of CHANGELOG.md still carry the bracketed form.
// The trailing space in the second case is what keeps 4.3.0 from matching a
// 4.3.01 heading.
func isVersionHeading(stripped, bare string) bool {
	return stripped == "## "+bare ||
		strings.HasPrefix(stripped, "## "+bare+" ") ||
		strings.HasPrefix(stripped, "## ["+bare+"]") ||
		strings.HasPrefix(stripped, "## [v"+bare+"]")
}

// InsertIntoChangelog inserts newSection just after the first "# Changelog"
// heading (or prepends it). version is used only for finding an existing
// duplicate entry to replace; pass "" to always insert fresh.
func InsertIntoChangelog(changelogContent, newSection, version string) string {
	lines := strings.Split(changelogContent, "\n")
	bare := strings.TrimPrefix(version, "v")
	insertAt := -1

	for i, line := range lines {
		stripped := strings.TrimSpace(line)

		// If this version already exists, replace it
		if version != "" && isVersionHeading(stripped, bare) {
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
