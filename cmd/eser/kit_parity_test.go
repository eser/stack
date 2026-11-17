// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
)

// The parity tests run kit commands through this Go CLI on one fixture, with
// GitHub served by a local fake, and compare the trees they leave byte for
// byte with testdata/kit_trees.json: the trees the TypeScript kit CLI left on
// the same fixture before it was deleted (TASK-255), where it matched the Go
// CLI with and without the native library.

const kitRegistryManifest = `{
  "$schema": "https://eser.live/registry/v1.json",
  "name": "acme",
  "description": "Fixture registry",
  "author": "Acme",
  "registryUrl": "https://raw.githubusercontent.com/acme/kit/main/.eser",
  "recipes": [
    {
      "name": "base",
      "description": "Base files",
      "language": "typescript",
      "scale": "utility",
      "variables": [
        { "name": "project_name", "description": "Project name", "default": "demo" }
      ],
      "files": [
        { "source": "recipes/base/base.txt", "target": "base.txt" },
        { "source": "recipes/base/config.json", "target": "config/base.json" }
      ]
    },
    {
      "name": "widget",
      "description": "A widget that needs base",
      "language": "typescript",
      "scale": "utility",
      "requires": ["base"],
      "variables": [
        { "name": "project_name", "description": "Project name", "default": "demo" },
        { "name": "greeting", "default": "hello" },
        { "name": "empty", "default": "" },
        { "name": "module", "description": "Module path", "default": "acme.dev/widget", "pattern": "^[a-z.]+/[a-z]+$" }
      ],
      "files": [
        { "source": "recipes/widget/widget.ts", "target": "src/widget.ts" },
        { "source": "recipes/widget/assets", "target": "assets", "kind": "folder" },
        { "source": "recipes/widget/name.txt", "target": "{{.project_name}}/name.txt" }
      ],
      "ignore": ["**/*.md"],
      "postInstall": ["touch post-installed.txt"],
      "dependencies": { "npm": ["left-pad"] }
    },
    {
      "name": "app",
      "description": "Application template",
      "language": "typescript",
      "scale": "project",
      "requires": ["base"],
      "variables": [
        { "name": "project_name", "description": "Project name", "default": "app" },
        { "name": "author", "description": "Author name", "default": "Ada" }
      ],
      "files": [
        { "source": "recipes/app/README.md", "target": "README.md" },
        { "source": "recipes/app/main.ts", "target": "src/main.ts" },
        { "source": "recipes/widget/assets", "target": "public", "kind": "folder" }
      ],
      "postInstall": ["touch .created"],
      "dependencies": { "npm": ["left-pad"] }
    }
  ]
}
`

// kitFixture writes the fixture repositories and returns the fake GitHub
// that serves them and the path of the registry manifest.
func kitFixture(t *testing.T) (*fakeGitHub, string) {
	t.Helper()

	root := t.TempDir()
	registry := filepath.Join(root, "kit")
	template := filepath.Join(root, "tpl")

	writeFiles(t, registry, map[string]string{
		".eser/recipes.json":                       kitRegistryManifest,
		".eser/recipes/base/base.txt":              "base of {{.project_name}}\n",
		".eser/recipes/base/config.json":           "{ \"name\": \"{{ .project_name }}\", \"keep\": \"{{.undeclared}}\" }\n",
		".eser/recipes/widget/widget.ts":           "export const widget = \"{{.project_name}}\"; // {{.greeting}}{{.empty}} {{.module}} {{.extra}}\n",
		".eser/recipes/widget/name.txt":            "{{.project_name}}\n",
		".eser/recipes/widget/assets/a.txt":        "asset of {{.project_name}}\n",
		".eser/recipes/widget/assets/notes.md":     "# notes for {{.project_name}}\n",
		".eser/recipes/widget/assets/nested/c.txt": "listings skip subdirectories\n",
		".eser/recipes/app/README.md":              "# {{.project_name}}\n\nBy {{.author}}.\n",
		".eser/recipes/app/main.ts":                "console.log(\"{{.project_name}}\");\n",
	})

	writeFiles(t, template, map[string]string{
		"recipe.json": `{
  "name": "tpl",
  "variables": [
    { "name": "project_name", "default": "tpl" },
    { "name": "module", "default": "acme.dev/tpl" }
  ],
  "ignore": ["docs/**", "*.log", "drafts"]
}
`,
		"README.md":                  "# {{.project_name}} ({{.module}})\n",
		"{{.project_name}}/main.txt": "main of {{.project_name}}\n",
		"src/{{ .missing }}/mod.txt": "an unresolved path placeholder loses its spaces\n",
		"lib/{{.module}}.txt":        "{{.module}}\n",
		"docs/guide.md":              "ignored\n",
		"app.log":                    "ignored\n",
		"drafts/idea.txt":            "ignored\n",
		"logo.png":                   "binary {{.project_name}} stays\n",
		"nested/recipe.json":         "only the top-level recipe.json is ignored\n",
		".git/HEAD":                  "ignored\n",
		"eser-registry.json":         "{}\n",
	})

	files := filepath.Join(root, "files")

	writeFiles(t, files, map[string]string{
		"recipe.json": `{
  "name": "files",
  "variables": [{ "name": "project_name", "default": "files" }],
  "files": [
    { "source": "templates/a.txt", "target": "out/a.txt" },
    { "source": "templates/b.txt", "target": "b.txt" }
  ],
  "postInstall": ["touch cloned.txt"]
}
`,
		"templates/a.txt": "a of {{.project_name}}\n",
		"templates/b.txt": "b of {{.project_name}}\n",
	})

	return &fakeGitHub{repos: map[string]string{"acme/kit": registry, "acme/tpl": template, "acme/files": files}}, filepath.Join(registry, ".eser", "recipes.json")
}

