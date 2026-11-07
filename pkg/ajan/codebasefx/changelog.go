// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
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
		// style; emitting it here keeps oxfmt a no-op on the result.
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

// InsertIntoChangelog writes a version's section into a changelog and moves
// the notes under "## Unreleased" into it, leaving that heading empty above
// the section. The section goes below Unreleased, or first when the changelog
// has no Unreleased. An existing section of version is replaced in place, and
// the text in it a person wrote stays (see mergeReleaseSection). Pass version
// "" to always insert a new section.
func InsertIntoChangelog(changelogContent, newSection, version string) string {
	intro, sections := splitAtHeadings(strings.Split(changelogContent, "\n"), "## ")
	bare := strings.TrimPrefix(version, "v")

	var (
		unreleased []string
		notes      []string
		rest       [][]string
	)

	for _, section := range sections {
		if !unreleasedHeading.MatchString(section[0]) {
			rest = append(rest, section)

			continue
		}

		if unreleased == nil {
			unreleased = section[:1]
		}

		notes = append(append(notes, ""), section[1:]...)
	}

	existing := -1

	for i, section := range rest {
		if version != "" && isVersionHeading(strings.TrimSpace(section[0]), bare) {
			existing = i

			break
		}
	}

	var previous []string
	if existing >= 0 {
		previous = rest[existing][1:]
	}

	merged := mergeReleaseSection(newSection, previous, notes)

	if existing >= 0 {
		rest[existing] = merged
	} else {
		rest = append([][]string{merged}, rest...)
	}

	blocks := append([][]string{intro}, unreleased)

	return joinChangelogBlocks(append(blocks, rest...))
}
