// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cachefx_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/cachefx"
)

// The fixtures in testdata/ are shared with the TypeScript tests of
// @eserstack/cache, which run the same cases through the bridge.

type fixtureHost struct {
	Env      map[string]string `json:"env"`
	Platform string            `json:"platform"`
	Home     string            `json:"home"`
}

func (f fixtureHost) host() *cachefx.Host {
	return &cachefx.Host{
		Getenv: func(key string) string { return f.Env[key] },
		OS:     f.Platform,
		Home:   filepath.FromSlash(f.Home),
	}
}

type xdgHomesCase struct {
	Name       string      `json:"name"`
	CacheHome  string      `json:"cacheHome"`
	DataHome   string      `json:"dataHome"`
	ConfigHome string      `json:"configHome"`
	Host       fixtureHost `json:"host"`
}

type appPathsCase struct {
	App struct {
		Org  string `json:"org"`
		Name string `json:"name"`
	} `json:"app"`
	Name          string      `json:"name"`
	BaseDir       string      `json:"baseDir"`
	Version       string      `json:"version"`
	Item          string      `json:"item"`
	AppDir        string      `json:"appDir"`
	VersionedPath string      `json:"versionedPath"`
	Host          fixtureHost `json:"host"`
}

type pathWant struct {
	Path string `json:"path"`
	Want bool   `json:"want"`
}

type managerPathsFixture struct {
	Files       []string   `json:"files"`
	Dirs        []string   `json:"dirs"`
	Exists      []pathWant `json:"exists"`
	EnsureDir   []string   `json:"ensureDir"`
	Remove      []string   `json:"remove"`
	AfterRemove []pathWant `json:"afterRemove"`
}

func readFixture[T any](t *testing.T, name string) T {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join("testdata", name)) //nolint:gosec // the names are constants of this file
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}

	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode fixture %s: %v", name, err)
	}

	return out
}

// osPath turns a fixture path, written with slashes, into this OS's form. A
// value that comes from an environment variable is returned as it is, so it
// only differs from the fixture on Windows for joined paths.
func osPath(p string) string { return filepath.FromSlash(p) }

func TestHostHomesFixture(t *testing.T) {
	t.Parallel()

	for _, tc := range readFixture[[]xdgHomesCase](t, "xdg_homes.json") {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			host := tc.Host.host()
			checks := []struct{ label, got, want string }{
				{"CacheHome", host.CacheHome(), tc.CacheHome},
				{"DataHome", host.DataHome(), tc.DataHome},
				{"ConfigHome", host.ConfigHome(), tc.ConfigHome},
			}

			for _, c := range checks {
				if filepath.ToSlash(c.got) != c.want {
					t.Errorf("%s() = %q, want %q", c.label, c.got, c.want)
				}
			}
		})
	}
}

func TestAppPathsFixture(t *testing.T) {
	t.Parallel()

	for _, tc := range readFixture[[]appPathsCase](t, "app_paths.json") {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			m := cachefx.NewManager(cachefx.Options{
				Host:    tc.Host.host(),
				App:     cachefx.AppIdentifier{Org: tc.App.Org, Name: tc.App.Name},
				BaseDir: osPath(tc.BaseDir),
			})

			if got := filepath.ToSlash(m.Dir()); got != tc.AppDir {
				t.Errorf("Dir() = %q, want %q", got, tc.AppDir)
			}

			got := filepath.ToSlash(m.VersionedPath(tc.Version, tc.Item))
			if got != tc.VersionedPath {
				t.Errorf("VersionedPath(%q, %q) = %q, want %q", tc.Version, tc.Item, got, tc.VersionedPath)
			}
		})
	}
}

func TestManagerPathsFixture(t *testing.T) {
	t.Parallel()

	fx := readFixture[managerPathsFixture](t, "manager_paths.json")
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: t.TempDir(),
		App:     cachefx.AppIdentifier{Org: "fixture", Name: "manager"},
	})

	for _, dir := range fx.Dirs {
		if err := os.MkdirAll(filepath.Join(m.Dir(), osPath(dir)), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	for _, file := range fx.Files {
		path := filepath.Join(m.Dir(), osPath(file))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	check := func(stage string, wants []pathWant) {
		t.Helper()

		for _, w := range wants {
			if got := m.Exists(w.Path); got != w.Want {
				t.Errorf("%s: Exists(%q) = %v, want %v", stage, w.Path, got, w.Want)
			}
		}
	}

	check("before", fx.Exists)

	for _, dir := range fx.EnsureDir {
		if err := m.EnsureDir(dir); err != nil {
			t.Fatalf("EnsureDir(%q): %v", dir, err)
		}

		if !m.Exists(dir) {
			t.Errorf("Exists(%q) = false after EnsureDir", dir)
		}
	}

	for _, path := range fx.Remove {
		if err := m.Remove(path); err != nil {
			t.Fatalf("Remove(%q): %v", path, err)
		}
	}

	check("after remove", fx.AfterRemove)
}

func TestManagerResolve(t *testing.T) {
	t.Parallel()

	base := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: base,
		App:     cachefx.AppIdentifier{Name: "app"},
	})

	cases := []struct {
		name string
		in   string
		want string
	}{
		{"relative joins the cache dir", "a/b", filepath.Join(base, "app", "a", "b")},
		{"absolute stays", filepath.Join(base, "elsewhere"), filepath.Join(base, "elsewhere")},
		{"empty is the cache dir", "", filepath.Join(base, "app")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := m.Resolve(tc.in); got != tc.want {
				t.Errorf("Resolve(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestHostWithoutGetenvReadsNothing(t *testing.T) {
	t.Parallel()

	host := cachefx.Host{OS: "linux", Home: "/home/user"} //nolint:exhaustruct // nil Getenv is the case under test
	if got := filepath.ToSlash(host.CacheHome()); got != "/home/user/.cache" {
		t.Errorf("CacheHome() = %q, want /home/user/.cache", got)
	}
}
