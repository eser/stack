// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"encoding/json"
	"os"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The sync adapter comparison (TASK-259): every adapter, alone and all
// together, syncs the same fixture projects with noskillsfx.SyncAll, and the
// file trees must match testdata/golden/sync_adapters.json byte for byte. The
// TypeScript sync (syncAll in sync/engine.ts) wrote that recording, and Go
// matched it before the TypeScript twin was deleted (TASK-262);
// NOSKILLS_GOLDEN_RECORD=1 now records the Go sync, for a new case or a change
// on purpose.

type syncFixture struct {
	name   string
	files  map[string]string
	config map[string]any
}

const userSpec = `# Spec: Login page

## Summary

Users sign in with an email and a password.

## Discovery Answers

### Status quo
They share one account today.

### Ambition
A login page with sessions.

## Concerns

- open-source

## Contributor Guide

Run the tests first.

## Public API

POST /login

## Out of Scope

Social login.

## Tasks

- [ ] task-1: Add the login form
- [ ] task-2: Add the session endpoint

## Verification

- Unit tests pass
* The form submits

## Tasks (duplicate)

ignored
`

func syncFixtures() []syncFixture {
	return []syncFixture{
		{name: "empty", files: map[string]string{}, config: map[string]any{}},
		{
			name: "user_content",
			files: map[string]string{
				"CLAUDE.md":                        "# My project\n\nKeep this.\n\n<!-- noskills:start -->\nold section\n<!-- noskills:end -->\n\nAnd this.\n",
				"AGENTS.md":                        "# Agents\n\nUser text.   \n\n",
				".claude/settings.json":            `{"permissions":{"allow":["Bash(ls)"]},"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"./my-check.sh"},{"type":"command","command":"npx eser@latest noskills invoke-hook pre-tool-use","timeout":30}]},{"matcher":"Write","hooks":[{"type":"command","command":"old invoke-hook post-bash"}]}],"Notification":[{"hooks":[{"type":"command","command":"say hi"}]}],"Odd":"not a list"},"model":"opus"}`,
				".codex/hooks.json":                `{"hooks":[{"event":"Stop","command":"echo done"},{"event":"Stop","command":"noskills invoke-hook stop","_noskills":true},{"event":1}],"other":true}`,
				".codex/config.toml":               "model = \"o3\"\n\n[mcp_servers.noskills]\ncommand = \"old\"\n\n[mcp_servers.noskills.env]\nA = \"1\"\n\n[mcp_servers.other]\ncommand = \"other\"\n\n\n",
				".copilot/mcp.json":                `{"mcpServers":{"other":{"type":"local","command":"x","args":[]},"noskills":{"old":true}},"extra":1}`,
				".kiro/settings/mcp.json":          `{"mcpServers":{"other":{"command":"y"}}}`,
				".kiro/settings/hooks.json":        `{"hooks":[{"name":"mine"},{"name":"noskills-old","_noskills":true}],"keep":1}`,
				".kiro/steering/conventions.md":    "legacy\n",
				".kiro/steering/noskills-rules.md": "stale\n",
				"opencode.json":                    `{"$schema":"https://opencode.ai/config.json","mcp":{"other":{"type":"local","command":["z"],"enabled":false}},"theme":"dark"}`,
				".github/hooks/noskills.json":      `{"version":1,"hooks":{"preToolUse":[{"type":"command","bash":"./guard.sh"},{"type":"command","command":"noskills invoke-hook pre-tool-use"}],"named":{"type":"command"},"agentStop":[{"type":"command","powershell":"npx eser@latest noskills invoke-hook stop"}]},"note":"keep"}`,
				".github/copilot-instructions.md":  "old instructions\n",
			},
			config: map[string]any{},
		},
		{
			name: "rules_and_specs",
			files: map[string]string{
				".eser/rules/a-first.md":     "Always write tests first.\nSecond line is ignored.\n",
				".eser/rules/b-scoped.md":    "---\nphases: [EXECUTING, DISCOVERY]\napplies_to: [\"*.ts\", 'src/']\n---\nUse strict types.\n",
				".eser/rules/c-note.txt":     "  Plain text rule  \n",
				".eser/rules/d-ignored.json": "{}\n",
				".eser/rules/e-empty-fm.md":  "---\nphases: []\n---\n",
				".eser/specs/login/spec.md":  userSpec,
				".eser/specs/blank/spec.md":  "   \n",
				".eser/specs/nofile/.keep":   "",
				".eser/specs/edge/spec.md":   "intro\n# Spec:   \n## tasks\nonly line\n## Verification\n\n## concerns",
				".eser/specs/title/spec.md":  "# Spec:\n\n  Spaced title  \n\n## Discovery answers\nplain answer\n",
			},
			config: map[string]any{"command": "pnpm cli noskills", "allowGit": true},
		},
		{
			name: "malformed",
			files: map[string]string{
				".claude/settings.json":       "not json",
				".codex/hooks.json":           "null",
				".copilot/mcp.json":           `{"mcpServers":null,"x":1}`,
				".kiro/settings/mcp.json":     `"str"`,
				".kiro/settings/hooks.json":   `{"hooks":[{"_noskills":true}]}`,
				".github/hooks/noskills.json": `[1,2]`,
				"opencode.json":               `{"mcp":"ab"}`,
				"CLAUDE.md":                   "<!-- noskills:end -->\nuser\n<!-- noskills:start -->\n",
				".codex/config.toml":          "  [mcp_servers.noskills] # old\r\ncommand = \"x\"\n[other]\n",
			},
			config: map[string]any{"command": "  noskills  --flag ", "allowGit": "true"},
		},
	}
}

