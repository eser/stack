// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The sync adapter comparison (TASK-259): every adapter, alone and all
// together, syncs the same fixture projects in TypeScript (syncAll in
// sync/engine.ts) and in Go (noskillsfx.SyncAll), and the two file trees
// must be identical byte for byte. The TypeScript trees are recorded in
// testdata/golden/sync_adapters.json (NOSKILLS_GOLDEN_RECORD=1 writes it),
// so the comparison runs without node; with node on PATH the test also
// runs the TypeScript sync live.

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
			config: map[string]any{"command": "deno task cli noskills", "allowGit": true},
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

// tsSyncScript runs syncAll for each job on stdin and prints what it synced.
const tsSyncScript = `
import { pathToFileURL } from "node:url";
const engine = await import(pathToFileURL(process.argv[2]).href);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const out = [];
for (const job of JSON.parse(input)) {
  out.push(await engine.syncAll(job.dir, job.tools, job.config));
}
process.stdout.write(JSON.stringify(out));
`

type tsSyncJob struct {
	Dir    string         `json:"dir"`
	Tools  []string       `json:"tools"`
	Config map[string]any `json:"config"`
}

// runTSSyncs runs the TypeScript sync for every job in one node process.
func runTSSyncs(t *testing.T, node string, jobs []tsSyncJob) [][]string {
	t.Helper()

	engine, err := filepath.Abs(filepath.Join(repoRoot, "pkg/@eserstack/noskills/sync/engine.ts"))
	if err != nil {
		t.Fatal(err)
	}

	script := filepath.Join(t.TempDir(), "sync.mjs")
	if err := os.WriteFile(script, []byte(tsSyncScript), 0o600); err != nil {
		t.Fatal(err)
	}

	input, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, node, "--disable-warning=ExperimentalWarning", script, engine) //nolint:gosec // G204: the harness's own command line
	cmd.Stdin = bytes.NewReader(input)

	var stdout, stderr bytes.Buffer

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		t.Fatalf("typescript sync: %v: %s", err, stderr.String())
	}

	var synced [][]string
	if err := json.Unmarshal(stdout.Bytes(), &synced); err != nil {
		t.Fatalf("typescript sync output: %v: %s", err, stdout.String())
	}

	return synced
}

// recordTSSyncs runs every case in TypeScript and returns the outcomes.
func recordTSSyncs(t *testing.T, node string) map[string]syncOutcome {
	t.Helper()

	cases := syncCases()
	jobs := make([]tsSyncJob, len(cases))
	dirs := make([]string, len(cases))

	for i, c := range cases {
		dirs[i] = t.TempDir()
		writeFixture(t, dirs[i], c.fixture.files)
		jobs[i] = tsSyncJob{Dir: dirs[i], Tools: c.tools, Config: c.fixture.config}
	}

	synced := runTSSyncs(t, node, jobs)
	out := map[string]syncOutcome{}

	for i, c := range cases {
		out[c.name] = syncOutcome{Synced: synced[i], Files: readTree(t, dirs[i])}
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
			t.Errorf("%s: Go wrote %s, which TypeScript does not", name, path)
		case !inGot:
			t.Errorf("%s: Go did not write %s", name, path)
		case w != g:
			t.Errorf("%s: %s differs:\n--- typescript\n%s\n--- go\n%s", name, path, w, g)
		}
	}
}

// TestSyncAdaptersMatchTypeScript compares each adapter's Go output with
// the recorded TypeScript output, and records it with
// NOSKILLS_GOLDEN_RECORD=1.
func TestSyncAdaptersMatchTypeScript(t *testing.T) {
	t.Parallel()

	if os.Getenv("NOSKILLS_GOLDEN_RECORD") == "1" {
		node, err := exec.LookPath("node")
		if err != nil {
			t.Fatal("recording needs node")
		}

		data, err := json.MarshalIndent(recordTSSyncs(t, node), "", "  ")
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

// TestSyncAdaptersLive runs the TypeScript sync next to the Go sync when
// node is on PATH, so a change to an adapter on either side shows up before
// the recording is renewed.
func TestSyncAdaptersLive(t *testing.T) {
	t.Parallel()

	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("the live comparison runs the TypeScript sync, which needs node")
	}

	ts := recordTSSyncs(t, node)

	for _, c := range syncCases() {
		dir := t.TempDir()
		writeFixture(t, dir, c.fixture.files)
		compareSyncOutcome(t, c.name, ts[c.name], runGoSync(t, dir, c.tools, c.fixture.config))
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
