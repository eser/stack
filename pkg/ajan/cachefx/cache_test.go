// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cachefx_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/cachefx"
)

func TestNewManagerDir(t *testing.T) {
	t.Parallel()

	t.Run("uses BaseDir when provided", func(t *testing.T) {
		t.Parallel()

		m := cachefx.NewManager(cachefx.Options{
			BaseDir: "/tmp/testcache",
			App:     cachefx.AppIdentifier{Name: "myapp"},
		})

		if m.Dir() != "/tmp/testcache/myapp" {
			t.Errorf("Dir() = %q, want %q", m.Dir(), "/tmp/testcache/myapp")
		}
	})

	t.Run("includes Org prefix when set", func(t *testing.T) {
		t.Parallel()

		m := cachefx.NewManager(cachefx.Options{
			BaseDir: "/tmp/testcache",
			App:     cachefx.AppIdentifier{Org: "eser", Name: "ajan"},
		})

		want := "/tmp/testcache/eser/ajan"
		if m.Dir() != want {
			t.Errorf("Dir() = %q, want %q", m.Dir(), want)
		}
	})

	t.Run("falls back to XDG cache home when BaseDir empty", func(t *testing.T) {
		t.Parallel()

		m := cachefx.NewManager(cachefx.Options{
			App: cachefx.AppIdentifier{Name: "myapp"},
		})

		// Should end with /myapp and be non-empty.
		if !strings.HasSuffix(m.Dir(), string(filepath.Separator)+"myapp") {
			t.Errorf("Dir() = %q, expected suffix /myapp", m.Dir())
		}
	})
}

func TestVersionedPath(t *testing.T) {
	t.Parallel()

	m := cachefx.NewManager(cachefx.Options{
		BaseDir: "/cache",
		App:     cachefx.AppIdentifier{Name: "app"},
	})

	cases := []struct {
		version  string
		name     string
		expected string
	}{
		{"1.2.3", "pkg.tar.gz", "/cache/app/v1.2.3/pkg.tar.gz"},
		{"v1.2.3", "pkg.tar.gz", "/cache/app/v1.2.3/pkg.tar.gz"}, // v prefix normalised
		{"0.0.1", "data", "/cache/app/v0.0.1/data"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.version+"/"+tc.name, func(t *testing.T) {
			t.Parallel()

			got := m.VersionedPath(tc.version, tc.name)
			if got != tc.expected {
				t.Errorf("VersionedPath(%q, %q) = %q, want %q", tc.version, tc.name, got, tc.expected)
			}
		})
	}
}

func TestListEmptyDir(t *testing.T) {
	t.Parallel()

	m := cachefx.NewManager(cachefx.Options{
		BaseDir: "/nonexistent-base-dir-xyz",
		App:     cachefx.AppIdentifier{Name: "app"},
	})

	entries, err := m.List()
	if err != nil {
		t.Fatalf("unexpected error listing non-existent dir: %v", err)
	}

	if len(entries) != 0 {
		t.Errorf("expected empty slice, got %d entries", len(entries))
	}
}

func TestExistsEnsureDirRemoveClear(t *testing.T) {
	t.Parallel()

	tmp := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: tmp,
		App:     cachefx.AppIdentifier{Name: "testapp"},
	})

	cacheDir := m.Dir()

	t.Run("Exists returns false for missing dir", func(t *testing.T) {
		if m.Exists(cacheDir) {
			t.Error("expected Exists=false before EnsureDir")
		}
	})

	t.Run("EnsureDir creates directory", func(t *testing.T) {
		if err := m.EnsureDir(cacheDir); err != nil {
			t.Fatalf("EnsureDir: %v", err)
		}

		if !m.Exists(cacheDir) {
			t.Error("expected Exists=true after EnsureDir")
		}
	})

	t.Run("List returns created entry after file write", func(t *testing.T) {
		if err := os.WriteFile(filepath.Join(cacheDir, "foo.txt"), []byte("hi"), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}

		entries, err := m.List()
		if err != nil {
			t.Fatalf("List: %v", err)
		}

		if len(entries) != 1 || entries[0].Name != "foo.txt" {
			t.Errorf("expected 1 entry 'foo.txt', got %v", entries)
		}
	})

	t.Run("Remove deletes specific file", func(t *testing.T) {
		if err := m.Remove(filepath.Join(cacheDir, "foo.txt")); err != nil {
			t.Fatalf("Remove: %v", err)
		}

		entries, _ := m.List()
		if len(entries) != 0 {
			t.Errorf("expected empty after Remove, got %d entries", len(entries))
		}
	})

	t.Run("Clear removes entire cache dir", func(t *testing.T) {
		_ = os.WriteFile(filepath.Join(cacheDir, "bar.txt"), []byte("bye"), 0o644)

		if err := m.Clear(); err != nil {
			t.Fatalf("Clear: %v", err)
		}

		if m.Exists(cacheDir) {
			t.Error("cache dir should not exist after Clear")
		}
	})
}

func TestXdgCacheHome(t *testing.T) {
	// t.Setenv is incompatible with t.Parallel — runs serially.
	// Env override must take precedence.
	t.Setenv("XDG_CACHE_HOME", "/custom/cache")

	got := cachefx.XdgCacheHome()
	if got != "/custom/cache" {
		t.Errorf("XdgCacheHome() = %q, want %q", got, "/custom/cache")
	}
}
