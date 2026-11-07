// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"regexp"
	"slices"
	"strings"
)

var (
	// unreleasedHeading matches "## Unreleased", "## [Unreleased]" and the
	// Keep a Changelog form with a link.
	unreleasedHeading = regexp.MustCompile(`(?i)^##\s+\[?unreleased\]?(\(.*\))?\s*$`) //nolint:gochecknoglobals

	// generatedEntrySuffix is the short hash GenerateChangelogSection ends every
	// entry with. Text a person wrote does not end in one.
	generatedEntrySuffix = regexp.MustCompile(`\s\([0-9a-f]{7,40}\)$`) //nolint:gochecknoglobals
)

// fenceTracker follows fenced code blocks, where a line that reads like a
// heading or a list item is only text.
type fenceTracker struct {
	marker byte
	size   int
}

// inside reports whether line opens, closes or sits in a fence. Lines must be
// passed in order.
func (f *fenceTracker) inside(line string) bool {
	trimmed := strings.TrimLeft(line, " \t")
	run := 0

	if trimmed != "" && (trimmed[0] == '`' || trimmed[0] == '~') {
		run = len(trimmed) - len(strings.TrimLeft(trimmed, trimmed[:1]))
	}

	if f.size == 0 {
		// A backtick in the info string makes it an inline code span instead.
		if run < 3 || (trimmed[0] == '`' && strings.Contains(trimmed[run:], "`")) {
			return false
		}

		f.marker, f.size = trimmed[0], run

		return true
	}

	if run >= f.size && trimmed[0] == f.marker && strings.TrimSpace(trimmed[run:]) == "" {
		f.size = 0
	}

	return true
}

// splitAtHeadings cuts lines at each heading with the given prefix outside a
// fence. Each block starts with its heading; head holds the lines before the
// first one.
func splitAtHeadings(lines []string, prefix string) ([]string, [][]string) {
	var fence fenceTracker

	head := lines
	blocks := [][]string{}
	start := -1

	for i, line := range lines {
		if fence.inside(line) || !strings.HasPrefix(line, prefix) {
			continue
		}

		if start < 0 {
			head = lines[:i]
		} else {
			blocks = append(blocks, lines[start:i])
		}

		start = i
	}

	if start >= 0 {
		blocks = append(blocks, lines[start:])
	}

	return head, blocks
}

func trimBlankLines(lines []string) []string {
	for len(lines) > 0 && strings.TrimSpace(lines[0]) == "" {
		lines = lines[1:]
	}

	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}

	return lines
}

// joinChangelogBlocks renders blocks with one blank line between them.
func joinChangelogBlocks(blocks [][]string) string {
	parts := make([]string, 0, len(blocks))

	for _, block := range blocks {
		if trimmed := trimBlankLines(block); len(trimmed) > 0 {
			parts = append(parts, strings.Join(trimmed, "\n"))
		}
	}

	return strings.Join(parts, "\n\n") + "\n"
}

// joinBodies appends b to a. Two lists stay one tight list, since a blank line
// between them would make oxfmt space every item of the result.
func joinBodies(a, b []string) []string {
	a, b = trimBlankLines(a), trimBlankLines(b)
	if len(a) == 0 || len(b) == 0 {
		return slices.Concat(a, b)
	}

	last := a[len(a)-1]
	if (strings.HasPrefix(last, "- ") || strings.HasPrefix(last, " ")) && strings.HasPrefix(b[0], "- ") {
		return slices.Concat(a, b)
	}

	return slices.Concat(a, []string{""}, b)
}

// dropGeneratedEntries removes the entries an earlier run generated from a
// subsection's body: list items that end in a commit hash or that the new
// section lists again. An item with more paragraphs was written by a person.
func dropGeneratedEntries(body []string, regenerated map[string]bool) []string {
	var fence fenceTracker

	kept := []string{}

	for i := 0; i < len(body); {
		if fence.inside(body[i]) || !strings.HasPrefix(body[i], "- ") {
			kept = append(kept, body[i])
			i++

			continue
		}

		end := i + 1
		for end < len(body) && isIndentedText(body[end]) {
			end++
		}

		entry := strings.Join(strings.Fields(strings.Join(body[i:end], " ")), " ")
		generated := regenerated[entry] || generatedEntrySuffix.MatchString(entry)

		if !generated || continuesAfterBlank(body, end) {
			kept = append(kept, body[i])
			i++

			continue
		}

		i = end
		for i < len(body) && strings.TrimSpace(body[i]) == "" && (len(kept) == 0 || strings.TrimSpace(kept[len(kept)-1]) == "") {
			i++
		}
	}

	return kept
}

