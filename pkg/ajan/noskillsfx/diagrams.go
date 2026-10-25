// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The diagram registry of dashboard/diagrams.ts: the mermaid blocks, ASCII
// box drawings and PlantUML files of a project, kept in .eser/diagrams.json
// with the files each one names. A diagram whose named file was modified
// during a spec is stale, and COMPLETED holds the spec until it is
// verified again.

// DiagramsFile is the registry, relative to the project root.
const DiagramsFile = eserDir + "/diagrams.json"

//nolint:gochecknoglobals // compiled once
var (
	diagramFilePattern   = regexp.MustCompile(`(?:[\w@.-]+/)*[\w@.-]+\.(?:ts|tsx|js|jsx|go|py|rs|md|json|yaml|yml)`)
	diagramModulePattern = regexp.MustCompile(`(?:@[\w-]+/[\w-]+|[\w-]+/[\w-]+)`)
	boxDrawing           = regexp.MustCompile(`[┌─┬┐│└┴┘╔═╗║╚╝╭╮╰╯]`)
	asciiArtLine         = regexp.MustCompile(`[┌─┬┐│└┴┘╔═╗║╚╝╭╮╰╯┼├┤▶→←↓↑|+\-]`)
)

// diagramHash is hashContent: a 32-bit string hash over UTF-16 code units,
// its absolute value in base 36.
func diagramHash(content string) string {
	var hash int32

	for _, unit := range utf16Units(content) {
		hash = (hash << 5) - hash + int32(unit)
	}

	abs := int64(hash)
	if abs < 0 {
		abs = -abs
	}

	return strconv.FormatInt(abs, 36)
}

// diagramReferences is extractReferences: the file-like names, then the
// module-like ones, each once, in the order they first appear. The file
// names are blanked before the module names are matched, so src/login.ts
// does not also yield src/login.
func diagramReferences(content string) []any {
	refs := []string{}

	for _, match := range diagramFilePattern.FindAllString(content, -1) {
		if !containsString(refs, match) {
			refs = append(refs, match)
		}
	}

	rest := diagramFilePattern.ReplaceAllLiteralString(content, " ")

	for _, match := range diagramModulePattern.FindAllString(rest, -1) {
		if !containsString(refs, match) {
			refs = append(refs, match)
		}
	}

	return anyOf(refs)
}

func diagramEntry(file string, line int, kind, content, nowISO string) *JSObject {
	return JSObjectOf(
		"file", file,
		"line", jsInteger(line),
		"type", kind,
		"hash", diagramHash(content),
		"referencedFiles", diagramReferences(content),
		"lastVerified", nowISO,
	)
}

// scanMarkdownDiagrams is scanMarkdownFile: every closed mermaid block,
// and an ASCII entry where a line that holds box drawing characters has a
// next line that does too, when the art from there is over 20 characters.
// The art's lines are one drawing, so the scan goes on after them.
func scanMarkdownDiagrams(rel, content, nowISO string) []*JSObject {
	var entries []*JSObject

	lines := strings.Split(content, "\n")
	inMermaid := false
	mermaidStart := 0

	var mermaid strings.Builder

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmed := jsTrim(line)

		switch {
		case strings.HasPrefix(trimmed, "```mermaid"):
			inMermaid = true
			mermaidStart = i + 1

			mermaid.Reset()

			continue
		case inMermaid && trimmed == "```":
			inMermaid = false

			entries = append(entries, diagramEntry(rel, mermaidStart, "mermaid", mermaid.String(), nowISO))

			continue
		case inMermaid:
			mermaid.WriteString(line + "\n")

			continue
		}

		if !boxDrawing.MatchString(line) || i+1 >= len(lines) || !boxDrawing.MatchString(lines[i+1]) {
			continue
		}

		var art strings.Builder

		j := i
		for ; j < len(lines) && asciiArtLine.MatchString(lines[j]); j++ {
			art.WriteString(lines[j] + "\n")
		}

		if jsLength(art.String()) > 20 {
			entries = append(entries, diagramEntry(rel, i+1, "ascii", art.String(), nowISO))
		}

		i = j - 1
	}

	return entries
}

// ScanDiagrams is scanProject: the diagrams of every markdown file under
// root, skipping names that start with a dot and node_modules, then the
// .puml files at the top level. It reads through an os.Root, so a symlink
// cannot take the scan outside the project.
func ScanDiagrams(root string, now time.Time) ([]*JSObject, error) {
	project, err := os.OpenRoot(root)
	if err != nil {
		return nil, fmt.Errorf("open the project %s: %w", root, err)
	}
	defer func() { _ = project.Close() }()

	nowISO := ISOTime(now)

	var markdown []string

	collectMarkdown(project, ".", &markdown)

	entries := []*JSObject{}

	for _, rel := range markdown {
		data, err := project.ReadFile(rel)
		if err != nil {
			continue
		}

		entries = append(entries, scanMarkdownDiagrams(rel, string(data), nowISO)...)
	}

	top, err := readRootDir(project, ".")
	if err != nil {
		return entries, nil //nolint:nilerr // scanProject skips a root it cannot list
	}

	for _, entry := range top {
		if !entry.Type().IsRegular() || !strings.HasSuffix(entry.Name(), ".puml") {
			continue
		}

		data, err := project.ReadFile(entry.Name())
		if err != nil {
			// scanProject stops at the first .puml file it cannot read.
			break
		}

		entries = append(entries, diagramEntry(entry.Name(), 1, "plantuml", string(data), nowISO))
	}

	return entries, nil
}

