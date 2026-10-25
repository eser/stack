// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// The sync engine (sync/engine.ts and sync/adapter.ts): it writes the files
// each coding tool reads (rule files, hook configs, agent definitions, spec
// copies and MCP configs) from the rules in .eser/rules/ and the noskills
// section of the manifest. Every adapter writes the bytes its TypeScript
// counterpart writes; the golden sync test compares them file by file.

// SyncOptions are the manifest settings the adapters read.
type SyncOptions struct {
	// AllowGit is set only by `allowGit: true`, as in the hooks and the git
	// wrapper's check; it drops the read-only git rules.
	AllowGit bool
}

// SyncContext is what every adapter step receives.
type SyncContext struct {
	Root          string
	Rules         []string
	CommandPrefix string
	Options       SyncOptions
}

// path is a project file as the adapters name it, with "/" separators.
func (c *SyncContext) path(rel string) string {
	return filepath.Join(c.Root, filepath.FromSlash(rel))
}

// toolAdapter is one coding tool's sync steps, in the order syncTool runs
// them. A nil step is a capability the tool lacks.
type toolAdapter struct {
	id         string
	syncRules  func(c *SyncContext) error
	syncHooks  func(c *SyncContext) error
	syncAgents func(c *SyncContext) error
	syncSpec   func(c *SyncContext, specName, specPath string) error
	syncMcp    func(c *SyncContext) error
}

// toolAdapters are the adapters in the engine's registry order.
func toolAdapters() []toolAdapter {
	return []toolAdapter{
		{id: CodingToolClaudeCode, syncRules: syncClaudeMd, syncHooks: syncClaudeHooks, syncAgents: syncClaudeAgents},
		{id: CodingToolCursor, syncRules: ruleFileSync(cursorRuleFile)},
		{id: CodingToolKiro, syncRules: syncKiroSteering, syncHooks: syncKiroHooks, syncAgents: syncKiroAgents,
			syncSpec: syncKiroSpec, syncMcp: syncKiroMcp},
		{id: CodingToolCopilot, syncRules: ruleFileSync(copilotRuleFile)},
		{id: CodingToolWindsurf, syncRules: ruleFileSync(windsurfRuleFile)},
		{id: CodingToolOpencode, syncRules: syncAgentsMd, syncHooks: syncOpencodePlugin, syncAgents: syncOpencodeAgents,
			syncSpec: syncOpencodeSkill, syncMcp: syncOpencodeMcp},
		{id: CodingToolCodex, syncRules: syncAgentsMd, syncHooks: syncCodexHooks, syncAgents: syncCodexAgents,
			syncMcp: syncCodexMcp},
		{id: CodingToolCopilotCLI, syncRules: syncCopilotCLIRules, syncHooks: syncCopilotCLIHooks,
			syncAgents: syncCopilotCLIAgents, syncMcp: syncCopilotCLIMcp},
	}
}

func findToolAdapter(id string) (toolAdapter, bool) {
	for _, adapter := range toolAdapters() {
		if adapter.id == id {
			return adapter, true
		}
	}

	return toolAdapter{}, false //nolint:exhaustruct // the zero value is "no adapter"
}

// LoadRules is loadRules: the text of every rule in .eser/rules/, without
// its scope.
func LoadRules(root string) []string {
	return ruleTexts(LoadScopedRules(root))
}

// SyncConfig is the part of the manifest's noskills section the engine
// reads.
type SyncConfig struct {
	// CommandPrefix is `command`, or DefaultCommandPrefix when the manifest
	// sets none.
	CommandPrefix string
	AllowGit      bool
}

// SyncConfigOf reads the engine's settings from the manifest's noskills
// section; a nil section gives the defaults.
func SyncConfigOf(section *JSObject) SyncConfig {
	config := SyncConfig{CommandPrefix: DefaultCommandPrefix, AllowGit: false}
	if section == nil {
		return config
	}

	// `config?.command ?? default`: only a missing or null command falls back.
	if value, ok := section.get("command"); ok && value != nil {
		config.CommandPrefix = jsString(value)
	}

	config.AllowGit = section.isTrue("allowGit")

	return config
}

// SyncAll is syncAll: it runs every step of each tool's adapter, one tool at
// a time (several adapters rewrite AGENTS.md and files under .github/), and
// returns the tools it synced, then "hooks" when Claude Code is one of them.
// Tools without an adapter are skipped.
func SyncAll(root string, tools []string, config SyncConfig) ([]string, error) {
	c := &SyncContext{
		Root:          root,
		Rules:         LoadRules(root),
		CommandPrefix: config.CommandPrefix,
		Options:       SyncOptions{AllowGit: config.AllowGit},
	}

	var synced []string

	for _, tool := range tools {
		adapter, ok := findToolAdapter(tool)
		if !ok {
			continue
		}

		if err := syncTool(c, &adapter); err != nil {
			return synced, fmt.Errorf("sync %s: %w", tool, err)
		}

		synced = append(synced, tool)
	}

	if slices.Contains(tools, CodingToolClaudeCode) {
		synced = append(synced, "hooks")
	}

	return synced, nil
}

