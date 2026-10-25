// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// The file-specific rules the PreToolUse hook gives the agent next to an
// allowed edit in EXECUTING: the scoped rules of .eser/rules/ (port of
// loadScopedRules and getTier2RulesForFile in sync/engine.ts), the
// .folder-rules.md files above the file (context/folder-rules.ts) and the
// concerns' scoped reminders.

// ScopedRule is a rule with its optional phase and file scope. A nil list
// means the frontmatter does not set it.
type ScopedRule struct {
	Text      string
	Phases    []string
	AppliesTo []string
}

var frontmatterQuotes = regexp.MustCompile(`^["']|["']$`) //nolint:gochecknoglobals // compiled once

func stripFrontmatterQuotes(value string) string {
	return frontmatterQuotes.ReplaceAllLiteralString(value, "")
}

// parseRuleFrontmatter is the engine's simple key: value parser.
func parseRuleFrontmatter(content string) (meta map[string]any, body string) {
	meta = map[string]any{}
	trimmed := jsTrim(content)

	if !strings.HasPrefix(trimmed, "---") {
		return meta, trimmed
	}

	end := strings.Index(trimmed[3:], "---")
	if end == -1 {
		return meta, trimmed
	}

	end += 3
	block := jsTrim(trimmed[3:end])
	body = jsTrim(trimmed[end+3:])

	for _, line := range strings.Split(block, "\n") {
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}

		key = jsTrim(key)
		value = jsTrim(value)

		if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") && len(value) >= 2 {
			var items []string

			for _, item := range strings.Split(value[1:len(value)-1], ",") {
				if item = stripFrontmatterQuotes(jsTrim(item)); item != "" {
					items = append(items, item)
				}
			}

			meta[key] = items
		} else {
			meta[key] = stripFrontmatterQuotes(value)
		}
	}

	return meta, body
}

// LoadScopedRules reads the rules of .eser/rules/ (.md and .txt files, in
// name order). A rule is the first line of its body. A file that cannot be
// read is skipped and the rest still load, as in the TypeScript engine.
func LoadScopedRules(root string) []ScopedRule {
	dir := filepath.Join(root, rulesDir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var rules []ScopedRule

	for _, entry := range entries {
		name := entry.Name()
		if !entry.Type().IsRegular() || (!strings.HasSuffix(name, ".md") && !strings.HasSuffix(name, ".txt")) {
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, name)) //nolint:gosec // G304: a rule file of the project
		if err != nil {
			continue
		}

		meta, body := parseRuleFrontmatter(string(data))
		firstLine, _, _ := strings.Cut(body, "\n")

		phases, _ := meta["phases"].([]string)
		appliesTo, _ := meta["applies_to"].([]string)

		rules = append(rules, ScopedRule{Text: firstLine, Phases: phases, AppliesTo: appliesTo})
	}

	return rules
}

// matchFilePattern matches a file against a rule's glob: `*.ext` by
// extension, anything else by its text without the stars.
func matchFilePattern(filePath, pattern string) bool {
	if strings.HasPrefix(pattern, "*.") {
		return strings.HasSuffix(filePath, pattern[1:])
	}

	return strings.Contains(filePath, strings.ReplaceAll(pattern, "*", ""))
}

// Tier2RulesForFile returns the file-scoped rules that match filePath in
// phase.
func Tier2RulesForFile(rules []ScopedRule, phase, filePath string) []string {
	var matched []string

	for _, rule := range rules {
		if len(rule.Phases) > 0 && !slices.Contains(rule.Phases, phase) {
			continue
		}

		if len(rule.AppliesTo) == 0 {
			continue
		}

		if slices.ContainsFunc(rule.AppliesTo, func(pattern string) bool { return matchFilePattern(filePath, pattern) }) {
			matched = append(matched, rule.Text)
		}
	}

	return matched
}

// FolderRule is one rule of a .folder-rules.md file.
type FolderRule struct {
	Folder string
	Rule   string
}

const folderRulesFile = ".folder-rules.md"

var folderRuleBullet = regexp.MustCompile(`^[-*]` + jsSpace + `+`) //nolint:gochecknoglobals // compiled once

func parseFolderRules(content string) []string {
	var rules []string

	for _, line := range strings.Split(content, "\n") {
		line = jsTrim(folderRuleBullet.ReplaceAllLiteralString(line, ""))
		if line != "" && !strings.HasPrefix(line, "#") {
			rules = append(rules, line)
		}
	}

	return rules
}

// CollectFolderRules walks up from each touched file to the project root and
// collects the .folder-rules.md rules, deepest first, each folder and rule
// pair once. The files are read through os.OpenRoot, so a path that climbs
// out of the project reads nothing outside it.
func CollectFolderRules(root string, touchedFiles []string) []FolderRule {
	projectRoot, err := os.OpenRoot(root)
	if err != nil {
		return nil
	}

	defer func() { _ = projectRoot.Close() }()

	seen := map[string]bool{}

	var all []FolderRule

	for _, file := range touchedFiles {
		relative := file
		if strings.HasPrefix(file, root) {
			relative = file[min(len(root)+1, len(file)):]
		}

		parts := strings.Split(relative, "/")
		parts = parts[:len(parts)-1]

		for i := len(parts); i >= 0; i-- {
			label := "."
			name := folderRulesFile

			if i > 0 {
				label = strings.Join(parts[:i], "/")
				name = strings.TrimLeft(path.Clean(label+"/"+folderRulesFile), "/")
			}

			for _, rule := range readFolderRules(projectRoot, name) {
				key := label + "::" + rule
				if !seen[key] {
					seen[key] = true

					all = append(all, FolderRule{Folder: label, Rule: rule})
				}
			}
		}
	}

	return all
}

// readFolderRules reads one rules file; a directory without one, or a
// file that cannot be read, has no rules.
func readFolderRules(projectRoot *os.Root, name string) []string {
	data, err := projectRoot.ReadFile(name)
	if err != nil {
		return nil
	}

	return parseFolderRules(string(data))
}

// FileRules collects the rules that apply to one file during execution:
// scoped rules, folder rules and the active concerns' reminders for its
// file type.
func FileRules(root string, state *JSObject, filePath string, warn StateWarner) []string {
	notes := Tier2RulesForFile(LoadScopedRules(root), PhaseExecuting, filePath)

	for _, rule := range CollectFolderRules(root, []string{filePath}) {
		notes = append(notes, "("+rule.Folder+"/) "+rule.Rule)
	}

	manifest := ReadHookManifest(root)
	active := ActiveHookConcerns(ListHookConcerns(root, warn), &manifest)

	return append(notes, GetTier2RemindersForFile(active, filePath, classificationOf(state))...)
}
