// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func gitIn(t *testing.T, dir string, args ...string) {
	t.Helper()

	cmd := exec.Command("git", args...) //nolint:noctx
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=T", "GIT_AUTHOR_EMAIL=t@example.com", "GIT_COMMITTER_NAME=T", "GIT_COMMITTER_EMAIL=t@example.com")

	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
}

func TestCodebaseReleaseDryRunAndVersions(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	files := map[string]string{
		"VERSION":            "4.5.2\n",
		"package.json":       "{\n  \"name\": \"root\",\n  \"version\": \"4.5.2\",\n  \"workspaces\": [\"pkg/*\"]\n}\n",
		"pkg/a/package.json": "{\n  \"name\": \"a\",\n  \"version\": \"4.5.2\"\n}\n",
		"CHANGELOG.md":       "# Changelog\n\n## 4.5.2 - 2026-09-17\n\n- first\n",
		".eser/manifest.yml": "scripts: {}\n",
	}

	for path, content := range files {
		full := filepath.Join(e.cwd, path)
		_ = os.MkdirAll(filepath.Dir(full), 0o750)

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	gitIn(t, e.cwd, "init", "-q", "-b", "main")
	gitIn(t, e.cwd, "add", "-A")
	gitIn(t, e.cwd, "commit", "-q", "-m", "chore: start")
	gitIn(t, e.cwd, "tag", "-a", "v4.5.2", "-m", "Release v4.5.2")
	gitIn(t, e.cwd, "commit", "-q", "--allow-empty", "-m", "fix(a): repair the thing")

	if code := run(context.Background(), e, []string{"codebase", "release", "patch", "--dry-run"}); code != 0 {
		t.Fatalf("release --dry-run: exit %d: %s", code, e.stderr)
	}

	out := e.stdout.(*bytes.Buffer).String() //nolint:forcetypeassert
	for _, want := range []string{
		"Release v4.5.3 (from 4.5.2), 1 changelog entry",
		"~ VERSION\n  - 4.5.2\n  + 4.5.3\n",
		"~ pkg/a/package.json",
		"~ CHANGELOG.md",
		"+ - **a**: repair the thing",
		`Would commit "chore(codebase): release v4.5.3", push it, and push v4.5.3.`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("dry run output should contain %q:\n%s", want, out)
		}
	}

	if got, _ := os.ReadFile(filepath.Join(e.cwd, "VERSION")); string(got) != "4.5.2\n" { //nolint:gosec // the test's own file
		t.Errorf("a dry run wrote VERSION: %q", got)
	}

	e.stdout = &bytes.Buffer{}
	if code := run(context.Background(), e, []string{"codebase", "versions"}); code != 0 || !strings.Contains(e.stdout.(*bytes.Buffer).String(), "a") { //nolint:forcetypeassert
		t.Errorf("versions: exit %d: %s", code, e.stdout)
	}

	if code := run(context.Background(), e, []string{"codebase", "release", "bogus"}); code == 0 {
		t.Error("an unknown release type should fail")
	}
}
