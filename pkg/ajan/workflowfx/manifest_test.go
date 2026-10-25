// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx_test

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

const repoRoot = "../../.."

func TestParseManifest_RepoManifest(t *testing.T) {
	t.Parallel()

	config, err := workflowfx.LoadManifest(repoRoot)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(config.Stack, ",") != "javascript,golang" {
		t.Errorf("stack: %v", config.Stack)
	}

	ids := make([]string, 0, len(config.Workflows))
	for _, wf := range config.Workflows {
		ids = append(ids, wf.ID)
	}

	if strings.Join(ids, ",") != "default,preflight,commit-validation" {
		t.Fatalf("workflow ids: %v", ids)
	}

	def := config.Workflows[0]
	if strings.Join(def.On, ",") != "precommit,prepush" || len(def.Steps) < 30 {
		t.Errorf("default workflow: on %v, %d steps", def.On, len(def.Steps))
	}

	var build *workflowfx.StepConfig

	for i := range def.Steps {
		if def.Steps[i].Name == "shell" && def.Steps[i].Options["name"] == "build-native-lib" {
			build = &def.Steps[i]
		}
	}

	if build == nil {
		t.Fatal("the build-native-lib shell step is missing")
	}

	if build.Timeout != 300*time.Second {
		t.Errorf("timeout: %v", build.Timeout)
	}

	if _, leaked := build.Options["timeout"]; leaked {
		t.Error("the timeout directive must not reach the tool's options")
	}

	if config.Scripts["ok"].Command != "eser workflows run -e precommit" {
		t.Errorf("scripts.ok: %+v", config.Scripts["ok"])
	}

	if config.Scripts["test"].Description != "Run tests with coverage" {
		t.Errorf("scripts.test: %+v", config.Scripts["test"])
	}
}

func TestParseManifest_RecipeManifests(t *testing.T) {
	t.Parallel()

	paths, err := filepath.Glob(filepath.Join(repoRoot, ".eser/recipes/*/manifest.y*ml"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no recipe manifests found: %v", err)
	}

	for _, path := range paths {
		content, err := os.ReadFile(path) //nolint:gosec // G304: a path from the glob above
		if err != nil {
			t.Fatal(err)
		}

		if _, err := workflowfx.ParseManifest(path, content); err != nil {
			t.Errorf("%s: %v", path, err)
		}
	}
}

func TestParseManifest_StepKinds(t *testing.T) {
	t.Parallel()

	manifest := `
workflows:
  - id: base
    on: [precommit]
    steps:
      - plain-step
  - id: kinds
    on: [precommit, prepush]
    includes: [base]
    steps:
      - bare-name
      - empty-options:
      - with-options:
          exclude: ["docs/"]
          maxKb: 1024
      - shell:
          name: build
          command: make
          timeout: 1.5
          continueOnError: true
      - gated:
          if: event == "prepush"
          bypass: true
      - looped:
          loop:
            over: vars.packages
            as: package
            asIndex: index
      - checked:
          inputSchema:
            type: object
            required: [path]
          path: a.txt
`

	config, err := workflowfx.ParseManifest("kinds.yml", []byte(manifest))
	if err != nil {
		t.Fatal(err)
	}

	def := config.Workflows[1]
	if strings.Join(def.Includes, ",") != "base" {
		t.Errorf("includes: %v", def.Includes)
	}

	steps := map[string]workflowfx.StepConfig{}
	for _, step := range def.Steps {
		steps[step.Name] = step
	}

	if s := steps["bare-name"]; len(s.Options) != 0 || s.Timeout != 0 {
		t.Errorf("bare-name: %+v", s)
	}

	if s := steps["empty-options"]; s.Options == nil || len(s.Options) != 0 {
		t.Errorf("empty-options: %+v", s)
	}

	if s := steps["with-options"]; s.Options["maxKb"] != 1024 || len(s.Options["exclude"].([]any)) != 1 { //nolint:forcetypeassert
		t.Errorf("with-options: %+v", s)
	}

	if s := steps["shell"]; s.Timeout != 1500*time.Millisecond || !s.ContinueOnError || s.Options["command"] != "make" || len(s.Options) != 2 {
		t.Errorf("shell: %+v", s)
	}

	if s := steps["gated"]; s.If != `event == "prepush"` || !s.Bypass || len(s.Options) != 0 {
		t.Errorf("gated: %+v", s)
	}

	if s := steps["looped"]; s.Loop == nil || *s.Loop != (workflowfx.LoopConfig{Over: "vars.packages", As: "package", AsIndex: "index"}) {
		t.Errorf("looped: %+v", s)
	}

	if s := steps["checked"]; !strings.Contains(string(s.InputSchema), `"required":["path"]`) || s.Options["path"] != "a.txt" || len(s.Options) != 1 {
		t.Errorf("checked: %+v, schema %s", s, s.InputSchema)
	}
}

func TestParseManifest_ErrorsNameTheFileAndPath(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		manifest string
		want     []string
	}{
		{
			name: "a bad timeout",
			manifest: `workflows:
  - id: ci
    on: [precommit]
    steps:
      - first
      - shell:
          command: make
          timeout: -1
`,
			want: []string{"m.yml:8: workflows[0].steps[1].shell.timeout:"},
		},
		{
			name: "a workflow without an id",
			manifest: `workflows:
  - on: [precommit]
    steps: [a]
`,
			want: []string{"m.yml:2: workflows[0]:", "id"},
		},
		{
			name: "a step with two tools",
			manifest: `workflows:
  - id: ci
    on: [precommit]
    steps:
      - one: {}
        two: {}
`,
			want: []string{"m.yml:5: workflows[0].steps[0]:"},
		},
		{
			name:     "an unknown top-level key",
			manifest: "workflowz: []\n",
			want:     []string{"m.yml:1: workflowz: unknown key 'workflowz'"},
		},
		{
			name:     "a YAML syntax error",
			manifest: "workflows:\n  - id: ci\n   on: [x]\n",
			// yaml.v3 gives the line where the broken block starts.
			want: []string{"m.yml:1: (root): YAML syntax: did not find expected '-' indicator"},
		},
		{
			name: "a script without a command",
			manifest: `scripts:
  build:
    description: Build it
`,
			want: []string{"m.yml:3: scripts.build:"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := workflowfx.ParseManifest("m.yml", []byte(tc.manifest))
			if !errors.Is(err, workflowfx.ErrInvalidManifest) {
				t.Fatalf("expected ErrInvalidManifest, got %v", err)
			}

			for _, want := range tc.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error %q should contain %q", err, want)
				}
			}
		})
	}
}

