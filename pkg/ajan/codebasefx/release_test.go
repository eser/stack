// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx_test

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

const repoRootFromCodebasefx = "../../.."

// git runs git in dir with a fixed identity.
func git(t *testing.T, dir string, args ...string) string {
	t.Helper()

	cmd := exec.Command("git", args...) //nolint:noctx
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Release Test", "GIT_AUTHOR_EMAIL=release@example.com",
		"GIT_COMMITTER_NAME=Release Test", "GIT_COMMITTER_EMAIL=release@example.com",
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}

	return strings.TrimSpace(string(out))
}

func writeFiles(t *testing.T, root string, files map[string]string) {
	t.Helper()

	for path, content := range files {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

// workspaceFixture is a small workspace at 1.2.3 with a lagging package.
var workspaceFixture = map[string]string{ //nolint:gochecknoglobals
	"VERSION":      "1.2.3\n",
	"package.json": `{"name":"@fixture/root","version":"1.2.3","private":true,"workspaces":["pkg/@fixture/*"],"scripts":{"a":"b"}}` + "\n",
	"deno.json":    "{\n  \"workspace\": [\"./pkg/@fixture/one\"],\n  \"lock\": false\n}\n",
	"pkg/@fixture/one/package.json": "{\n  \"name\": \"@fixture/one\",\n  \"version\": \"1.2.3\",\n  \"description\": \"Ünïcode, \\\"quotes\\\" & <tags>\",\n" +
		"  \"exports\": {\n    \".\": \"./mod.ts\"\n  },\n  \"files\": [],\n  \"dependencies\": {},\n  \"n\": 1.50\n}\n",
	"pkg/@fixture/one/deno.json":    `{"name":"@fixture/one","version":"1.2.3","exports":"./mod.ts"}`,
	"pkg/@fixture/two/package.json": "{\n  \"name\": \"@fixture/two\",\n  \"version\": \"1.2.0\"\n}\n",
	"pkg/@fixture/two/jsr.jsonc":    "{\n  // a comment\n  \"name\": \"@fixture/two\",\n  \"version\": \"1.2.0\"\n}\n",
	"pkg/@fixture/docs/README.md":   "no package config here\n",
	"CHANGELOG.md":                  "# Changelog\n\n## Unreleased\n\n## 1.2.3 - 2026-01-01\n\n### Added\n\n- **one:** the first release\n",
}

func readTree(t *testing.T, root string) map[string]string {
	t.Helper()

	files := map[string]string{}

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if entry.IsDir() && entry.Name() == ".git" {
			return filepath.SkipDir
		}

		if !entry.IsDir() {
			rel, _ := filepath.Rel(root, path)
			data, err := os.ReadFile(path) //nolint:gosec // the test's own fixture
			files[filepath.ToSlash(rel)] = string(data)

			return err
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return files
}

func denoOrSkip(t *testing.T) string {
	t.Helper()

	deno, err := exec.LookPath("deno")
	if err != nil {
		t.Skip("deno is not installed; the TypeScript comparison needs it")
	}

	return deno
}

// TestPlanVersionsMatchesTypeScript bumps the fixture with the TypeScript
// versions command and with PlanVersions, and compares the two trees.
func TestPlanVersionsMatchesTypeScript(t *testing.T) {
	t.Parallel()

	deno := denoOrSkip(t)

	repo, err := filepath.Abs(repoRootFromCodebasefx)
	if err != nil {
		t.Fatal(err)
	}

	for _, command := range []string{"patch", "minor", "sync"} {
		t.Run(command, func(t *testing.T) {
			t.Parallel()

			tsRoot, goRoot := t.TempDir(), t.TempDir()
			writeFiles(t, tsRoot, workspaceFixture)
			writeFiles(t, goRoot, workspaceFixture)

			cmd := exec.Command(deno, "run", "-A", "--config", filepath.Join(repo, "deno.json"), //nolint:gosec,noctx
				filepath.Join(repo, "pkg/@eserstack/codebase/versions.ts"), command)
			cmd.Dir = tsRoot

			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("TypeScript versions %s: %v: %s", command, err, out)
			}

			plan, err := codebasefx.PlanVersions(goRoot, codebasefx.VersionCommand(command), "")
			if err != nil {
				t.Fatal(err)
			}

			if err := codebasefx.ApplyEdits(goRoot, plan.Edits); err != nil {
				t.Fatal(err)
			}

			want, got := readTree(t, tsRoot), readTree(t, goRoot)
			for path, content := range want {
				if got[path] != content {
					t.Errorf("%s %s:\n--- TypeScript\n%s\n--- Go\n%s", command, path, content, got[path])
				}
			}
		})
	}
}

// changelogRepo is the fixture as a git repository tagged v1.2.3, with
// conventional commits after the tag.
func changelogRepo(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	writeFiles(t, root, workspaceFixture)
	git(t, root, "init", "-q", "-b", "main")
	git(t, root, "add", "-A")
	git(t, root, "commit", "-q", "-m", "chore: start")
	git(t, root, "tag", "-a", "v1.2.3", "-m", "Release v1.2.3")

	for i, message := range []string{
		"feat(one): add a very long feature description that keeps going and going well past the eighty column limit",
		"fix(two): handle `jsr.jsonc` comments when the version is bumped by the release command of the codebase",
		"docs: mention *emphasis* in a short entry",
		"chore: not in the changelog",
	} {
		writeFiles(t, root, map[string]string{"file" + string(rune('a'+i)) + ".txt": message})
		git(t, root, "add", "-A")
		git(t, root, "commit", "-q", "-m", message)
	}

	return root
}

// TestReleaseChangelogMatchesTypeScript compares the CHANGELOG.md a Go
// release plans with what the TypeScript release writes: its changelog-gen
// (the Go generator through the bridge) followed by deno fmt CHANGELOG.md.
func TestReleaseChangelogMatchesTypeScript(t *testing.T) {
	t.Parallel()

	deno := denoOrSkip(t)

	repo, err := filepath.Abs(repoRootFromCodebasefx)
	if err != nil {
		t.Fatal(err)
	}

	root := changelogRepo(t)

	plan, err := codebasefx.PlanRelease(context.Background(), &codebasefx.ReleaseEnv{Root: root}, "patch", true) //nolint:exhaustruct
	if err != nil {
		t.Fatal(err)
	}

	var goChangelog string

	for _, edit := range plan.Edits {
		if edit.Path == "CHANGELOG.md" {
			goChangelog = string(edit.After)
		}
	}

	gen := exec.Command(deno, "run", "-A", "--config", filepath.Join(repo, "deno.json"), //nolint:gosec,noctx
		filepath.Join(repo, "pkg/@eserstack/codebase/changelog-gen.ts"))
	gen.Dir = root

	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("TypeScript changelog-gen: %v: %s", err, out)
	}

	fmtCmd := exec.Command(deno, "fmt", "--quiet", "CHANGELOG.md") //nolint:gosec,noctx
	fmtCmd.Dir = root

	if out, err := fmtCmd.CombinedOutput(); err != nil {
		t.Fatalf("deno fmt: %v: %s", err, out)
	}

	tsChangelog, err := os.ReadFile(filepath.Join(root, "CHANGELOG.md")) //nolint:gosec // the test's own file
	if err != nil {
		t.Fatal(err)
	}

	if goChangelog != string(tsChangelog) {
		t.Errorf("CHANGELOG.md:\n--- TypeScript + deno fmt\n%s\n--- Go\n%s", tsChangelog, goChangelog)
	}

	if !strings.Contains(goChangelog, "## 1.2.4 - ") {
		t.Errorf("the 1.2.4 section is missing:\n%s", goChangelog)
	}
}

// releaseRepo is changelogRepo with a bare origin; the origin logs every ref
// update in the order it receives them.
func releaseRepo(t *testing.T) (string, string) {
	t.Helper()

	root := changelogRepo(t)
	origin := filepath.Join(t.TempDir(), "origin.git")
	git(t, root, "init", "-q", "--bare", origin)

	hook := filepath.Join(origin, "hooks", "reference-transaction")
	script := "#!/bin/sh\n[ \"$1\" = committed ] || exit 0\nwhile read old new ref; do echo \"$ref\" >> \"$GIT_DIR/ref-order.log\"; done\n"

	if err := os.WriteFile(hook, []byte(script), 0o755); err != nil { //nolint:gosec // G306: a git hook
		t.Fatal(err)
	}

	git(t, root, "remote", "add", "origin", origin)
	git(t, root, "push", "-q", "-u", "origin", "main")
	_ = os.Remove(filepath.Join(origin, "ref-order.log"))

	return root, origin
}

// TestReleaseContract ports release-contract.test.ts to a real run: the
// commit stages exactly the version-bearing paths and no generated deno.json,
// its message is "chore(codebase): release v<version>", and the commit
// reaches the remote before the tag.
func TestReleaseContract(t *testing.T) {
	t.Parallel()

	root, origin := releaseRepo(t)
	env := &codebasefx.ReleaseEnv{Root: root} //nolint:exhaustruct

	// The generated per-package deno.json files are gitignored in the repo.
	writeFiles(t, root, map[string]string{".gitignore": "/pkg/*/*/deno.json\n"})
	git(t, root, "rm", "-q", "--cached", "pkg/@fixture/one/deno.json")
	git(t, root, "add", ".gitignore")
	git(t, root, "commit", "-q", "-m", "chore: ignore generated manifests")
	git(t, root, "push", "-q")
	_ = os.Remove(filepath.Join(origin, "ref-order.log"))

	plan, err := codebasefx.PlanRelease(context.Background(), env, "patch", false)
	if err != nil {
		t.Fatal(err)
	}

	if err := codebasefx.ExecuteRelease(context.Background(), env, plan); err != nil {
		t.Fatal(err)
	}

	if msg := git(t, root, "log", "-1", "--format=%s"); msg != "chore(codebase): release v1.2.4" {
		t.Errorf("commit message %q", msg)
	}

	files := strings.Fields(git(t, root, "show", "--name-only", "--format=", "HEAD"))
	// The root deno.json's workspace list (one package) takes priority over
	// package.json's, as in the TypeScript loader, so @fixture/two keeps 1.2.0.
	want := []string{"CHANGELOG.md", "VERSION", "package.json", "pkg/@fixture/one/package.json"}

	if strings.Join(files, ",") != strings.Join(want, ",") {
		t.Errorf("committed %v, want %v", files, want)
	}

	if git(t, root, "status", "--porcelain") != "" {
		// The generated deno.json was updated on disk but stays ignored.
		t.Errorf("the release left changes: %s", git(t, root, "status", "--porcelain"))
	}

	order, err := os.ReadFile(filepath.Join(origin, "ref-order.log")) //nolint:gosec // the test's own file
	if err != nil {
		t.Fatal(err)
	}

	if got := strings.Fields(string(order)); strings.Join(got, ",") != "refs/heads/main,refs/tags/v1.2.4" {
		t.Errorf("the remote received %v; the commit must come before the tag", got)
	}

	if tagged := git(t, origin, "rev-parse", "v1.2.4^{}"); tagged != git(t, root, "rev-parse", "HEAD") {
		t.Errorf("the tag points at %s, not the release commit", tagged)
	}
}

func TestReleaseRefusesDirtyAndUnpushed(t *testing.T) {
	t.Parallel()

	root, _ := releaseRepo(t)
	env := &codebasefx.ReleaseEnv{Root: root} //nolint:exhaustruct

	writeFiles(t, root, map[string]string{"dirty.txt": "x"})

	if _, err := codebasefx.PlanRelease(context.Background(), env, "patch", false); !errors.Is(err, codebasefx.ErrDirtyTree) {
		t.Errorf("a dirty tree: %v", err)
	}

	git(t, root, "add", "dirty.txt")
	git(t, root, "commit", "-q", "-m", "feat: unpushed work")

	if _, err := codebasefx.PlanRelease(context.Background(), env, "patch", false); !errors.Is(err, codebasefx.ErrUnpushedCommits) {
		t.Errorf("unpushed commits: %v", err)
	}

	if _, err := codebasefx.PlanRelease(context.Background(), env, "patch", true); err != nil {
		t.Errorf("--yes allows unpushed commits: %v", err)
	}
}

func TestRereleaseAndUnrelease(t *testing.T) {
	t.Parallel()

	root, origin := releaseRepo(t)

	var ghCalls []string

	env := &codebasefx.ReleaseEnv{ //nolint:exhaustruct
		Root: root,
		GH: func(_ context.Context, args ...string) (string, error) {
			// The GitHub Release goes first, while the tag still exists.
			ghCalls = append(ghCalls, strings.Join(args, " ")+" tag-present="+git(t, root, "tag", "-l", "v1.2.3"))

			return "", nil
		},
	}

	tag, err := codebasefx.Rerelease(context.Background(), env, false)
	if err != nil || tag != "v1.2.3" {
		t.Fatalf("rerelease: %q, %v", tag, err)
	}

	if git(t, origin, "rev-parse", "v1.2.3^{}") != git(t, root, "rev-parse", "HEAD") {
		t.Error("rerelease should move the tag to HEAD")
	}

	if _, _, err := codebasefx.Unrelease(context.Background(), env, false); !errors.Is(err, codebasefx.ErrUnconfirmed) {
		t.Errorf("an unconfirmed unrelease: %v", err)
	}

	tag, deleted, err := codebasefx.Unrelease(context.Background(), env, true)
	if err != nil || tag != "v1.2.3" || !deleted {
		t.Fatalf("unrelease: %q %v %v", tag, deleted, err)
	}

	if len(ghCalls) != 1 || ghCalls[0] != "release delete v1.2.3 --yes tag-present=v1.2.3" {
		t.Errorf("gh calls %v", ghCalls)
	}

	if git(t, root, "tag", "-l", "v1.2.3") != "" || git(t, origin, "tag", "-l", "v1.2.3") != "" {
		t.Error("the tag should be gone locally and on the remote")
	}
}

func TestSyncReleaseNotes(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFiles(t, root, map[string]string{"CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n## 1.2.4 - 2026-02-02\n\n### Fixed\n\n- a fix\n\n## [v1.2.3] - 2026-01-01\n\n- first\n"})

	var calls []string

	exists := false
	env := &codebasefx.ReleaseEnv{ //nolint:exhaustruct
		Root: root,
		GH: func(_ context.Context, args ...string) (string, error) {
			if len(args) > 4 && args[len(args)-2] == "--notes-file" {
				notes, _ := os.ReadFile(args[len(args)-1])
				calls = append(calls, args[1]+" "+args[2]+": "+string(notes))
			}

			if args[1] == "view" && !exists {
				return "", errors.New("not found") //nolint:err113
			}

			return "", nil
		},
	}

	tag, action, err := codebasefx.SyncReleaseNotes(context.Background(), env, "eser/stack", "", false, "")
	if err != nil || tag != "v1.2.4" || action != "skipped" {
		t.Errorf("no release, no create: %q %q %v", tag, action, err)
	}

	tag, action, err = codebasefx.SyncReleaseNotes(context.Background(), env, "eser/stack", "1.2.3", true, "")
	if err != nil || tag != "v1.2.3" || action != "created" || calls[0] != "create v1.2.3: ## 1.2.3 - 2026-01-01\n\n- first\n" {
		t.Errorf("create: %q %q %v %q", tag, action, err, calls)
	}

	exists = true

	if _, action, err := codebasefx.SyncReleaseNotes(context.Background(), env, "eser/stack", "v1.2.4", false, ""); err != nil || action != "updated" {
		t.Errorf("update: %q %v", action, err)
	}
}

func TestUpdateContributors(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	readme := filepath.Join(root, "README.md")
	writeFiles(t, root, map[string]string{"README.md": "# x\n\n" + codebasefx.ContributorsStart + "\nold\n" + codebasefx.ContributorsEnd + "\n"})

	page := func(logins ...string) string {
		list := make([]map[string]string, 0, len(logins))
		for _, login := range logins {
			list = append(list, map[string]string{"login": login, "html_url": "https://github.com/" + login, "avatar_url": "https://a/" + login})
		}

		data, _ := json.Marshal(list)

		return string(data)
	}

	env := &codebasefx.ReleaseEnv{ //nolint:exhaustruct
		Root: root,
		GH: func(_ context.Context, args ...string) (string, error) {
			if args[0] == "repo" {
				return `{"owner":{"login":"eser"},"name":"stack"}`, nil
			}

			// --paginate writes one array per page, back to back.
			return page("ada", "dependabot[bot]") + "\n" + page("bob"), nil
		},
	}

	count, changed, err := codebasefx.UpdateContributors(context.Background(), env, readme, 8, false)
	if err != nil || count != 2 || !changed {
		t.Fatalf("contributors: %d %v %v", count, changed, err)
	}

	got, _ := os.ReadFile(readme) //nolint:gosec // the test's own file
	if !strings.Contains(string(got), "<sub>ada</sub>") || !strings.Contains(string(got), "<sub>bob</sub>") || strings.Contains(string(got), "old") {
		t.Errorf("README:\n%s", got)
	}

	if _, changed, _ := codebasefx.UpdateContributors(context.Background(), env, readme, 8, false); changed {
		t.Error("a second run should change nothing")
	}
}

func TestParseChangelogText(t *testing.T) {
	t.Parallel()

	entries := codebasefx.ParseChangelogText("# C\n\n## Unreleased\n\nx\n\n## 2.0.0 - 2026-02-02\n\n- b\n\n\n## [v1.0.0]\n\n- a\n")
	if len(entries) != 2 || entries[0].Tag != "v2.0.0" || entries[0].Notes != "## 2.0.0 - 2026-02-02\n\n- b\n" ||
		entries[1].Version != "1.0.0" || entries[1].Date != "" || entries[1].Notes != "## 1.0.0\n\n- a\n" {
		t.Errorf("entries %+v", entries)
	}

	if codebasefx.NormalizeTag(" refs/tags/1.0.0 ") != "v1.0.0" || codebasefx.NormalizeTag("v2") != "v2" {
		t.Error("NormalizeTag")
	}
}
