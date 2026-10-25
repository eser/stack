// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// kitTestEnv is a testEnv in dir that reads GitHub from the fixture.
func kitTestEnv(t *testing.T, g *fakeGitHub, dir string) *env {
	t.Helper()

	e := testEnv(t)
	e.cwd = dir
	e.httpClient = startFakeGitHub(t, g)

	return e
}

func outputs(e *env) (string, string) {
	return e.stdout.(*bytes.Buffer).String(), e.stderr.(*bytes.Buffer).String() //nolint:forcetypeassert
}

func TestKitList(t *testing.T) {
	t.Parallel()

	g, manifest := kitFixture(t)

	cases := []struct {
		name string
		args []string
		want []string
	}{
		{
			name: "every recipe, grouped by scale",
			args: []string{"kit", "list", "--registry", manifest},
			want: []string{
				"acme — Fixture registry\n\nPROJECTS\n  app                  Application template [typescript]\n\nUTILITIES\n",
				"  base                 Base files [typescript]\n",
				"  widget               A widget that needs base [typescript]\n\n",
			},
		},
		{
			name: "no match",
			args: []string{"kit", "list", "--registry", manifest, "--language", "go"},
			want: []string{"No recipes found matching your filters.\nRun `eser kit list` without filters to see all recipes.\n"},
		},
		{
			name: "JSON",
			args: []string{"kit", "list", "--registry", manifest, "--scale", "project", "--json"},
			want: []string{`"name": "acme"`, `"name": "app"`},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			e := kitTestEnv(t, g, t.TempDir())
			if code := run(context.Background(), e, tc.args); code != 0 {
				t.Fatalf("exit %d: %s", code, e.stderr)
			}

			stdout, _ := outputs(e)
			for _, want := range tc.want {
				if !strings.Contains(stdout, want) {
					t.Errorf("stdout should contain %q:\n%s", want, stdout)
				}
			}
		})
	}
}

func TestKitNewPromptsForMissingVariables(t *testing.T) {
	t.Parallel()

	g, _ := kitFixture(t)
	registry := t.TempDir()

	writeFiles(t, registry, map[string]string{
		".eser/recipes.json": `{"name":"r","description":"d","author":"a","registryUrl":"` + filepath.ToSlash(filepath.Join(registry, ".eser")) + `",
			"recipes":[{"name":"svc","description":"d","language":"go","scale":"project",
			"variables":[{"name":"slug","description":"Service slug","pattern":"^[a-z]+$"}],
			"files":[{"source":"t/main.txt","target":"main.txt"}]}]}`,
		".eser/t/main.txt": "slug={{.slug}} name={{.project_name}}\n",
	})

	manifest := filepath.Join(registry, ".eser", "recipes.json")

	t.Run("answers on stdin", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		e := kitTestEnv(t, g, dir)
		e.stdin = strings.NewReader("Bad1\ngood\n")

		if code := run(context.Background(), e, []string{"kit", "new", "svc", "-i", "--registry", manifest}); code != 0 {
			t.Fatalf("exit %d: %s", code, e.stderr)
		}

		got, _ := os.ReadFile(filepath.Join(dir, "svc", "main.txt")) //nolint:gosec // the test's own file
		if string(got) != "slug=good name={{.project_name}}\n" {
			t.Errorf("main.txt = %q; only declared variables are substituted", got)
		}

		stdout, stderr := outputs(e)
		if !strings.Contains(stdout, "Service slug: ") || !strings.Contains(stderr, `does not match pattern ^[a-z]+$. Try again.`) {
			t.Errorf("stdout %q, stderr %q", stdout, stderr)
		}
	})

	t.Run("no prompt without a terminal", func(t *testing.T) {
		t.Parallel()

		e := kitTestEnv(t, g, t.TempDir())
		if code := run(context.Background(), e, []string{"kit", "new", "svc", "--registry", manifest}); code == 0 {
			t.Fatal("a missing variable without a prompt should fail")
		}

		if _, stderr := outputs(e); !strings.Contains(stderr, `required variable "slug" has no value and no default; pass --var slug=<value>`) {
			t.Errorf("stderr = %q", stderr)
		}
	})

	t.Run("a --var that misses the pattern", func(t *testing.T) {
		t.Parallel()

		e := kitTestEnv(t, g, t.TempDir())
		if code := run(context.Background(), e, []string{"kit", "new", "svc", "--registry", manifest, "--var", "slug=No"}); code == 0 {
			t.Fatal("a value that misses the pattern should fail")
		}
	})
}

