// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"time"
)

// The parts of `noskills init` (commands/init.ts) that read the project and
// write .eser/: the project and tool detection (detect/codebase.ts,
// detect/tools.ts), the provider list, the concern files, the manifest and
// the initial state. The tool files (CLAUDE.md, hooks, agents) are the sync
// adapters' work (sync_engine.go).

const eserGitignoreContent = "# eser toolchain runtime state — not tracked by git\n.state/\n"

// ScaffoldEserDir moves a legacy layout into place (MigrateLegacyLayout),
// then creates the .eser/ tree under root and, when it is missing,
// .eser/.gitignore. Existing directories and an existing .gitignore are
// left as they are.
func ScaffoldEserDir(root string) error {
	return ScaffoldEserDirNotifying(root, nil)
}

// ScaffoldEserDirNotifying is ScaffoldEserDir that tells notice when it
// moved a legacy layout (nil drops the notice).
func ScaffoldEserDirNotifying(root string, notice func(text string)) error {
	if _, err := MigrateLegacyLayout(root, notice); err != nil {
		return err
	}

	for _, dir := range []string{eserDir, stateDir, progressesDir, specStatesDir, sessionsDir, eventsDir,
		concernsDir, rulesDir, specsDir, workflowsDir} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o750); err != nil {
			return fmt.Errorf("scaffold %s: %w", dir, err)
		}
	}

	gitignore := filepath.Join(root, eserGitignore)
	if _, err := os.Stat(gitignore); err == nil {
		return nil
	}

	if err := writeFileAtomic(gitignore, []byte(eserGitignoreContent), stateFilePerm); err != nil {
		return fmt.Errorf("write %s: %w", gitignore, err)
	}

	return nil
}

// DetectProject is detectProject: languages, frameworks, CI and the test
// runner, from the files at the root.
func DetectProject(root string) *JSObject {
	exists := func(rel string) bool { return pathExists(filepath.Join(root, filepath.FromSlash(rel))) }

	languages := []any{}
	if exists("package.json") || exists("deno.json") {
		languages = append(languages, "typescript")
	}

	if exists("go.mod") {
		languages = append(languages, "go")
	}

	if exists("Cargo.toml") {
		languages = append(languages, "rust")
	}

	if exists("pyproject.toml") || exists("setup.py") {
		languages = append(languages, "python")
	}

	packageField := func(field string) *JSObject {
		data, err := os.ReadFile(filepath.Join(root, "package.json")) //nolint:gosec // G304: the project's package.json
		if err != nil {
			return nil
		}

		parsed, err := parseJSON(string(data))
		if err != nil {
			return nil
		}

		o, _ := parsed.(*JSObject)

		return o.obj(field)
	}

	frameworks := []any{}
	if deps := packageField("dependencies"); deps != nil {
		for _, f := range []struct{ dep, name string }{
			{"react", "react"}, {"vue", "vue"}, {"svelte", "svelte"}, {"next", "nextjs"}, {"express", "express"}, {"hono", "hono"},
		} {
			if deps.hasKey(f.dep) {
				frameworks = append(frameworks, f.name)
			}
		}
	}

	ci := []any{}
	for _, c := range []struct{ file, name string }{
		{".github/workflows", "github-actions"}, {".gitlab-ci.yml", "gitlab-ci"}, {"Jenkinsfile", "jenkins"}, {".circleci", "circleci"},
	} {
		if exists(c.file) {
			ci = append(ci, c.name)
		}
	}

	var testRunner any

	if exists("deno.json") {
		testRunner = "deno"
	} else if deps := packageField("devDependencies"); deps != nil {
		for _, runner := range []string{"vitest", "jest", "playwright"} {
			if deps.hasKey(runner) {
				testRunner = runner

				break
			}
		}
	}

	return JSObjectOf("languages", languages, "frameworks", frameworks, "ci", ci, "testRunner", testRunner)
}

// DetectCodingTools is detectCodingTools: the tools whose config files the
// project has, in the detector's order.
func DetectCodingTools(root string) []string {
	signals := []struct {
		id    string
		paths []string
	}{
		{CodingToolClaudeCode, []string{"CLAUDE.md", ".claude"}},
		{CodingToolCursor, []string{".cursorrules", ".cursor"}},
		{CodingToolKiro, []string{".kiro"}},
		{CodingToolCopilot, []string{".github/copilot-instructions.md"}},
		{CodingToolWindsurf, []string{".windsurfrules"}},
		{CodingToolCodex, []string{".codex", ".codex/config.toml"}},
		{CodingToolCopilotCLI, []string{".copilot", ".github/hooks"}},
	}

	var tools []string

	for _, signal := range signals {
		for _, p := range signal.paths {
			if pathExists(filepath.Join(root, filepath.FromSlash(p))) {
				tools = append(tools, signal.id)

				break
			}
		}
	}

	return tools
}

// CodingToolIDs are the tools noskills has an adapter for, in its order.
func CodingToolIDs() []string {
	return []string{CodingToolClaudeCode, CodingToolCursor, CodingToolKiro, CodingToolCopilot, CodingToolWindsurf,
		CodingToolOpencode, CodingToolCodex, CodingToolCopilotCLI}
}

// ToolsWithHooks are the tools among tools whose adapter writes hooks.
func ToolsWithHooks(tools []string) []string {
	var out []string

	for _, tool := range tools {
		switch tool {
		case CodingToolClaudeCode, CodingToolCopilotCLI, CodingToolCodex, CodingToolKiro, CodingToolOpencode:
			out = append(out, tool)
		}
	}

	return out
}

