// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

// The parity tests run the same kit command through this Go CLI and through
// the TypeScript CLI (pkg/@eserstack/kit/main.ts) on copies of one fixture,
// and compare the trees they leave byte for byte. Both sides read GitHub from
// a local fake: the Go CLI through its HTTP client, the TypeScript CLI through
// HTTPS_PROXY, a local CONNECT proxy in front of a TLS server.

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
      "dependencies": { "npm": ["left-pad"], "jsr": ["jsr:@std/path"] }
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
      "dependencies": { "jsr": ["jsr:@std/path"] }
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

// startConnectProxy serves g over TLS behind a CONNECT proxy and returns
// the proxy URL.
func startConnectProxy(t *testing.T, g http.Handler) string {
	t.Helper()

	tlsServer := httptest.NewTLSServer(g)
	t.Cleanup(tlsServer.Close)

	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect {
			http.Error(w, "only CONNECT", http.StatusMethodNotAllowed)

			return
		}

		upstream, err := net.Dial("tcp", tlsServer.Listener.Addr().String()) //nolint:noctx // a test proxy
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)

			return
		}

		client, _, err := w.(http.Hijacker).Hijack() //nolint:forcetypeassert // the test server supports it
		if err != nil {
			_ = upstream.Close()

			return
		}

		_, _ = client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

		go func() {
			_, _ = io.Copy(upstream, client)
			_ = upstream.Close()
		}()

		_, _ = io.Copy(client, upstream)
		_ = client.Close()
	}))
	t.Cleanup(proxy.Close)

	return proxy.URL
}

// repoRoot is the monorepo root, two levels above this package.
func repoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(root, "pkg", "@eserstack", "kit", "main.ts")); err != nil {
		t.Skipf("the TypeScript kit is not at %s: %v", root, err)
	}

	return root
}

// tsKitRun is one way to run the TypeScript CLI.
type tsKitRun struct {
	name string
	// env is added to the process environment.
	env []string
}

// tsKitRuns are the TypeScript runs each Go run is compared with: the
// default environment, where kit may route through the native ajan library,
// and ESER_AJAN=disabled, where it uses its own TypeScript engine.
var tsKitRuns = []tsKitRun{
	{name: "ts-default", env: []string{"ESER_AJAN_DEBUG=1"}},
	{name: "ts-engine", env: []string{"ESER_AJAN=disabled"}},
}

func runTSKit(t *testing.T, run tsKitRun, proxyURL, dir string, args []string) string {
	t.Helper()

	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH")
	}

	root := repoRoot(t)

	if _, err := os.Stat(filepath.Join(root, "node_modules")); err != nil {
		t.Skipf("the TypeScript kit's dependencies are not installed at %s: %v", root, err)
	}

	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()

	full := append([]string{filepath.Join(root, "pkg", "@eserstack", "kit", "main.ts")}, args...)

	cmd := exec.CommandContext(ctx, node, full...)
	cmd.Dir = dir

	environ := make([]string, 0, len(os.Environ())+4+len(run.env))

	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		switch strings.ToUpper(key) {
		case "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "ESER_AJAN", "ESER_AJAN_DEBUG",
			"NODE_USE_ENV_PROXY", "NODE_TLS_REJECT_UNAUTHORIZED":
			continue
		}

		environ = append(environ, entry)
	}

	// NODE_USE_ENV_PROXY makes Node's fetch go through HTTPS_PROXY, and
	// NODE_TLS_REJECT_UNAUTHORIZED=0 accepts the fake's self-signed test
	// certificate, which is not issued for the GitHub host names.
	environ = append(environ,
		"HTTPS_PROXY="+proxyURL, "NODE_USE_ENV_PROXY=1", "NODE_TLS_REJECT_UNAUTHORIZED=0", "NO_COLOR=1")
	environ = append(environ, run.env...)
	cmd.Env = environ

	var output bytes.Buffer

	cmd.Stdout = &output
	cmd.Stderr = &output

	if err := cmd.Run(); err != nil {
		t.Fatalf("%s %v: %v\n%s", run.name, args, err, output.String())
	}

	return output.String()
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
			t.Errorf("%s: %s is only in the TypeScript tree", label, name)
		case !inGot:
			t.Errorf("%s: %s is only in the Go tree", label, name)
		case w != g:
			t.Errorf("%s: %s differs\n go: %q\n ts: %q", label, name, w, g)
		}
	}
}

func TestKitParityWithTypeScript(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("the fixture's post-install commands use touch")
	}

	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not on PATH")
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

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			g, manifest := kitFixture(t)
			proxyURL := startConnectProxy(t, g)

			goDir := t.TempDir()
			writeFiles(t, goDir, tc.setup)
			goOutput := runGoKit(t, g, goDir, tc.args(manifest))
			goTree := readTree(t, filepath.Join(goDir, tc.sub))

			if len(goTree) == 0 {
				t.Fatalf("the Go run wrote nothing:\n%s", goOutput)
			}

			for _, tsRun := range tsKitRuns {
				tsDir := t.TempDir()
				writeFiles(t, tsDir, tc.setup)
				tsOutput := runTSKit(t, tsRun, proxyURL, tsDir, tc.args(manifest))
				t.Logf("%s output:\n%s", tsRun.name, tsOutput)

				diffTrees(t, tsRun.name, goTree, readTree(t, filepath.Join(tsDir, tc.sub)))
			}

			t.Logf("go output:\n%s", goOutput)
		})
	}
}
