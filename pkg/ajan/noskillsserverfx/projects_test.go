package noskillsserverfx

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newProjectsServer builds a Server with nothing wired but the data directory
// and the workspace root, which is all the project-registration path
// validation reads.
func newProjectsServer(t *testing.T, dataDir, workspaceRoot string) *Server {
	t.Helper()

	return &Server{config: &ServerConfig{DataDir: dataDir, WorkspaceRoot: workspaceRoot}} //nolint:exhaustruct
}

// realPath is what the daemon records after resolving symlinks. Test temp dirs
// live under a symlinked /var on macOS, so expectations must be resolved too.
func realPath(t *testing.T, path string) string {
	t.Helper()

	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatalf("EvalSymlinks(%q): %v", path, err)
	}

	return resolved
}

// TestValidateSlug pins the gate that keeps the explicit `slug` request field
// out of the DataDir/projects/<slug> path join.
func TestValidateSlug(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		slug    string
		wantErr bool
	}{
		{name: "simple", slug: "stack", wantErr: false},
		{name: "dashed", slug: "my-project", wantErr: false},
		{name: "digits", slug: "web2", wantErr: false},

		{name: "empty", slug: "", wantErr: true},
		{name: "parent traversal", slug: "../../../.ssh", wantErr: true},
		{name: "dot dot", slug: "..", wantErr: true},
		{name: "dot", slug: ".", wantErr: true},
		{name: "slash", slug: "a/b", wantErr: true},
		{name: "backslash", slug: `a\b`, wantErr: true},
		{name: "leading slash", slug: "/etc", wantErr: true},
		{name: "nul byte", slug: "ok\x00.evil", wantErr: true},
		{name: "uppercase", slug: "Stack", wantErr: true},
		{name: "leading dash", slug: "-stack", wantErr: true},
		{name: "trailing dash", slug: "stack-", wantErr: true},
		{name: "double dash", slug: "a--b", wantErr: true},
		{name: "space", slug: "my project", wantErr: true},
		{name: "too long", slug: strings.Repeat("a", maxSlugLen+1), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validateSlug(tt.slug)
			if tt.wantErr && err == nil {
				t.Fatalf("validateSlug(%q) = nil, want error", tt.slug)
			}

			if !tt.wantErr && err != nil {
				t.Fatalf("validateSlug(%q) = %v, want nil", tt.slug, err)
			}
		})
	}
}

// TestSlugifyOutputPassesValidateSlug guards the derived-slug path: tightening
// validateSlug must never start rejecting names the daemon derives itself.
func TestSlugifyOutputPassesValidateSlug(t *testing.T) {
	t.Parallel()

	names := []string{
		"stack", "My Project", "eser.stack", "../../etc", "..", "a_b_c",
		"repo.git", "Ünïcödé", "  spaced  ", "under_score-123",
	}

	for _, name := range names {
		slug := slugify(name)
		if slug == "" {
			continue // rejected earlier by the "could not derive slug" check
		}

		if err := validateSlug(slug); err != nil {
			t.Errorf("slugify(%q) = %q, which validateSlug rejects: %v", name, slug, err)
		}
	}
}

// TestContainsPath covers the "/base-evil" case that a strings.HasPrefix
// containment check gets wrong.
func TestContainsPath(t *testing.T) {
	t.Parallel()

	base := filepath.Join(string(filepath.Separator), "home", "u", "noskills")

	tests := []struct {
		name   string
		target string
		want   bool
	}{
		{name: "base itself", target: base, want: true},
		{name: "child", target: filepath.Join(base, "projects", "stack"), want: true},
		{name: "sibling with shared prefix", target: base + "-evil", want: false},
		{name: "parent", target: filepath.Dir(base), want: false},
		{name: "unrelated", target: filepath.Join(string(filepath.Separator), "etc"), want: false},
		{name: "traversal that escapes", target: filepath.Join(base, "..", "other"), want: false},
		{name: "traversal that returns", target: filepath.Join(base, "..", "noskills", "x"), want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := containsPath(base, tt.target)
			if err != nil {
				t.Fatalf("containsPath(%q, %q): %v", base, tt.target, err)
			}

			if got != tt.want {
				t.Fatalf("containsPath(%q, %q) = %v, want %v", base, tt.target, got, tt.want)
			}
		})
	}
}