func TestKitAddInstallsAndWarns(t *testing.T) {
	t.Parallel()

	g, _ := kitFixture(t)
	registry := t.TempDir()

	writeFiles(t, registry, map[string]string{
		".eser/recipes.json": `{"name":"r","description":"d","author":"a","registryUrl":"` + filepath.ToSlash(filepath.Join(registry, ".eser")) + `",
			"recipes":[{"name":"util","description":"d","language":"typescript","scale":"utility",
			"files":[{"source":"u.ts","target":"u.ts"}],
			"dependencies":{"go":["-no-such-flag"]}}]}`,
		".eser/u.ts": "export {};\n",
	})

	dir := t.TempDir()
	writeFiles(t, dir, map[string]string{"go.mod": "module example.com/p\n\ngo 1.26\n"})

	e := kitTestEnv(t, g, t.TempDir())
	args := []string{"kit", "add", "util", "--registry", filepath.Join(registry, ".eser", "recipes.json"), "--cwd", dir}

	if code := run(context.Background(), e, args); code != 0 {
		t.Fatalf("exit %d: %s", code, e.stderr)
	}

	stdout, _ := outputs(e)

	for _, want := range []string{
		"Warning: Recipe 'util' is for typescript, but detected go project (go.mod).\n",
		"✓ Added 1 file(s)\n  → u.ts\n",
		"\nInstalling dependencies...\n",
		"  ✗ go get -no-such-flag: Exit code 2\n",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("stdout should contain %q:\n%s", want, stdout)
		}
	}

	if _, err := os.Stat(filepath.Join(dir, "u.ts")); err != nil {
		t.Errorf("--cwd should receive the files: %v", err)
	}
}

func TestKitErrors(t *testing.T) {
	t.Parallel()

	g, manifest := kitFixture(t)

	cases := []struct {
		name   string
		args   []string
		env    map[string]string
		code   int
		stdout string
		stderr string
	}{
		{
			name: "an unknown recipe", args: []string{"kit", "add", "nope", "--registry", manifest},
			code: 1, stderr: "recipe 'nope' not found. Run `eser kit list` to see available recipes",
		},
		{
			name: "an unknown template", args: []string{"kit", "new", "widget", "--registry", manifest},
			code: 1, stderr: "template 'widget' not found. Available: app",
		},
		{
			name: "a missing registry", args: []string{"kit", "list", "--registry", "missing.json"},
			code: 1, stderr: "the file does not exist; pass --registry with the path or URL of a recipes.json",
		},
		{
			name: "a name instead of a repository", args: []string{"kit", "clone", "widget"},
			code: 1, stdout: "Invalid specifier: 'widget'. Use format: owner/repo or gh:owner/repo#ref\n",
		},
		{
			name: "a bad --max-bytes", args: []string{"kit", "clone", "acme/tpl", "--max-bytes", "01"},
			code: 1, stderr: `--max-bytes "01" is not a positive integer; expected a whole number such as 536870912 for 512 MiB`,
		},
		{
			name: "a bad limit in the environment", args: []string{"kit", "clone", "acme/tpl"},
			env:  map[string]string{kitMaxEntriesEnv: "-5"},
			code: 1, stderr: `ESER_KIT_MAX_ENTRIES "-5" is not a positive integer`,
		},
		{
			name: "a tarball over the entry limit", args: []string{"kit", "clone", "acme/tpl", "out", "--no-interactive"},
			env:  map[string]string{kitMaxEntriesEnv: "3"},
			code: 1, stderr: "If you trust this repository, raise the limit with --max-entries <n> or ESER_KIT_MAX_ENTRIES=<n>",
		},
		{
			name: "the flag wins over the environment", args: []string{"kit", "clone", "acme/tpl", "out", "--max-entries", "2", "--no-interactive"},
			env:  map[string]string{kitMaxEntriesEnv: "100000"},
			code: 1, stderr: "entry count exceeds maxEntries (2)",
		},
		{
			name: "usage without a specifier", args: []string{"kit", "clone"},
			code: 0, stdout: "Usage: eser kit clone <specifier> [target-dir] [options]\n",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			e := kitTestEnv(t, g, t.TempDir())
			e.getenv = func(key string) string { return tc.env[key] }

			if code := run(context.Background(), e, tc.args); code != tc.code {
				t.Errorf("exit %d, want %d: %s", code, tc.code, e.stderr)
			}

			stdout, stderr := outputs(e)
			if !strings.Contains(stdout, tc.stdout) || !strings.Contains(stderr, tc.stderr) {
				t.Errorf("stdout %q should contain %q; stderr %q should contain %q", stdout, tc.stdout, stderr, tc.stderr)
			}
		})
	}
}

