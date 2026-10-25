// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"regexp"
	"strings"
)

// ChangelogEntry is one released version of CHANGELOG.md.
type ChangelogEntry struct {
	Version string // "4.0.43"
	Date    string // "2024-07-16", or "" when the heading has none
	Tag     string // "v4.0.43"
	Notes   string // the section as release notes markdown
}

var changelogHeading = regexp.MustCompile(`^##\s{1,100}\[?([^\]\s]+)\]?\s{0,100}-?\s{0,100}([0-9]{4}-[0-9]{2}-[0-9]{2})?\s{0,100}$`) //nolint:gochecknoglobals

// NormalizeTag turns "4.0.43", "v4.0.43" or "refs/tags/v4.0.43" into "v4.0.43".
func NormalizeTag(raw string) string {
	trimmed := strings.TrimPrefix(strings.TrimSpace(raw), "refs/tags/")
	if strings.HasPrefix(trimmed, "v") {
		return trimmed
	}

	return "v" + trimmed
}

// ParseChangelogText returns the version sections of a CHANGELOG.md, most
// recent first, as the TypeScript release-notes command parses them: both
// "## 1.2.3 - date" and the legacy "## [v1.2.3] - date" headings count, and
// headings that are not versions ([Unreleased]) are skipped.
func ParseChangelogText(text string) []ChangelogEntry {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")

	type heading struct {
		version string
		date    string
		index   int
	}

	var headings []heading

	for i, line := range lines {
		m := changelogHeading.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		version := strings.TrimPrefix(m[1], "v")
		if version == "" || version[0] < '0' || version[0] > '9' {
			continue
		}

		headings = append(headings, heading{version: version, date: m[2], index: i})
	}

	entries := make([]ChangelogEntry, 0, len(headings))

	for i, h := range headings {
		end := len(lines)
		if i+1 < len(headings) {
			end = headings[i+1].index
		}

		body := lines[h.index+1 : end]
		for len(body) > 0 && strings.TrimSpace(body[0]) == "" {
			body = body[1:]
		}

		for len(body) > 0 && strings.TrimSpace(body[len(body)-1]) == "" {
			body = body[:len(body)-1]
		}

		title := "## " + h.version
		if h.date != "" {
			title += " - " + h.date
		}

		parts := []string{title}
		if len(body) > 0 {
			parts = append(append(parts, ""), body...)
		}

		entries = append(entries, ChangelogEntry{
			Version: h.version,
			Date:    h.date,
			Tag:     "v" + h.version,
			Notes:   strings.TrimSpace(strings.Join(parts, "\n")) + "\n",
		})
	}

	return entries
}