func readRootDir(project *os.Root, dir string) ([]fs.DirEntry, error) {
	f, err := project.Open(dir)
	if err != nil {
		return nil, err //nolint:wrapcheck // the caller skips the directory
	}
	defer func() { _ = f.Close() }()

	entries, err := f.ReadDir(-1)
	if err != nil {
		return nil, err //nolint:wrapcheck // the caller skips the directory
	}

	slices.SortFunc(entries, func(a, b fs.DirEntry) int { return strings.Compare(a.Name(), b.Name()) })

	return entries, nil
}

// collectMarkdown adds the .md files under dir to files, depth first, in
// name order; a directory it cannot list is skipped.
func collectMarkdown(project *os.Root, dir string, files *[]string) {
	entries, err := readRootDir(project, dir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			continue
		}

		rel := name
		if dir != "." {
			rel = path.Join(dir, name)
		}

		if entry.Type().IsRegular() && strings.HasSuffix(name, ".md") {
			*files = append(*files, rel)
		}

		if entry.IsDir() {
			collectMarkdown(project, rel, files)
		}
	}
}

// ReadDiagramRegistry is readRegistry: the registry's entries, or none when
// it is missing, does not parse, or is not a list.
func ReadDiagramRegistry(root string) []any {
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(DiagramsFile))) //nolint:gosec // G304: the project's diagram registry
	if err != nil {
		return []any{}
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return []any{}
	}

	registry, ok := parsed.([]any)
	if !ok {
		return []any{}
	}

	return registry
}

// WriteDiagramRegistry is writeRegistry: two-space JSON and a newline,
// creating .eser/ when it does not exist.
func WriteDiagramRegistry(root string, entries []any) error {
	file := filepath.Join(root, filepath.FromSlash(DiagramsFile))

	if err := os.MkdirAll(filepath.Dir(file), 0o750); err != nil {
		return fmt.Errorf("create the directory of the diagram registry %s: %w", DiagramsFile, err)
	}

	if err := os.WriteFile(file, []byte(jsonStringifyIndent(entries)+"\n"), stateFilePerm); err != nil { //nolint:gosec // G306: the registry is not secret
		return fmt.Errorf("write the diagram registry %s: %w", DiagramsFile, err)
	}

	return nil
}

// VerifyDiagram is verifyDiagram: it sets lastVerified on the entries of
// file (on line only, when hasLine) and reports whether there were any.
// A line that is not a number (lineOK false) matches no entry.
func VerifyDiagram(root, file string, line int, hasLine, lineOK bool, now time.Time) (bool, error) {
	registry := ReadDiagramRegistry(root)
	found := false
	updated := make([]any, len(registry))

	for i, item := range registry {
		updated[i] = item

		entry, ok := item.(*JSObject)
		if !ok || entry.str("file") != file {
			continue
		}

		if hasLine {
			value, isNumber := entry.getOr("line").(float64)
			if !lineOK || !isNumber || value != float64(line) {
				continue
			}
		}

		found = true
		updated[i] = entry.with("lastVerified", ISOTime(now))
	}

	if !found {
		return false, nil
	}

	return true, WriteDiagramRegistry(root, updated)
}

// StaleDiagram is one result of CheckDiagramStaleness.
type StaleDiagram struct {
	File   any
	Line   any
	Type   any
	Reason string
}

// CheckDiagramStaleness is checkStaleness: for each registered diagram, the
// first file it names that a modified file (without a leading ./) holds or
// is part of. A diagram appears once, however many modified files it names.
func CheckDiagramStaleness(root string, modified []string) []StaleDiagram {
	registry := ReadDiagramRegistry(root)
	if len(registry) == 0 {
		return nil
	}

	var mods []string

	for _, file := range modified {
		file = strings.TrimPrefix(file, "./")
		if !containsString(mods, file) {
			mods = append(mods, file)
		}
	}

	var stale []StaleDiagram

	for _, diagram := range objectsOf(registry) {
	refs:
		for _, ref := range stringsOf(diagram.arr("referencedFiles")) {
			for _, mod := range mods {
				if strings.Contains(mod, ref) || strings.Contains(ref, mod) {
					stale = append(stale, StaleDiagram{
						File:   diagram.getOr("file"),
						Line:   diagram.getOr("line"),
						Type:   diagram.getOr("type"),
						Reason: mod + " was modified but diagram references " + ref,
					})

					break refs
				}
			}
		}
	}

	return stale
}