func syncTool(c *SyncContext, adapter *toolAdapter) error {
	steps := []func(*SyncContext) error{adapter.syncRules, adapter.syncHooks, adapter.syncAgents}
	for _, step := range steps {
		if step == nil {
			continue
		}

		if err := step(c); err != nil {
			return err
		}
	}

	if adapter.syncSpec != nil {
		if err := syncSpecMirrors(c, adapter.syncSpec); err != nil {
			return err
		}
	}

	if adapter.syncMcp != nil {
		return adapter.syncMcp(c)
	}

	return nil
}

// syncSpecMirrors hands each spec folder's spec.md to the adapter. A
// project without .eser/specs/ has nothing to mirror.
func syncSpecMirrors(c *SyncContext, sync func(c *SyncContext, specName, specPath string) error) error {
	dir := c.path(specsDir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil //nolint:nilerr // no specs directory yet: nothing to mirror
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		if err := sync(c, entry.Name(), filepath.Join(dir, entry.Name(), "spec.md")); err != nil {
			return err
		}
	}

	return nil
}

// readOptionalFile reads a file, giving ok false when it cannot be read, as
// the adapters' `try { readTextFile } catch {}` does.
func readOptionalFile(path string) (string, bool) {
	data, err := os.ReadFile(path) //nolint:gosec // G304: a file of the project the sync writes
	if err != nil {
		return "", false
	}

	return string(data), true
}

// writeSyncFile writes a tool file, creating its folder.
func writeSyncFile(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("create %s: %w", filepath.Dir(path), err)
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil { //nolint:gosec // G306: tool config files are meant to be readable
		return fmt.Errorf("write %s: %w", path, err)
	}

	return nil
}

// removeIfExists removes a file the sync no longer writes.
func removeIfExists(path string) error {
	err := os.Remove(path)
	if err == nil || errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	return fmt.Errorf("remove %s: %w", path, err)
}

// readJSONFile is `JSON.parse(readTextFile(path))` with the failure folded
// into ok, as the adapters that start from an empty config do.
func readJSONFile(path string) (any, bool) {
	text, ok := readOptionalFile(path)
	if !ok {
		return nil, false
	}

	value, err := parseJSON(text)
	if err != nil {
		return nil, false
	}

	return value, true
}

// jsSpread is `{ ...value }` for a JSON value: an object's own keys, an
// array's or a string's indexes, and nothing for the other values.
func jsSpread(value any) *JSObject {
	out := NewJSObject()

	switch v := value.(type) {
	case *JSObject:
		return v.clone()
	case []any:
		for i, item := range v {
			out.set(itoaJS(i), item)
		}
	case string:
		for i, unit := range utf16Units(v) {
			out.set(itoaJS(i), string(rune(unit)))
		}
	}

	return out
}

func itoaJS(n int) string {
	return jsNumberString(float64(n))
}

// sectionMarkers are the comments around noskills' part of CLAUDE.md and
// AGENTS.md.
const (
	noskillsSectionStart = "<!-- noskills:start -->"
	noskillsSectionEnd   = "<!-- noskills:end -->"
)

// writeMarkedSection replaces the marked section of a file the user also
// edits, or appends it after the file's text, or writes the section alone.
func writeMarkedSection(path, section string) error {
	content, ok := readOptionalFile(path)

	switch {
	case !ok:
		content = section + "\n"
	default:
		start := strings.Index(content, noskillsSectionStart)
		end := strings.Index(content, noskillsSectionEnd)

		if start != -1 && end != -1 {
			content = jsSlice(content, 0, start) + section + jsSliceFrom(content, end+len(noskillsSectionEnd))
		} else {
			content = jsTrimEnd(content) + "\n\n" + section + "\n"
		}
	}

	return writeSyncFile(path, content)
}

// jsSlice is String.prototype.slice for byte offsets that came from
// strings.Index: a start after the end gives "".
func jsSlice(s string, start, end int) string {
	if start >= end {
		return ""
	}

	return s[start:end]
}

func jsSliceFrom(s string, start int) string {
	if start >= len(s) {
		return ""
	}

	return s[start:]
}

// jsTrimEnd and jsTrimStart are String.prototype.trimEnd and trimStart.
func jsTrimEnd(s string) string {
	return strings.TrimRightFunc(s, isJSSpace)
}

func jsTrimStart(s string) string {
	return strings.TrimLeftFunc(s, isJSSpace)
}

// bulletLines is `- <rule>` for each rule.
func bulletLines(rules []string) []string {
	lines := make([]string, len(rules))
	for i, rule := range rules {
		lines[i] = "- " + rule
	}

	return lines
}

// splitCommandPrefix is `commandPrefix.split(/\s+/)`.
func splitCommandPrefix(prefix string) []string {
	return jsSplitWhitespace(prefix)
}
