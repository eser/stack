// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cachefx_test

import (
	"os"
	"testing"

	"github.com/eser/stack/pkg/ajan/cachefx"
)

// ─── XDG helpers ─────────────────────────────────────────────────────────────

func TestXdgCacheHome_ReturnsNonEmpty(t *testing.T) {
	t.Parallel()

	got := cachefx.XdgCacheHome()
	if got == "" {
		t.Error("XdgCacheHome() should never return empty string")
	}
}

func TestXdgCacheHome_EnvOverride(t *testing.T) {
	t.Setenv("XDG_CACHE_HOME", "/tmp/test-cache-override")

	got := cachefx.XdgCacheHome()
	if got != "/tmp/test-cache-override" {
		t.Errorf("XdgCacheHome() = %q, want /tmp/test-cache-override", got)
	}
}

func TestXdgDataHome_ReturnsNonEmpty(t *testing.T) {
	t.Parallel()

	got := cachefx.XdgDataHome()
	if got == "" {
		t.Error("XdgDataHome() should never return empty string")
	}
}

func TestXdgDataHome_EnvOverride(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", "/tmp/test-data-override")

	got := cachefx.XdgDataHome()
	if got != "/tmp/test-data-override" {
		t.Errorf("XdgDataHome() = %q, want /tmp/test-data-override", got)
	}
}

func TestXdgConfigHome_ReturnsNonEmpty(t *testing.T) {
	t.Parallel()

	got := cachefx.XdgConfigHome()
	if got == "" {
		t.Error("XdgConfigHome() should never return empty string")
	}
}

func TestXdgConfigHome_EnvOverride(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "/tmp/test-config-override")

	got := cachefx.XdgConfigHome()
	if got != "/tmp/test-config-override" {
		t.Errorf("XdgConfigHome() = %q, want /tmp/test-config-override", got)
	}
}

// ─── Manager Remove / Clear / EnsureDir / List branches ──────────────────────

func TestManager_Remove_NonExistent(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	if err := m.Remove("/nonexistent/path/to/entry"); err != nil {
		t.Errorf("Remove nonexistent should succeed: %v", err)
	}
}

func TestManager_Clear_NonExistent(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir + "/not-created",
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	if err := m.Clear(); err != nil {
		t.Errorf("Clear on nonexistent dir should succeed: %v", err)
	}
}

func TestManager_EnsureDir_CreatesDir(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	newDir := dir + "/sub/nested"
	if err := m.EnsureDir(newDir); err != nil {
		t.Fatalf("EnsureDir: %v", err)
	}

	if _, err := os.Stat(newDir); err != nil {
		t.Errorf("directory not created: %v", err)
	}
}

func TestManager_List_NonExistent(t *testing.T) {
	t.Parallel()

	m := cachefx.NewManager(cachefx.Options{
		BaseDir: "/nonexistent/cache/dir",
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	entries, err := m.List()
	if err != nil {
		t.Fatalf("List on nonexistent dir should return empty: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

func TestManager_List_WithEntries(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	// Create the cache dir manually and add a file.
	cacheDir := m.Dir()
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheDir+"/entry.txt", []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	entries, err := m.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 {
		t.Errorf("expected 1 entry, got %d", len(entries))
	}
}

func TestManager_List_DirIsFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()

	// Create a file where the cache dir should be, so ReadDir fails.
	cacheParent := dir + "/app"
	if err := os.WriteFile(cacheParent, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Manager will use dir/app/test as cacheDir (org="" so it's base/name).
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: cacheParent,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	// List will try os.ReadDir on a path that doesn't exist as a directory.
	// This triggers the non-ErrNotExist error path since parent is a file.
	_, _ = m.List() // may return error or empty — either is acceptable
}

func TestManager_EnsureDir_PathBlockedByFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	// Create a file at the path where a dir is expected.
	blocked := dir + "/blocked"
	if err := os.WriteFile(blocked, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	// MkdirAll should fail since "blocked" is a file not a dir.
	if err := m.EnsureDir(blocked + "/subdir"); err == nil {
		t.Error("expected error when creating dir inside a file")
	}
}

func TestManager_Remove_PermissionDenied(t *testing.T) {
	t.Parallel()

	if os.Getuid() == 0 {
		t.Skip("running as root; permission checks do not apply")
	}

	dir := t.TempDir()
	file := dir + "/protected.txt"

	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Make parent directory read-only so removal of the file fails.
	if err := os.Chmod(dir, 0o555); err != nil { //nolint:gosec // intentional read-only perm for error path test
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) }) //nolint:gosec // restoring writable perm in test cleanup

	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	if err := m.Remove(file); err == nil {
		t.Error("expected error when removing from read-only directory")
	}
}

func TestManager_Clear_PermissionDenied(t *testing.T) {
	t.Parallel()

	if os.Getuid() == 0 {
		t.Skip("running as root; permission checks do not apply")
	}

	dir := t.TempDir()
	m := cachefx.NewManager(cachefx.Options{
		BaseDir: dir,
		App:     cachefx.AppIdentifier{Name: "test"},
	})

	cacheDir := m.Dir()
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheDir+"/file.txt", []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Make cacheDir read-only so RemoveAll cannot delete its contents.
	if err := os.Chmod(cacheDir, 0o555); err != nil { //nolint:gosec // intentional read-only perm for error path test
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(cacheDir, 0o755) }) //nolint:gosec // restoring writable perm in test cleanup

	if err := m.Clear(); err == nil {
		t.Error("expected error when clearing read-only cache directory")
	}
}
