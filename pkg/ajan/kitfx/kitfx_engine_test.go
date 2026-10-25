// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// These tests cover the behaviour kitfx shares with the TypeScript kit
// (pkg/@eserstack/kit); the expected values come from running the
// TypeScript code on the same input.

func TestShouldIgnore_MatchesTheTypeScriptGlobs(t *testing.T) {
	t.Parallel()

	cases := []struct {
		pattern, path string
		want          bool
	}{
		{"*.md", "README.md", true},
		{"*.md", "docs/README.md", false},
		{"**/*.md", "README.md", true},
		{"**/*.md", "a/b/c.md", true},
		{"docs/**", "docs/a/b.txt", true},
		{"docs/**", "docs", false},
		{"docs/", "docs/x", true},
		{"docs", "docsx/y", false},
		{"src/*.ts", "src/a.ts", true},
		{"src/*.ts", "src/a/b.ts", false},
		{"file?.txt", "file1.txt", true},
		{"file?.txt", "file12.txt", false},
		{"{a,b}.txt", "b.txt", true},
		{"{a,b}.txt", "c.txt", false},
		{"[ab].txt", "a.txt", true},
		{"[!ab].txt", "a.txt", false},
		{"[!ab].txt", "c.txt", true},
		{"@(x|y).js", "x.js", true},
		{"+(x|y).js", "xyx.js", true},
		{"*(x|y).js", ".js", true},
		{"?(x|y).js", "xy.js", false},
		{"[[:digit:]].txt", "5.txt", true},
		{"[[:alpha:]].txt", "5.txt", false},
		{"a.b", "a.b", true},
		{"a.b", "axb", false},
		{"**", "x/y/z", true},
		{"a/**/b", "a/b", true},
		{"a/**/b", "a/x/y/b", true},
		{"(x).txt", "(x).txt", true},
		{"[abc", "[abc", true},
		{`a\*b`, "a*b", true},
		{`a\*b`, "axb", false},
		{"dir/", "dir", true},
		{"*", "a/b", false},
		{"*.log", "app.log", true},
		// The TypeScript kit matches "y.js" here through a lookahead, which
		// Go's regexp lacks; kitfx takes the segment literally.
		{"!(x).js", "y.js", false},
		{"", "anything", false},
	}

	for _, tc := range cases {
		if got := kitfx.ShouldIgnore(tc.path, []string{tc.pattern}); got != tc.want {
			t.Errorf("ShouldIgnore(%q, [%q]) = %v, want %v", tc.path, tc.pattern, got, tc.want)
		}
	}
}

func TestResolveSpecifier_TypeScriptForms(t *testing.T) {
	t.Parallel()

	cases := []struct {
		input string
		want  kitfx.ResolvedSpecifier
	}{
		{"fp-pipe#dev", kitfx.ResolvedSpecifier{Kind: "name", Name: "fp-pipe", Ref: "dev"}},
		{"acme/widget", kitfx.ResolvedSpecifier{Kind: "repo", Owner: "acme", Repo: "widget"}},
		{"github:acme/widget#v2", kitfx.ResolvedSpecifier{Kind: "repo", Owner: "acme", Repo: "widget", Ref: "v2"}},
		{"gh:acme/widget/packages/foo", kitfx.ResolvedSpecifier{Kind: "repo", Owner: "acme", Repo: "widget", Subpath: "packages/foo"}},
		{"gh:acme/widget/sub#feature/x", kitfx.ResolvedSpecifier{Kind: "repo", Owner: "acme", Repo: "widget", Ref: "feature/x", Subpath: "sub"}},
		{"gh:/repo", kitfx.ResolvedSpecifier{Kind: "name", Name: "/repo"}},
		{"https://example.com/r.json", kitfx.ResolvedSpecifier{Kind: "name", Name: "https://example.com/r.json"}},
	}

	for _, tc := range cases {
		if got := kitfx.ResolveSpecifier(tc.input); got != tc.want {
			t.Errorf("ResolveSpecifier(%q) = %+v, want %+v", tc.input, got, tc.want)
		}
	}
}

func decodeVariables(t *testing.T, raw string) []kitfx.TemplateVariable {
	t.Helper()

	var variables []kitfx.TemplateVariable
	if err := json.Unmarshal([]byte(raw), &variables); err != nil {
		t.Fatal(err)
	}

	return variables
}

