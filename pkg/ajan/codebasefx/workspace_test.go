// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx_test

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// workspaceFile is one file written into a test workspace, relative to its root.
type workspaceFile struct {
	path    string
	content string
}

// writeWorkspace writes files under a fresh temp directory and returns it.
func writeWorkspace(t *testing.T, files []workspaceFile) string {
	t.Helper()

	root := t.TempDir()

	for _, f := range files {
		full := filepath.Join(root, filepath.FromSlash(f.path))

		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatalf("create %s: %v", filepath.Dir(full), err)
		}

		if err := os.WriteFile(full, []byte(f.content), 0o644); err != nil {
			t.Fatalf("write %s: %v", full, err)
		}
	}

	return root
}

// member returns the package.json of a workspace member named name.
func member(dir, name string) workspaceFile {
	return workspaceFile{
		path:    dir + "/package.json",
		content: `{"name": "` + name + `", "version": "1.0.0"}`,
	}
}

// packageNames returns the names of the discovered packages in order.
func packageNames(packages []codebasefx.WorkspacePackage) []string {
	names := make([]string, 0, len(packages))
	for _, p := range packages {
		names = append(names, p.Name)
	}

	return names
}

func TestDiscoverWorkspacePackages(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		files []workspaceFile
		want  []string
	}{
		{
			name: "package.json workspaces glob",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/@scope/*"]}`},
				member("pkg/@scope/b", "@scope/b"),
				member("pkg/@scope/a", "@scope/a"),
				// A directory without a config and a plain file are not members.
				{path: "pkg/@scope/empty/README.md", content: "# empty\n"},
				{path: "pkg/@scope/notes.txt", content: "notes\n"},
				// A nested package is deeper than the glob reaches.
				member("pkg/@scope/a/fixtures/nested", "@scope/nested"),
			},
			want: []string{"@scope/a", "@scope/b"},
		},
		{
			name: "package.json workspaces object form",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": {"packages": ["libs/*"]}}`},
				member("libs/one", "one"),
			},
			want: []string{"one"},
		},
		{
			name: "deno.json workspace paths",
			files: []workspaceFile{
				{path: "deno.json", content: `{"workspace": ["./a", "./b"]}`},
				{path: "a/deno.json", content: `{"name": "@scope/a"}`},
				{path: "b/deno.json", content: `{"name": "@scope/b"}`},
			},
			want: []string{"@scope/a", "@scope/b"},
		},
		{
			name: "both root files merge without duplicates",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
				{path: "deno.json", content: `{"workspace": ["./pkg/a", "./tools"]}`},
				member("pkg/a", "a"),
				member("tools", "tools"),
			},
			want: []string{"a", "tools"},
		},
		{
			name: "double star matches at any depth",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["apps/**"]}`},
				member("apps/web", "web"),
				member("apps/group/api", "api"),
				member("apps/node_modules/dep", "dep"),
			},
			want: []string{"api", "web"},
		},
		{
			name: "negated pattern removes members",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["!pkg/b", "pkg/*"]}`},
				member("pkg/a", "a"),
				member("pkg/b", "b"),
			},
			want: []string{"a"},
		},
		{
			name: "deno.json name wins over package.json name",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
				{path: "pkg/a/deno.json", content: `{"name": "@jsr/a"}`},
				member("pkg/a", "@npm/a"),
			},
			want: []string{"@jsr/a"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := writeWorkspace(t, tc.files)

			packages, err := codebasefx.DiscoverWorkspacePackages(root)
			if err != nil {
				t.Fatalf("DiscoverWorkspacePackages: %v", err)
			}

			got := packageNames(packages)
			slices.Sort(got)

			if !slices.Equal(got, tc.want) {
				t.Errorf("DiscoverWorkspacePackages names = %q, want %q", got, tc.want)
			}

			for _, p := range packages {
				if !filepath.IsAbs(p.Path) {
					t.Errorf("package %q path %q is not absolute", p.Name, p.Path)
				}
			}
		})
	}
}

func TestDiscoverWorkspacePackages_NoMembers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		files []workspaceFile
	}{
		{name: "no root config"},
		{
			name:  "root deno.json without workspace",
			files: []workspaceFile{{path: "deno.json", content: `{"lock": false}`}},
		},
		{
			name:  "empty workspaces",
			files: []workspaceFile{{path: "package.json", content: `{"workspaces": []}`}},
		},
		{
			name:  "glob matches nothing",
			files: []workspaceFile{{path: "package.json", content: `{"workspaces": ["pkg/*"]}`}},
		},
		{
			name: "members without a name",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
				{path: "pkg/a/package.json", content: `{"version": "1.0.0"}`},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := writeWorkspace(t, tc.files)

			packages, err := codebasefx.DiscoverWorkspacePackages(root)
			if !errors.Is(err, codebasefx.ErrNoWorkspaceMembers) {
				t.Fatalf("DiscoverWorkspacePackages error = %v (packages %q), want ErrNoWorkspaceMembers",
					err, packageNames(packages))
			}
		})
	}
}

func TestDiscoverWorkspacePackages_Errors(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		files []workspaceFile
	}{
		{
			name:  "malformed root package.json",
			files: []workspaceFile{{path: "package.json", content: `{"workspaces": [`}},
		},
		{
			name: "malformed member package.json",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
				{path: "pkg/a/package.json", content: `{"name": `},
			},
		},
		{
			name: "malformed glob",
			files: []workspaceFile{
				{path: "package.json", content: `{"workspaces": ["pkg/[a"]}`},
				member("pkg/a", "a"),
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := writeWorkspace(t, tc.files)

			_, err := codebasefx.DiscoverWorkspacePackages(root)
			if err == nil {
				t.Fatal("DiscoverWorkspacePackages error = nil, want an error")
			}

			if errors.Is(err, codebasefx.ErrNoWorkspaceMembers) {
				t.Errorf("DiscoverWorkspacePackages error = %v, want a read or pattern error", err)
			}
		})
	}
}

// TestWorkspaceValidators_PackageJSONWorkspace runs every workspace validator
// on a workspace declared only in package.json, the layout this repository
// uses, and checks that each one sees its members.
func TestWorkspaceValidators_PackageJSONWorkspace(t *testing.T) {
	t.Parallel()

	root := writeWorkspace(t, []workspaceFile{
		{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
		{
			path:    "pkg/a/package.json",
			content: `{"name": "@scope/a", "dependencies": {"@scope/b": "workspace:*"}}`,
		},
		{
			path:    "pkg/b/package.json",
			content: `{"name": "@scope/b", "dependencies": {"@scope/a": "workspace:*"}}`,
		},
	})

	circular, err := codebasefx.CheckCircularDeps(root)
	if err != nil {
		t.Fatalf("CheckCircularDeps: %v", err)
	}

	if circular.PackagesChecked != 2 || !circular.HasCycles {
		t.Errorf("CheckCircularDeps = %d packages, cycles %v; want 2 packages and a cycle",
			circular.PackagesChecked, circular.HasCycles)
	}

	names, err := codebasefx.CheckExportNames(root, nil)
	if err != nil {
		t.Fatalf("CheckExportNames: %v", err)
	}

	if names.PackagesChecked != 2 {
		t.Errorf("CheckExportNames checked %d packages, want 2", names.PackagesChecked)
	}

	mods, err := codebasefx.CheckModExports(root)
	if err != nil {
		t.Fatalf("CheckModExports: %v", err)
	}

	if mods.PackagesChecked != 2 {
		t.Errorf("CheckModExports checked %d packages, want 2", mods.PackagesChecked)
	}

	configs, err := codebasefx.CheckPackageConfigs(root)
	if err != nil {
		t.Fatalf("CheckPackageConfigs: %v", err)
	}

	if configs.PackagesChecked != 2 {
		t.Errorf("CheckPackageConfigs checked %d packages, want 2", configs.PackagesChecked)
	}
}

func TestWorkspaceValidators_NoMembers(t *testing.T) {
	t.Parallel()

	root := writeWorkspace(t, []workspaceFile{
		{path: "package.json", content: `{"workspaces": ["pkg/*"]}`},
	})

	checks := []struct {
		name string
		run  func() error
	}{
		{"CheckCircularDeps", func() error { _, err := codebasefx.CheckCircularDeps(root); return err }},
		{"CheckExportNames", func() error { _, err := codebasefx.CheckExportNames(root, nil); return err }},
		{"CheckModExports", func() error { _, err := codebasefx.CheckModExports(root); return err }},
		{"CheckPackageConfigs", func() error { _, err := codebasefx.CheckPackageConfigs(root); return err }},
		{"CheckDocs", func() error { _, err := codebasefx.CheckDocs(root, false); return err }},
	}

	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			t.Parallel()

			if err := check.run(); !errors.Is(err, codebasefx.ErrNoWorkspaceMembers) {
				t.Errorf("%s error = %v, want ErrNoWorkspaceMembers", check.name, err)
			}
		})
	}
}