// ProviderProbe answers the provider checks of detectAllProviders.
type ProviderProbe struct {
	// HasBinary reports whether a program is on PATH.
	HasBinary func(name string) bool
	// OllamaReachable reports whether localhost:11434 answers.
	OllamaReachable func() bool
	// LookupEnv reads an environment variable.
	LookupEnv func(key string) (string, bool)
}

// DetectProviders is getAvailableProviderNames: the AI providers this
// machine can run, in the detector's order.
func DetectProviders(probe ProviderProbe) []string {
	has := func(key string) bool { _, ok := probe.LookupEnv(key); return ok }

	checks := []struct {
		name      string
		available bool
	}{
		{"claude-code", probe.HasBinary("claude")},
		{"ollama", probe.OllamaReachable()},
		{"opencode", probe.HasBinary("opencode")},
		{"kiro", probe.HasBinary("kiro")},
		{"anthropic", has("ANTHROPIC_API_KEY") || has("ANTHROPIC_AUTH_TOKEN")},
		{"openai", has("OPENAI_API_KEY")},
		{"gemini", has("GEMINI_API_KEY") || has("GOOGLE_API_KEY")},
		{"vertexai", has("GOOGLE_CLOUD_PROJECT")},
	}

	var names []string

	for _, check := range checks {
		if check.available {
			names = append(names, check.name)
		}
	}

	return names
}

// DefaultConcernObject is a built-in concern as its JSON file holds it.
type DefaultConcernObject struct {
	Definition ConcernDefinition
	Raw        *JSObject
}

// DefaultConcernObjects returns the built-in concerns in their numbered
// order, as definitions and as the objects init writes.
func DefaultConcernObjects() ([]DefaultConcernObject, error) {
	entries, err := defaultConcernFiles.ReadDir("defaults/concerns")
	if err != nil {
		return nil, fmt.Errorf("list the built-in concerns: %w", err)
	}

	out := make([]DefaultConcernObject, 0, len(entries))

	for _, entry := range entries {
		data, err := defaultConcernFiles.ReadFile(path.Join("defaults/concerns", entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read the built-in concern %s: %w", entry.Name(), err)
		}

		var definition ConcernDefinition
		if err := json.Unmarshal(data, &definition); err != nil {
			return nil, fmt.Errorf("parse the built-in concern %s: %w", entry.Name(), err)
		}

		parsed, err := parseJSON(string(data))
		if err != nil {
			return nil, fmt.Errorf("parse the built-in concern %s: %w", entry.Name(), err)
		}

		raw, _ := parsed.(*JSObject)
		out = append(out, DefaultConcernObject{Definition: definition, Raw: raw})
	}

	return out, nil
}

// InitPlan is what init writes.
type InitPlan struct {
	Concerns  []string
	Tools     []string
	Providers []string
	Project   *JSObject
	Command   string
}

// InitialManifest is createInitialManifest with the command.
func InitialManifest(plan *InitPlan) *JSObject {
	return JSObjectOf(
		"concerns", anyOf(plan.Concerns),
		"tools", anyOf(plan.Tools),
		"providers", anyOf(plan.Providers),
		"project", plan.Project,
		"maxIterationsBeforeRestart", 15.0,
		"verifyCommand", nil,
		"allowGit", false,
		"command", plan.Command,
	)
}

// WriteInit writes the selected concerns, the manifest and, for a project
// that was not initialized, the initial state.
func WriteInit(root string, plan *InitPlan, alreadyInitialized bool) error {
	defaults, err := DefaultConcernObjects()
	if err != nil {
		return err
	}

	for _, concern := range defaults {
		if !slices.Contains(plan.Concerns, concern.Definition.ID) {
			continue
		}

		if err := os.MkdirAll(filepath.Join(root, concernsDir), 0o750); err != nil {
			return fmt.Errorf("create %s: %w", concernsDir, err)
		}

		file := filepath.Join(root, concernsDir, concern.Definition.ID+".json")
		if err := writeFileAtomic(file, stateJSON(concern.Raw), stateFilePerm); err != nil {
			return fmt.Errorf("write %s: %w", file, err)
		}
	}

	if err := WriteManifestSection(root, InitialManifest(plan)); err != nil {
		return err
	}

	if alreadyInitialized {
		return nil
	}

	return WriteStateObject(root, InitialState())
}

// InitIdleOutput is the IDLE instruction `init --agent` prints.
func InitIdleOutput(root string, plan *InitPlan, now func() time.Time) (*JSObject, error) {
	defaults, err := DefaultConcernObjects()
	if err != nil {
		return nil, err
	}

	var active []ConcernDefinition

	for _, concern := range defaults {
		if slices.Contains(plan.Concerns, concern.Definition.ID) {
			active = append(active, concern.Definition)
		}
	}

	manifest, ok := readManifestSection(root)
	if !ok {
		return nil, errors.New("the manifest init wrote cannot be read") //nolint:err113 // a state no caller handles
	}

	return CompileNext(&NextInput{
		State:          ReadHookState(root, nil),
		ActiveConcerns: active,
		Rules:          ruleTexts(LoadScopedRules(root)),
		Manifest:       manifest,
		Hints:          ResolveInteractionHints(plan.Tools),
		CommandPrefix:  CommandPrefixOf(manifest),
		Now:            now(),
	}), nil
}