// answers returns a PromptFunc that hands out the answers in order, then
// io.EOF, and records the questions.
func answers(questions *[]string, replies ...string) kitfx.PromptFunc {
	return func(_ context.Context, question string) (string, error) {
		*questions = append(*questions, question)
		if len(replies) == 0 {
			return "", io.EOF
		}

		reply := replies[0]
		replies = replies[1:]

		return reply, nil
	}
}

func TestResolveRecipeVariables_Strict(t *testing.T) {
	t.Parallel()

	variables := decodeVariables(t, `[
		{ "name": "project_name", "description": "Project name" },
		{ "name": "empty", "default": "" },
		{ "name": "module", "default": "a/b", "pattern": "^[a-z]+/[a-z]+$" }
	]`)

	t.Run("overrides, empty defaults, and undeclared values dropped", func(t *testing.T) {
		t.Parallel()

		got, err := kitfx.ResolveRecipeVariables(t.Context(), variables,
			map[string]string{"project_name": "demo", "extra": "x"}, nil, true, nil)
		if err != nil {
			t.Fatal(err)
		}

		want := map[string]string{"project_name": "demo", "empty": "", "module": "a/b"}
		if len(got) != len(want) || got["project_name"] != "demo" || got["module"] != "a/b" || got["empty"] != "" {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("a missing value without a prompt", func(t *testing.T) {
		t.Parallel()

		_, err := kitfx.ResolveRecipeVariables(t.Context(), variables, nil, nil, true, nil)
		if missing, ok := errors.AsType[*kitfx.MissingVariableError](err); !ok || missing.Name != "project_name" {
			t.Fatalf("want a MissingVariableError for project_name, got %v", err)
		}
	})

	t.Run("an override that misses the pattern", func(t *testing.T) {
		t.Parallel()

		_, err := kitfx.ResolveRecipeVariables(t.Context(), variables,
			map[string]string{"project_name": "x", "module": "Bad!"}, nil, true, nil)
		if !errors.Is(err, kitfx.ErrVariablePattern) {
			t.Fatalf("want ErrVariablePattern, got %v", err)
		}
	})

	t.Run("prompting asks again after an empty or invalid answer", func(t *testing.T) {
		t.Parallel()

		patterned := decodeVariables(t, `[{ "name": "slug", "pattern": "^[a-z]+$" }]`)

		var questions []string

		var stderr bytes.Buffer

		got, err := kitfx.ResolveRecipeVariables(t.Context(), patterned, nil, answers(&questions, "", "Bad1", "good"), true, &stderr)
		if err != nil {
			t.Fatal(err)
		}

		if got["slug"] != "good" || len(questions) != 3 || questions[0] != "slug: " {
			t.Errorf("got %v after questions %q", got, questions)
		}

		if !strings.Contains(stderr.String(), `  Error: value "Bad1" does not match pattern ^[a-z]+$. Try again.`) {
			t.Errorf("stderr = %q", stderr.String())
		}
	})

	t.Run("the end of input ends prompting", func(t *testing.T) {
		t.Parallel()

		var questions []string

		_, err := kitfx.ResolveRecipeVariables(t.Context(), variables, nil, answers(&questions), true, nil)
		if !errors.Is(err, io.EOF) || questions[0] != "Project name: " {
			t.Fatalf("want a MissingVariableError wrapping io.EOF after %q, got %v", questions, err)
		}
	})

	t.Run("lenient mode keeps the old merge", func(t *testing.T) {
		t.Parallel()

		got, err := kitfx.ResolveRecipeVariables(t.Context(), variables, map[string]string{"extra": "x"}, nil, false, nil)
		if err != nil || got["project_name"] != "" || got["extra"] != "x" {
			t.Errorf("got %v, %v", got, err)
		}
	})
}

func TestSubstituteInPath(t *testing.T) {
	t.Parallel()

	got := kitfx.SubstituteInPath("{{.name}}/{{ .missing }}/{{ .name }}.txt", map[string]string{"name": "demo"})
	if want := "demo/{{.missing}}/demo.txt"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestIsPathSafe_RejectsAbsoluteTargets(t *testing.T) {
	t.Parallel()

	if kitfx.IsPathSafe(t.TempDir(), "/etc/passwd") {
		t.Error("an absolute target must not be safe")
	}
}

func TestDetectProjectType_FirstFileInOrderWins(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	for _, name := range []string{"package.json", "deno.json", "go.mod"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("{}"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	if got := kitfx.DetectProjectType(dir); got.Type != kitfx.ProjectTypeGo || filepath.Base(got.ConfigFile) != "go.mod" {
		t.Errorf("got %+v, want go.mod to win", got)
	}
}

func TestRunInstallCommands_StopsAtTheFirstFailure(t *testing.T) {
	t.Parallel()
	requirePrograms(t, "go")

	results := kitfx.RunInstallCommands(t.Context(), []string{"go version", "go no-such-command", "go version"}, kitfx.InstallOptions{
		CWD: t.TempDir(),
	})

	if len(results) != 2 || !results[0].Success || results[1].Success || !strings.HasPrefix(results[1].Error, "Exit code ") {
		t.Errorf("results = %+v", results)
	}
}

// fakeGitHubServer serves raw files, folder listings and one tarball for
// the repository acme/tpl at main.
func fakeGitHubServer(t *testing.T, files map[string]string, tarball []byte) kitfx.GitHubEndpoints {
	t.Helper()

	var server *httptest.Server

	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/raw/acme/tpl/main/"):
			content, ok := files[strings.TrimPrefix(r.URL.Path, "/raw/acme/tpl/main/")]
			if !ok {
				http.NotFound(w, r)

				return
			}

			_, _ = io.WriteString(w, content)
		case strings.HasPrefix(r.URL.Path, "/api/repos/acme/tpl/contents/"):
			folder := strings.TrimPrefix(r.URL.Path, "/api/repos/acme/tpl/contents/")

			var listing []map[string]any

			for name := range files {
				if rest, ok := strings.CutPrefix(name, folder+"/"); ok && !strings.Contains(rest, "/") {
					listing = append(listing, map[string]any{
						"type": "file", "path": name, "download_url": server.URL + "/raw/acme/tpl/main/" + name,
					})
				}
			}

			listing = append(listing, map[string]any{"type": "dir", "path": folder + "/sub", "download_url": nil})
			_ = json.NewEncoder(w).Encode(listing)
		case r.URL.Path == "/codeload/acme/tpl/tar.gz/main":
			_, _ = w.Write(tarball)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	return kitfx.GitHubEndpoints{Raw: server.URL + "/raw", API: server.URL + "/api", Codeload: server.URL + "/codeload"}
}

type tarEntry struct {
	name     string
	content  string
	typeflag byte
}

func gzipTar(t *testing.T, entries []tarEntry) []byte {
	t.Helper()

	var buf bytes.Buffer

	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)

	for _, entry := range entries {
		header := &tar.Header{Name: entry.name, Typeflag: entry.typeflag, Mode: 0o644, Size: int64(len(entry.content))}
		if entry.typeflag != tar.TypeReg {
			header.Size = 0
			header.Linkname = "/etc/passwd"
		}

		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}

		if entry.typeflag == tar.TypeReg {
			if _, err := io.WriteString(tw, entry.content); err != nil {
				t.Fatal(err)
			}
		}
	}

	if err := errors.Join(tw.Close(), gz.Close()); err != nil {
		t.Fatal(err)
	}

	return buf.Bytes()
}

func TestExtractTarball(t *testing.T) {
	t.Parallel()

	archive := gzipTar(t, []tarEntry{
		{"tpl-main/a.txt", "a", tar.TypeReg},
		{"tpl-main/pkg/b.txt", "b", tar.TypeReg},
		{"tpl-main/pkg-extra/c.txt", "c", tar.TypeReg},
		{"tpl-main/../escape.txt", "x", tar.TypeReg},
		{"tpl-main/link", "", tar.TypeSymlink},
	})

	t.Run("strip, subpath and unsafe entries", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		if err := kitfx.ExtractTarball(bytes.NewReader(archive), dir, kitfx.ExtractOptions{StripComponents: 1, Subpath: "pkg"}); err != nil {
			t.Fatal(err)
		}

		entries, _ := os.ReadDir(dir)
		if len(entries) != 1 || entries[0].Name() != "b.txt" {
			t.Errorf("extracted %v, want only b.txt", entries)
		}
	})

	for _, tc := range []struct {
		name  string
		opts  kitfx.ExtractOptions
		limit string
	}{
		{"entries", kitfx.ExtractOptions{MaxEntries: 2}, kitfx.LimitMaxEntries},
		{"bytes", kitfx.ExtractOptions{MaxBytes: 1024}, kitfx.LimitMaxBytes},
	} {
		t.Run("the "+tc.name+" limit", func(t *testing.T) {
			t.Parallel()

			err := kitfx.ExtractTarball(bytes.NewReader(archive), t.TempDir(), tc.opts)
			if limitErr, ok := errors.AsType[*kitfx.TarballLimitError](err); !ok || limitErr.Limit != tc.limit {
				t.Fatalf("want a TarballLimitError for %s, got %v", tc.limit, err)
			}
		})
	}
}

func TestApplyRecipe_WholeRepo(t *testing.T) {
	t.Parallel()

	archive := gzipTar(t, []tarEntry{
		{"tpl-main/{{.project_name}}/main.txt", "main of {{.project_name}}", tar.TypeReg},
		{"tpl-main/logo.png", "{{.project_name}}", tar.TypeReg},
		{"tpl-main/docs/guide.md", "ignored", tar.TypeReg},
		{"tpl-main/recipe.json", "{}", tar.TypeReg},
		{"tpl-main/keep.txt", "new", tar.TypeReg},
	})
	github := fakeGitHubServer(t, nil, archive)

	cwd := t.TempDir()
	if err := os.WriteFile(filepath.Join(cwd, "keep.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	var stderr bytes.Buffer

	recipe := &kitfx.Recipe{Variables: decodeVariables(t, `[{ "name": "project_name", "default": "demo" }]`), Ignore: []string{"docs/**"}}

	result, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{
		CWD: cwd, Specifier: "gh:acme/tpl", GitHub: github, StrictVariables: true, Stderr: &stderr,
	})
	if err != nil {
		t.Fatal(err)
	}

	slices.Sort(result.Written)

	if want := []string{"demo/main.txt", "logo.png"}; !slices.Equal(result.Written, want) {
		t.Errorf("Written = %v, want %v", result.Written, want)
	}

	if !slices.Equal(result.Skipped, []string{"keep.txt"}) || !strings.Contains(stderr.String(), "Warning: keep.txt already exists") {
		t.Errorf("Skipped = %v, stderr %q", result.Skipped, stderr.String())
	}

	for path, want := range map[string]string{"demo/main.txt": "main of demo", "logo.png": "{{.project_name}}", "keep.txt": "old"} {
		if got, _ := os.ReadFile(filepath.Join(cwd, path)); string(got) != want { //nolint:gosec // the test's own file
			t.Errorf("%s = %q, want %q", path, got, want)
		}
	}
}

func TestApplyRecipe_SourceBaseOnGitHub(t *testing.T) {
	t.Parallel()

	github := fakeGitHubServer(t, map[string]string{
		".eser/recipes/a.txt":        "a {{.name}}",
		".eser/recipes/folder/b.txt": "b {{.name}}",
		".eser/recipes/folder/c.txt": "c",
	}, nil)

	recipe := &kitfx.Recipe{
		Name:      "r",
		Variables: decodeVariables(t, `[{ "name": "name", "default": "demo" }]`),
		Files: []kitfx.RecipeFile{
			{Source: "recipes/a.txt", Target: "a.txt"},
			{Source: "recipes/folder", Target: "out", Kind: kitfx.RecipeFileKindFolder},
		},
	}

	cwd := t.TempDir()

	_, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{
		CWD: cwd, SourceBase: github.Raw + "/acme/tpl/main/.eser", GitHub: github, StrictVariables: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	for path, want := range map[string]string{"a.txt": "a demo", "out/b.txt": "b demo", "out/c.txt": "c"} {
		if got, _ := os.ReadFile(filepath.Join(cwd, path)); string(got) != want { //nolint:gosec // the test's own file
			t.Errorf("%s = %q, want %q", path, got, want)
		}
	}
}

func TestApplyRecipe_SourceBaseOnDisk(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	if err := os.MkdirAll(filepath.Join(base, "folder", "nested"), 0o750); err != nil {
		t.Fatal(err)
	}

	for path, content := range map[string]string{"a.txt": "a", "folder/b.txt": "b", "folder/nested/c.txt": "c"} {
		if err := os.WriteFile(filepath.Join(base, path), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	recipe := &kitfx.Recipe{Name: "r", Files: []kitfx.RecipeFile{
		{Source: "a.txt", Target: "a.txt"},
		{Source: "folder", Target: "out", Kind: kitfx.RecipeFileKindFolder},
	}}

	for _, sourceBase := range []string{base, "file://" + filepath.ToSlash(base)} {
		cwd := t.TempDir()

		result, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{CWD: cwd, SourceBase: sourceBase})
		if err != nil {
			t.Fatalf("%s: %v", sourceBase, err)
		}

		// A folder copies the files directly in it, as a GitHub listing does.
		if want := []string{"a.txt", "out/b.txt"}; !slices.Equal(result.Written, want) {
			t.Errorf("%s: Written = %v, want %v", sourceBase, result.Written, want)
		}
	}
}

func TestApplyRecipe_TypeScriptConflictsAndPostInstall(t *testing.T) {
	t.Parallel()
	requirePrograms(t, "go")

	base := t.TempDir()
	if err := os.WriteFile(filepath.Join(base, "a.txt"), []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}

	cwd := t.TempDir()
	if err := os.WriteFile(filepath.Join(cwd, "a.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	recipe := &kitfx.Recipe{
		Name:        "r",
		Files:       []kitfx.RecipeFile{{Source: "a.txt", Target: "a.txt"}},
		PostInstall: []string{"go no-such-command", "go version"},
	}

	var stderr bytes.Buffer

	result, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{
		CWD: cwd, SourceBase: base, SkipConflicts: true, StopOnPostInstallFailure: true, Stderr: &stderr,
	})

	if postErr, ok := errors.AsType[*kitfx.PostInstallError](err); !ok || postErr.ExitCode == 0 || postErr.Command != "go no-such-command" {
		t.Fatalf("want a PostInstallError for the first command, got %v", err)
	}

	if !slices.Equal(result.PostInstallRan, []string{"go no-such-command"}) {
		t.Errorf("PostInstallRan = %v; the first failure stops the rest", result.PostInstallRan)
	}

	if !slices.Equal(result.Skipped, []string{"a.txt"}) || !strings.Contains(stderr.String(), "  Warning: a.txt already exists.") {
		t.Errorf("Skipped = %v, stderr = %q", result.Skipped, stderr.String())
	}

	dry, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{CWD: t.TempDir(), SourceBase: base, DryRun: true})
	if err != nil || len(dry.PostInstallRan) != 2 {
		t.Errorf("a dry run lists the post-install commands: %v, %v", dry.PostInstallRan, err)
	}
}

func TestLoadRegistry(t *testing.T) {
	t.Parallel()

	manifest := `{"$schema":"https://eser.live/registry/v2.json","name":"n","description":"d","author":"a",` +
		`"registryUrl":"https://example.com","recipes":[{"name":"r","description":"d","language":"go","scale":"utility",` +
		`"files":[{"source":"s","target":"t"}]}]}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/raw/eser/stack/main/.eser/recipes.json" {
			http.NotFound(w, r)

			return
		}

		_, _ = io.WriteString(w, manifest)
	}))
	t.Cleanup(server.Close)

	t.Run("the default registry, with a warning for an unknown schema", func(t *testing.T) {
		t.Parallel()

		var stderr bytes.Buffer

		got, source, err := kitfx.LoadRegistry(t.Context(), &kitfx.LoadRegistryOptions{
			CWD: t.TempDir(), Stderr: &stderr, GitHub: kitfx.GitHubEndpoints{Raw: server.URL + "/raw"},
		})
		if err != nil || got.Name != "n" || source != server.URL+"/raw/eser/stack/main/.eser/recipes.json" {
			t.Fatalf("got %v from %s: %v", got, source, err)
		}

		if !strings.Contains(stderr.String(), `Warning: Registry uses unknown schema "https://eser.live/registry/v2.json"`) {
			t.Errorf("stderr = %q", stderr.String())
		}
	})

	t.Run("--local finds the nearest manifest", func(t *testing.T) {
		t.Parallel()

		root := t.TempDir()
		nested := filepath.Join(root, "a", "b")

		if err := os.MkdirAll(filepath.Join(root, ".eser"), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.MkdirAll(nested, 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(filepath.Join(root, ".eser", "recipes.json"), []byte(manifest), 0o600); err != nil {
			t.Fatal(err)
		}

		var stdout bytes.Buffer

		_, source, err := kitfx.LoadRegistry(t.Context(), &kitfx.LoadRegistryOptions{CWD: nested, Local: true, Verbose: true, Stdout: &stdout})
		if err != nil || source != filepath.Join(root, ".eser", "recipes.json") {
			t.Fatalf("source %s: %v", source, err)
		}

		if !strings.Contains(stdout.String(), "Using local registry: ") {
			t.Errorf("stdout = %q", stdout.String())
		}
	})

	t.Run("validation", func(t *testing.T) {
		t.Parallel()

		for _, bad := range []string{
			`{"name":"n","description":"d","registryUrl":"u","recipes":[]}`,
			`{"name":"n","description":"d","author":"a","registryUrl":"","recipes":[]}`,
			`{"name":"n","description":"d","author":"a","registryUrl":"u","recipes":[{"name":"r","description":"d","language":"go","scale":"utility","files":[{"source":"s","target":"t","kind":"dir"}]}]}`,
		} {
			if _, err := kitfx.ParseRegistryManifest([]byte(bad), nil); !errors.Is(err, kitfx.ErrInvalidManifest) {
				t.Errorf("ParseRegistryManifest(%s) = %v, want ErrInvalidManifest", bad, err)
			}
		}
	})
}

func TestFetchRecipeFromRepo(t *testing.T) {
	t.Parallel()

	github := fakeGitHubServer(t, map[string]string{
		"recipe.json":     `{"name":"tpl","ignore":["docs/**"]}`,
		"sub/custom.json": `{"name":"sub","files":[{"source":"a","target":"b"}]}`,
	}, nil)

	recipe, err := kitfx.FetchRecipeFromRepo(t.Context(), specifier("acme/tpl"), kitfx.RepoRecipeOptions{GitHub: github})
	if err != nil || recipe.Name != "tpl" || recipe.Files != nil || !slices.Equal(recipe.Ignore, []string{"docs/**"}) {
		t.Fatalf("got %+v, %v", recipe, err)
	}

	recipe, err = kitfx.FetchRecipeFromRepo(t.Context(), specifier("gh:acme/tpl/sub#main"),
		kitfx.RepoRecipeOptions{RecipePath: "custom.json", GitHub: github})
	if err != nil || recipe.Name != "sub" || len(recipe.Files) != 1 {
		t.Fatalf("got %+v, %v", recipe, err)
	}

	_, err = kitfx.FetchRecipeFromRepo(t.Context(), specifier("gh:acme/tpl/none"), kitfx.RepoRecipeOptions{GitHub: github})
	if !errors.Is(err, kitfx.ErrRecipeFileNotFound) {
		t.Fatalf("want ErrRecipeFileNotFound, got %v", err)
	}
}

func specifier(value string) *kitfx.ResolvedSpecifier {
	spec := kitfx.ResolveSpecifier(value)

	return &spec
}

// A github-provider source sits at the root of the repository that the raw
// registry URL names, so a registry kept in .eser/ can point at pkg/... files
// of its repository (TASK-322). A local source stays relative to the base.
func TestApplyRecipe_GitHubProviderUsesTheRepositoryRoot(t *testing.T) {
	t.Parallel()

	seen := make(chan string, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.URL.Path

		switch r.URL.Path {
		case "/eser/stack/main/pkg/ajan/lib/doc.go":
			_, _ = w.Write([]byte("package lib\n"))
		case "/eser/stack/main/.eser/recipes/readme.md":
			_, _ = w.Write([]byte("# readme\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	recipe := &kitfx.Recipe{ //nolint:exhaustruct
		Name: "ajan-lib",
		Files: []kitfx.RecipeFile{
			{Source: "pkg/ajan/lib/doc.go", Target: "lib/doc.go", Provider: kitfx.RecipeFileProviderGitHub}, //nolint:exhaustruct
			{Source: "recipes/readme.md", Target: "README.md"},                                              //nolint:exhaustruct
		},
	}

	cwd := t.TempDir()
	_, err := kitfx.ApplyRecipe(context.Background(), recipe, kitfx.ApplyOptions{ //nolint:exhaustruct
		CWD:        cwd,
		SourceBase: server.URL + "/eser/stack/main/.eser",
		GitHub:     kitfx.GitHubEndpoints{Raw: server.URL}, //nolint:exhaustruct
		HTTPClient: server.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}

	for file, want := range map[string]string{"lib/doc.go": "package lib\n", "README.md": "# readme\n"} {
		got, err := os.ReadFile(filepath.Join(cwd, file)) //nolint:gosec // the test's own output
		if err != nil || string(got) != want {
			t.Errorf("%s: %q %v", file, got, err)
		}
	}

	_, err = kitfx.ApplyRecipe(context.Background(), recipe, kitfx.ApplyOptions{ //nolint:exhaustruct
		CWD:        t.TempDir(),
		SourceBase: "https://example.com/registry",
		GitHub:     kitfx.GitHubEndpoints{Raw: server.URL}, //nolint:exhaustruct
		HTTPClient: server.Client(),
	})
	if err == nil || !strings.Contains(err.Error(), "GitHub") {
		t.Errorf("a github source under a non-GitHub base: %v", err)
	}
}