// syncCases are the fixtures crossed with each tool alone and all together.
func syncCases() []struct {
	name    string
	fixture syncFixture
	tools   []string
} {
	cases := make([]struct {
		name    string
		fixture syncFixture
		tools   []string
	}, 0, len(syncFixtures())*(len(noskillsfx.CodingToolIDs())+1))

	for _, fixture := range syncFixtures() {
		for _, tool := range noskillsfx.CodingToolIDs() {
			cases = append(cases, struct {
				name    string
				fixture syncFixture
				tools   []string
			}{fixture.name + "/" + tool, fixture, []string{tool}})
		}

		cases = append(cases, struct {
			name    string
			fixture syncFixture
			tools   []string
		}{fixture.name + "/all", fixture, append(noskillsfx.CodingToolIDs(), "unknown-tool")})
	}

	return cases
}

type syncOutcome struct {
	Synced []string          `json:"synced"`
	Files  map[string]string `json:"files"`
}

func writeFixture(t *testing.T, dir string, files map[string]string) {
	t.Helper()

	for rel, content := range files {
		writeProjectFile(t, dir, rel, content)
	}
}

func readTree(t *testing.T, dir string) map[string]string {
	t.Helper()

	return snapshot(t, dir, map[string]string{})
}

func goSyncConfig(config map[string]any) noskillsfx.SyncConfig {
	section := noskillsfx.NewJSObject()

	for _, key := range []string{"command", "allowGit"} {
		if value, ok := config[key]; ok {
			section.Set(key, value)
		}
	}

	return noskillsfx.SyncConfigOf(section)
}

func runGoSync(t *testing.T, dir string, tools []string, config map[string]any) syncOutcome {
	t.Helper()

	synced, err := noskillsfx.SyncAll(dir, tools, goSyncConfig(config))
	if err != nil {
		t.Fatalf("go sync: %v", err)
	}

	if synced == nil {
		synced = []string{}
	}

	return syncOutcome{Synced: synced, Files: readTree(t, dir)}
}

// recordGoSyncs runs every case in Go and returns the outcomes.
func recordGoSyncs(t *testing.T) map[string]syncOutcome {
	t.Helper()

	out := map[string]syncOutcome{}

	for _, c := range syncCases() {
		dir := t.TempDir()
		writeFixture(t, dir, c.fixture.files)
		out[c.name] = runGoSync(t, dir, c.tools, c.fixture.config)
	}

	return out
}

const syncAdaptersRecording = "sync_adapters"

func compareSyncOutcome(t *testing.T, name string, want, got syncOutcome) {
	t.Helper()

	if !slices.Equal(want.Synced, got.Synced) {
		t.Errorf("%s: synced %v, want %v", name, got.Synced, want.Synced)
	}

	paths := map[string]bool{}
	for path := range want.Files {
		paths[path] = true
	}

	for path := range got.Files {
		paths[path] = true
	}

	sorted := make([]string, 0, len(paths))
	for path := range paths {
		sorted = append(sorted, path)
	}

	sort.Strings(sorted)

	for _, path := range sorted {
		w, inWant := want.Files[path]
		g, inGot := got.Files[path]

		switch {
		case !inWant:
			t.Errorf("%s: Go wrote %s, which the recording does not hold", name, path)
		case !inGot:
			t.Errorf("%s: Go did not write %s", name, path)
		case w != g:
			t.Errorf("%s: %s differs:\n--- recorded\n%s\n--- go\n%s", name, path, w, g)
		}
	}
}

// TestSyncAdaptersMatchTheRecording compares each adapter's output with the
// recording, and records it with NOSKILLS_GOLDEN_RECORD=1.
func TestSyncAdaptersMatchTheRecording(t *testing.T) {
	t.Parallel()

	if os.Getenv("NOSKILLS_GOLDEN_RECORD") == "1" {
		data, err := json.MarshalIndent(recordGoSyncs(t), "", "  ")
		if err != nil {
			t.Fatal(err)
		}

		if err := writeRecording(syncAdaptersRecording, append(data, '\n')); err != nil {
			t.Fatal(err)
		}
	}

	data, err := readRecording(syncAdaptersRecording)
	if err != nil {
		t.Fatalf("no recording for the sync adapters: %v (record with NOSKILLS_GOLDEN_RECORD=1)", err)
	}

	var want map[string]syncOutcome
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}

	cases := syncCases()
	if len(want) != len(cases) {
		t.Errorf("%d recorded sync cases, %d defined; record again", len(want), len(cases))
	}

	for _, c := range cases {
		recorded, ok := want[c.name]
		if !ok {
			t.Errorf("%s: no recording; record again", c.name)

			continue
		}

		dir := t.TempDir()
		writeFixture(t, dir, c.fixture.files)
		compareSyncOutcome(t, c.name, recorded, runGoSync(t, dir, c.tools, c.fixture.config))
	}
}

// TestSyncCasesCoverEveryAdapter keeps the fixture list honest: every
// adapter is synced alone in every fixture.
func TestSyncCasesCoverEveryAdapter(t *testing.T) {
	t.Parallel()

	seen := map[string]int{}

	for _, c := range syncCases() {
		if len(c.tools) == 1 {
			seen[c.tools[0]]++
		}
	}

	for _, tool := range noskillsfx.CodingToolIDs() {
		if seen[tool] != len(syncFixtures()) {
			t.Errorf("%s is synced alone in %d fixtures, want %d", tool, seen[tool], len(syncFixtures()))
		}
	}

	if !strings.Contains(userSpec, "## Verification") {
		t.Error("the spec fixture lost its verification section")
	}
}
