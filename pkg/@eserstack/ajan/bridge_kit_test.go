// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// kitRegistryFiles are the recipe sources of the fixture registry, relative
// to its registryUrl.
var kitRegistryFiles = map[string]string{ //nolint:gochecknoglobals
	"recipes/base/config.json": "{\"name\": \"{{.project_name}}\"}\n",
	"recipes/base/README.md":   "# {{.project_name}}\n",
	"recipes/lib/util.ts":      "export const greet = () => \"hi {{.project_name}}\";\n",
}

func kitManifest(registryURL string) map[string]any {
	return map[string]any{
		"name":        "fixture",
		"description": "a registry for the bridge test",
		"author":      "test",
		"registryUrl": registryURL,
		"recipes": []map[string]any{
			{
				"name": "base", "description": "base files", "language": "typescript", "scale": "project",
				"variables": []map[string]any{{"name": "project_name", "description": "the name", "default": "demo"}},
				"files": []map[string]any{
					{"source": "recipes/base/config.json", "target": "config.json"},
					{"source": "recipes/base/README.md", "target": "README.md"},
				},
			},
			{
				"name": "lib", "description": "a library file", "language": "typescript", "scale": "utility",
				"requires": []string{"base"},
				// Each recipe gets only the variables it declares (StrictVariables).
				"variables": []map[string]any{{"name": "project_name", "description": "the name"}},
				"files":     []map[string]any{{"source": "recipes/lib/util.ts", "target": "src/util.ts"}},
			},
		},
	}
}

func writeKitRegistry(t *testing.T, dir string) {
	t.Helper()

	for rel, content := range kitRegistryFiles {
		path := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func kitTree(t *testing.T, dir string) map[string]string {
	t.Helper()

	tree := map[string]string{}

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}

		data, err := os.ReadFile(path) //nolint:gosec // the test's own output
		rel, _ := filepath.Rel(dir, path)
		tree[filepath.ToSlash(rel)] = string(data)

		return err
	})
	if err != nil {
		t.Fatal(err)
	}

	return tree
}

// cliApply is what `eser kit add` runs (cmd/eser/kit.go: kitApplyOptions,
// SourceBase from the manifest).
func cliApply(t *testing.T, registry, cwd string) {
	t.Helper()

	manifest, err := kitfx.FetchRegistry(context.Background(), cwd, registry)
	if err != nil {
		t.Fatal(err)
	}

	_, err = kitfx.ApplyRecipeChain(context.Background(), "lib", manifest, kitfx.ApplyOptions{ //nolint:exhaustruct
		CWD:                      cwd,
		RegistryURL:              manifest.RegistryURL,
		SourceBase:               manifest.RegistryURL,
		SkipConflicts:            true,
		StrictVariables:          true,
		StopOnPostInstallFailure: true,
		Variables:                map[string]string{"project_name": "acme"},
	})
	if err != nil {
		t.Fatal(err)
	}
}

func bridgeApply(t *testing.T, registry, cwd string) {
	t.Helper()

	req, _ := json.Marshal(map[string]any{
		"recipeName": "lib", "registryUrl": registry, "cwd": cwd,
		"variables": map[string]string{"project_name": "acme"},
	})

	var resp kitApplyRecipeResponse
	if err := json.Unmarshal([]byte(bridgeKitApplyRecipe(string(req))), &resp); err != nil {
		t.Fatal(err)
	}

	if resp.Error != "" {
		t.Fatalf("bridge: %s", resp.Error)
	}

	if len(resp.Recipes) != 2 || resp.Recipes[0].Name != "base" || resp.Recipes[1].Name != "lib" {
		t.Errorf("recipes %+v", resp.Recipes)
	}
}

// The kit bridge resolves recipe sources against the manifest's registryUrl
// and applies the same tree as `eser kit add`, for a registry on disk and one
// over HTTP. It used to read the sources relative to the process's working
// directory, so every real registry failed through the bridge.
func TestKitBridgeAppliesRegistriesLikeTheCLI(t *testing.T) {
	t.Parallel()

	want := map[string]string{
		"config.json": "{\"name\": \"acme\"}\n",
		"README.md":   "# acme\n",
		"src/util.ts": "export const greet = () => \"hi acme\";\n",
	}

	check := func(t *testing.T, registry string) {
		t.Helper()

		viaBridge, viaCLI := t.TempDir(), t.TempDir()
		bridgeApply(t, registry, viaBridge)
		cliApply(t, registry, viaCLI)

		got, cli := kitTree(t, viaBridge), kitTree(t, viaCLI)
		for path, content := range want {
			if got[path] != content {
				t.Errorf("%s through the bridge: %q, want %q", path, got[path], content)
			}

			if cli[path] != content {
				t.Errorf("%s through the CLI options: %q, want %q", path, cli[path], content)
			}
		}

		if len(got) != len(want) || len(cli) != len(want) {
			t.Errorf("trees: bridge %v, cli %v", got, cli)
		}
	}

	t.Run("local", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		writeKitRegistry(t, dir)

		manifest, _ := json.Marshal(kitManifest(dir))
		registry := filepath.Join(dir, "recipes.json")

		if err := os.WriteFile(registry, manifest, 0o600); err != nil {
			t.Fatal(err)
		}

		check(t, registry)
	})

	t.Run("http", func(t *testing.T) {
		t.Parallel()

		var server *httptest.Server

		server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/recipes.json" {
				_ = json.NewEncoder(w).Encode(kitManifest(server.URL))

				return
			}

			content, ok := kitRegistryFiles[strings.TrimPrefix(r.URL.Path, "/")]
			if !ok {
				http.NotFound(w, r)

				return
			}

			_, _ = w.Write([]byte(content))
		}))
		t.Cleanup(server.Close)

		check(t, server.URL+"/recipes.json")
	})
}