func runGoKit(t *testing.T, g *fakeGitHub, dir string, args []string) string {
	t.Helper()

	e := testEnv(t)
	e.cwd = dir
	e.httpClient = startFakeGitHub(t, g)

	if code := run(context.Background(), e, append([]string{"kit"}, args...)); code != 0 {
		t.Fatalf("go kit %v: exit %d\nstdout: %s\nstderr: %s", args, code, e.stdout, e.stderr)
	}

	return e.stdout.(*bytes.Buffer).String() + e.stderr.(*bytes.Buffer).String() //nolint:forcetypeassert
}

func diffTrees(t *testing.T, label string, want, got map[string]string) {
	t.Helper()

	names := map[string]bool{}
	for name := range want {
		names[name] = true
	}

	for name := range got {
		names[name] = true
	}

	sorted := make([]string, 0, len(names))
	for name := range names {
		sorted = append(sorted, name)
	}

	sort.Strings(sorted)

	for _, name := range sorted {
		w, inWant := want[name]
		g, inGot := got[name]

		switch {
		case !inWant:
			t.Errorf("%s: %s is only in the Go tree", label, name)
		case !inGot:
			t.Errorf("%s: %s is only in the recorded tree", label, name)
		case w != g:
			t.Errorf("%s: %s differs\n recorded: %q\n go:       %q", label, name, w, g)
		}
	}
}

func TestKitMatchesTheRecordedTrees(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("the fixture's post-install commands use touch")
	}

	data, err := os.ReadFile(filepath.Join("testdata", "kit_trees.json"))
	if err != nil {
		t.Fatal(err)
	}

	var recorded map[string]map[string]string
	if err := json.Unmarshal(data, &recorded); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		// setup writes files into the project directory before the run.
		setup map[string]string
		args  func(manifest string) []string
		// sub is the directory compared, relative to the run's directory.
		sub string
	}{
		{
			name:  "add with requires, a folder, an existing file and variables",
			setup: map[string]string{"config/base.json": "kept: the conflict is skipped\n"},
			args: func(manifest string) []string {
				return []string{"add", "widget", "--registry", manifest, "--var", "project_name=demo-app", "--var", "extra=dropped", "--no-install"}
			},
			sub: "",
		},
		{
			name:  "add with skip-existing",
			setup: map[string]string{"src/widget.ts": "kept\n"},
			args: func(manifest string) []string {
				return []string{"add", "widget", "--registry", manifest, "--skip-existing", "--no-install"}
			},
			sub: "",
		},
		{
			name:  "add as a dry run",
			setup: map[string]string{"keep.txt": "a dry run writes nothing next to this\n"},
			args: func(manifest string) []string {
				return []string{"add", "widget", "--registry", manifest, "--dry-run"}
			},
			sub: "",
		},
		{
			name:  "new with a name and a variable",
			setup: nil,
			args: func(manifest string) []string {
				return []string{"new", "app", "--name", "demo", "--registry", manifest, "--var", "author=Grace", "--no-interactive"}
			},
			sub: "demo",
		},
		{
			name:  "new without post-install over an existing file",
			setup: map[string]string{"app/README.md": "overwritten: new forces\n"},
			args: func(manifest string) []string {
				return []string{"new", "app", "--registry", manifest, "--no-post-install", "--no-interactive"}
			},
			sub: "app",
		},
		{
			name:  "clone a whole repository with ignore globs and path variables",
			setup: map[string]string{"my-app/README.md": "kept: the conflict is skipped\n"},
			args: func(string) []string {
				return []string{"clone", "acme/tpl", "my-app", "--var", "module=acme.dev/x", "--no-interactive"}
			},
			sub: "my-app",
		},
		{
			name:  "clone a recipe with a file list",
			setup: nil,
			args: func(string) []string {
				return []string{"clone", "gh:acme/files#main", "--name", "demo", "--no-interactive"}
			},
			sub: "demo",
		},
		{
			name:  "update overwrites the recipe's files",
			setup: map[string]string{"src/widget.ts": "old\n", "base.txt": "not part of widget\n"},
			args: func(manifest string) []string {
				return []string{"update", "widget", "--registry", manifest}
			},
			sub: "",
		},
	}

	if len(recorded) != len(cases) {
		t.Errorf("%d recorded trees for %d cases", len(recorded), len(cases))
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			want, ok := recorded[tc.name]
			if !ok {
				t.Fatalf("no recorded tree for %q", tc.name)
			}

			g, manifest := kitFixture(t)

			dir := t.TempDir()
			writeFiles(t, dir, tc.setup)
			output := runGoKit(t, g, dir, tc.args(manifest))

			diffTrees(t, tc.name, want, readTree(t, filepath.Join(dir, tc.sub)))
			t.Logf("go output:\n%s", output)
		})
	}
}