func TestLoadManifest_FilenamesAndMissing(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	if _, err := workflowfx.LoadManifest(dir); !errors.Is(err, workflowfx.ErrManifestNotFound) {
		t.Fatalf("expected ErrManifestNotFound, got %v", err)
	}

	if err := os.MkdirAll(filepath.Join(dir, ".eser"), 0o750); err != nil {
		t.Fatal(err)
	}

	yamlPath := filepath.Join(dir, ".eser/manifest.yaml")
	if err := os.WriteFile(yamlPath, []byte("stack: [golang]\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	config, err := workflowfx.LoadManifest(dir)
	if err != nil || len(config.Stack) != 1 {
		t.Fatalf("manifest.yaml: %+v, %v", config, err)
	}

	if err := os.WriteFile(filepath.Join(dir, ".eser/manifest.yml"), []byte("stack: [x]\nbad: 1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// manifest.yml wins over manifest.yaml, and its error names its path.
	if _, err := workflowfx.LoadManifest(dir); err == nil || !strings.Contains(err.Error(), filepath.Join(dir, ".eser/manifest.yml")+":2: bad: unknown key 'bad'") {
		t.Errorf("expected the manifest.yml error with its path, got %v", err)
	}
}

func TestManifestSchemaMatchesTheDocsSchema(t *testing.T) {
	t.Parallel()

	docs, err := os.ReadFile(filepath.Join(repoRoot, "docs/schema/manifest.json"))
	if err != nil {
		t.Fatal(err)
	}

	embedded, err := os.ReadFile("manifest_schema.json")
	if err != nil {
		t.Fatal(err)
	}

	if string(docs) != string(embedded) {
		t.Error("workflowfx/manifest_schema.json differs from docs/schema/manifest.json; copy the docs schema over it")
	}
}

// noskills writes its settings under a noskills: section of the same file
// (pkg/@eserstack/noskills/state/persistence.ts, noskillsfx/persistence.go),
// so the Go eser must load a manifest that has one; it used to refuse the
// key and fail before running anything in a noskills project.
func TestParseManifest_NoskillsSection(t *testing.T) {
	t.Parallel()

	manifest := `scripts:
  hello: echo hi
noskills:
  concerns: [open-source]
  tools: [claude-code]
  providers: []
  project:
    languages: [typescript]
    frameworks: []
    ci: []
    testRunner: null
  maxIterationsBeforeRestart: 15
  verifyCommand: null
  allowGit: false
  command: noskills
  user:
    name: Ada
    email: ada@example.com
  validate:
    agent: claude-code
    model: claude-sonnet-5
`
	if _, err := workflowfx.ParseManifest("manifest.yml", []byte(manifest)); err != nil {
		t.Fatalf("a manifest with a noskills section: %v", err)
	}

	if _, err := workflowfx.ParseManifest("manifest.yml", []byte("noskills:\n  concern: [x]\n")); err == nil {
		t.Error("a misspelled noskills key should be refused")
	}
}