func TestKitPostInstallFailureStopsTheRest(t *testing.T) {
	t.Parallel()

	g, _ := kitFixture(t)
	registry := t.TempDir()

	writeFiles(t, registry, map[string]string{
		".eser/recipes.json": `{"name":"r","description":"d","author":"a","registryUrl":"` + filepath.ToSlash(filepath.Join(registry, ".eser")) + `",
			"recipes":[{"name":"p","description":"d","language":"go","scale":"utility",
			"files":[{"source":"p.txt","target":"p.txt"}],
			"postInstall":["no-such-program-4567", "touch after.txt"]}]}`,
		".eser/p.txt": "p\n",
	})

	dir := t.TempDir()
	e := kitTestEnv(t, g, dir)

	if code := run(context.Background(), e, []string{"kit", "add", "p", "--registry", filepath.Join(registry, ".eser", "recipes.json")}); code != 1 {
		t.Fatalf("exit %d, want 1", code)
	}

	if _, stderr := outputs(e); !strings.Contains(stderr, `run post-install command "no-such-program-4567": it did not start`) {
		t.Errorf("stderr = %q", stderr)
	}

	if _, err := os.Stat(filepath.Join(dir, "after.txt")); err == nil {
		t.Error("the commands after a failed one should not run")
	}
}

// add --local finds the registry above --cwd, not above the working directory
// (TASK-322; the TypeScript kit had the same gap).
func TestKitAddLocalSearchesFromCwd(t *testing.T) {
	t.Parallel()

	g, _ := kitFixture(t)
	project := t.TempDir()

	writeFiles(t, project, map[string]string{
		".eser/recipes.json": `{"name":"r","description":"d","author":"a","registryUrl":"` + filepath.ToSlash(filepath.Join(project, ".eser")) + `",
			"recipes":[{"name":"util","description":"d","language":"typescript","scale":"utility",
			"files":[{"source":"u.ts","target":"u.ts"}]}]}`,
		".eser/u.ts":      "export {};\n",
		"app/src/.keep":   "",
		"unrelated/.keep": "",
	})

	// The working directory has no registry above it within reach.
	e := kitTestEnv(t, g, t.TempDir())
	args := []string{"kit", "add", "util", "--local", "--no-install", "--cwd", filepath.Join(project, "app", "src")}

	if code := run(context.Background(), e, args); code != 0 {
		t.Fatalf("exit %d: %s", code, e.stderr)
	}

	if _, err := os.Stat(filepath.Join(project, "app", "src", "u.ts")); err != nil {
		t.Errorf("the recipe from the registry above --cwd should be applied: %v", err)
	}
}