func TestResolveWorkspacePath(t *testing.T) {
	t.Parallel()

	// The workspace root holds the data directory, as ~ holds ~/.noskills, so
	// the data-directory cases are refused for that reason and not as outside.
	root := t.TempDir()
	dataDir := filepath.Join(root, ".noskills")
	workspace := filepath.Join(root, "work", "app")
	outside := t.TempDir()

	for _, dir := range []string{filepath.Join(dataDir, "sessions"), workspace} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %q: %v", dir, err)
		}
	}

	file := filepath.Join(workspace, "file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}

	linkIn := filepath.Join(outside, "link-in")
	linkOut := filepath.Join(workspace, "link-out")

	for link, target := range map[string]string{linkIn: workspace, linkOut: outside} {
		if err := os.Symlink(target, link); err != nil {
			t.Fatalf("symlink: %v", err)
		}
	}

	srv := newProjectsServer(t, dataDir, root)

	tests := []struct {
		name    string
		path    string
		want    string
		wantErr error
	}{
		{name: "absolute dir", path: workspace, want: realPath(t, workspace), wantErr: nil},
		{name: "the root itself", path: root, want: realPath(t, root), wantErr: nil},
		{
			name: "symlink outside resolved to a target inside",
			path: linkIn,
			want: realPath(t, workspace), wantErr: nil,
		},
		{name: "relative", path: "relative/dir", want: "", wantErr: errPathRelative},
		{name: "dot relative", path: "../..", want: "", wantErr: errPathRelative},
		{name: "missing", path: filepath.Join(workspace, "nope"), want: "", wantErr: os.ErrNotExist},
		{name: "regular file", path: file, want: "", wantErr: errPathNotDir},
		{name: "data-dir itself", path: dataDir, want: "", wantErr: errPathInDataDir},
		{name: "inside data-dir", path: filepath.Join(dataDir, "sessions"), want: "", wantErr: errPathInDataDir},
		{name: "outside the root", path: outside, want: "", wantErr: errPathOutsideRoot},
		{name: "parent of the root", path: filepath.Dir(root), want: "", wantErr: errPathOutsideRoot},
		{
			name: "traversal that stays in the root",
			path: root + "/work/../work/app",
			want: realPath(t, workspace), wantErr: nil,
		},
		{
			// Both temporary directories share a parent, so this names outside.
			name: "traversal out of the root",
			path: workspace + "/../../../" + filepath.Base(outside),
			want: "", wantErr: errPathOutsideRoot,
		},
		{name: "symlink inside to a target outside", path: linkOut, want: "", wantErr: errPathOutsideRoot},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := srv.resolveWorkspacePath(tt.path)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("resolveWorkspacePath(%q) = (%q, %v), want error %v", tt.path, got, err, tt.wantErr)
				}

				return
			}

			if err != nil {
				t.Fatalf("resolveWorkspacePath(%q): %v", tt.path, err)
			}

			if got != tt.want {
				t.Fatalf("resolveWorkspacePath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

// TestResolveWorkspacePathRoots covers the root itself: unset, and inside the
// data directory, where no workspace under it can be registered.
func TestResolveWorkspacePathRoots(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	nested := filepath.Join(dataDir, "projects", "app")

	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	tests := []struct {
		name    string
		root    string
		wantErr error
	}{
		{name: "unset", root: "", wantErr: errNoWorkspaceRoot},
		{name: "inside the data directory", root: filepath.Join(dataDir, "projects"), wantErr: errPathInDataDir},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			srv := newProjectsServer(t, dataDir, tt.root)

			got, err := srv.resolveWorkspacePath(nested)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("resolveWorkspacePath(%q) = (%q, %v), want error %v", nested, got, err, tt.wantErr)
			}
		})
	}
}

// TestCloneDestinationStaysInProjectsDir checks the second gate directly, with
// slugs that validateSlug would have rejected first.
func TestCloneDestinationStaysInProjectsDir(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	srv := newProjectsServer(t, dataDir, "")

	base := filepath.Join(realPath(t, dataDir), "projects")

	dest, err := srv.cloneDestination("stack")
	if err != nil {
		t.Fatalf("cloneDestination: %v", err)
	}

	if dest != filepath.Join(base, "stack") {
		t.Fatalf("cloneDestination = %q, want %q", dest, filepath.Join(base, "stack"))
	}

	for _, slug := range []string{"../evil", "../../../.ssh", "..", "a/b"} {
		got, err := srv.cloneDestination(slug)
		if err == nil {
			t.Errorf("cloneDestination(%q) = %q, want error", slug, got)
		}
	}
}

func TestValidateGitURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{name: "https", url: "https://github.com/eser/stack.git", wantErr: false},
		{name: "ssh scheme", url: "ssh://git@github.com/eser/stack.git", wantErr: false},
		{name: "scp style", url: "git@github.com:eser/stack.git", wantErr: false},
		{name: "git protocol", url: "git://github.com/eser/stack.git", wantErr: false},
		{name: "ipv6 literal", url: "https://[::1]:8443/repo.git", wantErr: false},
		{name: "local path", url: "/srv/repos/stack.git", wantErr: false},
		{name: "file url", url: "file:///srv/repos/stack.git", wantErr: false},

		{name: "ext helper", url: "ext::sh -c id", wantErr: true},
		{name: "arbitrary helper", url: "transport::address", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validateGitURL(tt.url)
			if tt.wantErr && err == nil {
				t.Fatalf("validateGitURL(%q) = nil, want error", tt.url)
			}

			if !tt.wantErr && err != nil {
				t.Fatalf("validateGitURL(%q) = %v, want nil", tt.url, err)
			}
		})
	}
}
