// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// manifestSectionComment is the comment writeManifest puts at the top of
// the noskills section.
const manifestSectionComment = "# noskills orchestrator — inline comments in this section won't be preserved on next write"

// renderManifestSection is the noskills section as writeManifest prints it:
// the key, the comment, and the section at the library's default width.
func renderManifestSection(section *JSObject) string {
	e := yamlEmitter{lineWidth: 80}

	body := "{}"
	if len(section.keys) > 0 {
		body = e.mapping(section, "  ")
	}

	return manifestSectionKey + ":\n  " + manifestSectionComment + "\n  " + body
}

// WriteManifestSection is the TypeScript writeManifest: it replaces the
// manifest's noskills section, or adds it at the end, and keeps the rest of
// the file as it is. A file that does not exist yet holds the section only.
//
// The TypeScript CLI parses the whole file and prints it again, which also
// normalizes the formatting of the other sections; this keeps their text.
func WriteManifestSection(root string, section *JSObject) error {
	path := filepath.Join(root, manifestFile)
	block := renderManifestSection(section)

	existing, err := os.ReadFile(path) //nolint:gosec // G304: the project's own manifest
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read %s: %w", path, err)
	}

	var content string

	switch text := string(existing); {
	case strings.TrimSpace(text) == "":
		content = block + "\n"
	default:
		content = spliceManifestSection(text, block)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("create %s: %w", filepath.Dir(path), err)
	}

	if err := writeFileAtomic(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	return nil
}

// spliceManifestSection puts block where the top-level noskills key is, or
// after the last line.
func spliceManifestSection(text, block string) string {
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")
	start := -1

	for i, line := range lines {
		if line == manifestSectionKey+":" || strings.HasPrefix(line, manifestSectionKey+": ") ||
			strings.HasPrefix(line, manifestSectionKey+":\t") {
			start = i

			break
		}
	}

	if start == -1 {
		return strings.Join(lines, "\n") + "\n" + block + "\n"
	}

	end := start + 1
	for end < len(lines) && (lines[end] == "" || lines[end][0] == ' ' || lines[end][0] == '\t') {
		end++
	}

	// Blank lines before the next key stay with it.
	for end > start+1 && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}

	out := append(append(append([]string{}, lines[:start]...), block), lines[end:]...)

	return strings.Join(out, "\n") + "\n"
}