func isIndentedText(line string) bool {
	return strings.TrimSpace(line) != "" && (line[0] == ' ' || line[0] == '\t')
}

func continuesAfterBlank(lines []string, from int) bool {
	for from < len(lines) && strings.TrimSpace(lines[from]) == "" {
		from++
	}

	return from < len(lines) && isIndentedText(lines[from])
}

// subsectionRank orders the sections the generator writes as it writes them,
// and every other subsection (Migration among them) after those.
func subsectionRank(title string) int {
	for i, section := range sectionOrder {
		if strings.EqualFold(title, string(section)) {
			return i
		}
	}

	return len(sectionOrder)
}

type changelogSubsection struct {
	heading string
	title   string
	body    []string
}

// subsectionList collects subsections, merging those of one name in the order
// they are added.
type subsectionList []*changelogSubsection

func (l *subsectionList) add(block []string, body []string) {
	title := strings.TrimSpace(strings.TrimPrefix(block[0], "### "))

	for _, existing := range *l {
		if strings.EqualFold(existing.title, title) {
			existing.body = joinBodies(existing.body, body)

			return
		}
	}

	*l = append(*l, &changelogSubsection{heading: block[0], title: title, body: trimBlankLines(body)})
}

// mergeReleaseSection builds a version's section from the generated section,
// the body the version's section already has on a re-run, and the notes that
// were under Unreleased.
//
// The order follows the CHANGELOG.md style: text directly under the heading,
// then the sections in the generator's order, then Migration and any other
// hand-written subsection. A hand-written list joins the generated section of
// its name. On a re-run the old generated entries go, since the new section
// lists them again; everything else in the old body was written by a person
// and stays.
func mergeReleaseSection(newSection string, previous, notes []string) []string {
	generatedHead, generated := splitAtHeadings(strings.Split(newSection, "\n"), "### ")
	heading, generatedText := "", []string{}

	if head := trimBlankLines(generatedHead); len(head) > 0 {
		heading, generatedText = head[0], trimBlankLines(head[1:])
	}

	subsections := subsectionList{}
	regenerated := map[string]bool{}

	for _, block := range generated {
		subsections.add(block, block[1:])

		for _, line := range block[1:] {
			if strings.HasPrefix(line, "- ") {
				regenerated[strings.Join(strings.Fields(line), " ")] = true
			}
		}
	}

	previousHead, previousBlocks := splitAtHeadings(previous, "### ")
	notesHead, notesBlocks := splitAtHeadings(notes, "### ")

	text := joinBodies(generatedText, notesHead)
	if !slices.Equal(generatedText, trimBlankLines(previousHead)) {
		text = joinBodies(joinBodies(generatedText, previousHead), notesHead)
	}

	for _, block := range previousBlocks {
		body := block[1:]
		if subsectionRank(strings.TrimSpace(strings.TrimPrefix(block[0], "### "))) < len(sectionOrder) {
			body = dropGeneratedEntries(body, regenerated)
		}

		subsections.add(block, body)
	}

	for _, block := range notesBlocks {
		subsections.add(block, block[1:])
	}

	slices.SortStableFunc(subsections, func(a, b *changelogSubsection) int {
		return subsectionRank(a.title) - subsectionRank(b.title)
	})

	result := []string{heading}
	if len(text) > 0 {
		result = slices.Concat(result, []string{""}, text)
	}

	for _, subsection := range subsections {
		if len(subsection.body) > 0 {
			result = slices.Concat(result, []string{"", subsection.heading, ""}, subsection.body)
		}
	}

	return result
}
