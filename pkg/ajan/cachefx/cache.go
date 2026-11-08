// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package cachefx

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// ErrNotFound is returned when a requested cache entry does not exist.
var ErrNotFound = errors.New("cache entry not found")

// AppIdentifier uniquely identifies an application for cache namespacing.
type AppIdentifier struct {
	// Org is an optional organisation or vendor prefix (e.g. "eser").
	Org string
	// Name is the required application name (e.g. "ajan").
	Name string
}

// Options configures a new Manager.
type Options struct {
	// Host supplies the cache home when BaseDir is empty; nil stands for
	// CurrentHost().
	Host *Host
	App  AppIdentifier
	// BaseDir overrides the cache home of Host.
	BaseDir string
}

// Entry describes a single item in the cache directory.
type Entry struct {
	Path        string
	Name        string
	MtimeUnix   int64
	Size        int64
	IsDirectory bool
}

// Manager provides cache directory operations scoped to a single application.
type Manager struct {
	cacheDir string
}

// NewManager returns a Manager whose cache dir is rooted under BaseDir (or the
// cache home of Host when BaseDir is empty), namespaced by Org and Name.
func NewManager(opts Options) *Manager {
	base := opts.BaseDir
	if base == "" {
		host := CurrentHost()
		if opts.Host != nil {
			host = *opts.Host
		}

		base = host.CacheHome()
	}

	return &Manager{cacheDir: AppDir(base, opts.App)}
}

// AppDir returns the directory of app under base: base/org/name, or
// base/name when app has no Org.
func AppDir(base string, app AppIdentifier) string {
	if app.Org != "" {
		return filepath.Join(base, app.Org, app.Name)
	}

	return filepath.Join(base, app.Name)
}

// VersionedPath returns the path of the named artefact for a version under
// dir: dir/v<version>/name. A leading "v" is normalised, so "1.0.0" and
// "v1.0.0" resolve to the same path.
func VersionedPath(dir, version, name string) string {
	v := "v" + strings.TrimPrefix(version, "v")

	return filepath.Join(dir, v, name)
}

// Dir returns the absolute path to the application cache directory.
func (m *Manager) Dir() string { return m.cacheDir }

// VersionedPath returns the path for a named artefact under a semver version;
// see the package function VersionedPath.
func (m *Manager) VersionedPath(version, name string) string {
	return VersionedPath(m.cacheDir, version, name)
}

// Resolve returns path as it is when it is absolute, and joined to the cache
// directory otherwise.
func (m *Manager) Resolve(path string) string {
	if filepath.IsAbs(path) {
		return path
	}

	return filepath.Join(m.cacheDir, path)
}

// Exists reports whether path, resolved as Resolve does, can be stat'ed. A
// path that cannot be reached, for lack of permission for one, counts as
// missing.
func (m *Manager) Exists(path string) bool {
	_, err := os.Stat(m.Resolve(path))

	return err == nil
}

// EnsureDir creates path, resolved as Resolve does, and all parents if they do
// not already exist.
func (m *Manager) EnsureDir(path string) error {
	resolved := m.Resolve(path)
	if err := os.MkdirAll(resolved, 0o755); err != nil { //nolint:gosec // directory creation
		return fmt.Errorf("ensure dir %q: %w", resolved, err)
	}

	return nil
}

// List returns all top-level entries inside the cache directory.
// Returns an empty slice (not an error) when the cache directory does not exist.
func (m *Manager) List() ([]Entry, error) {
	dirEntries, err := os.ReadDir(m.cacheDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []Entry{}, nil
		}

		return nil, fmt.Errorf("list cache %q: %w", m.cacheDir, err)
	}

	result := make([]Entry, 0, len(dirEntries))

	for _, de := range dirEntries {
		info, err := de.Info()
		if err != nil {
			continue // skip entries whose stat fails (e.g. dangling symlinks)
		}

		result = append(result, Entry{
			Path:        filepath.Join(m.cacheDir, de.Name()),
			Name:        de.Name(),
			Size:        info.Size(),
			MtimeUnix:   info.ModTime().Unix(),
			IsDirectory: de.IsDir(),
		})
	}

	return result, nil
}

// Remove deletes the entry at path, resolved as Resolve does (a file or a
// directory tree). A missing entry is not an error.
func (m *Manager) Remove(path string) error {
	resolved := m.Resolve(path)
	if err := os.RemoveAll(resolved); err != nil {
		return fmt.Errorf("remove cache entry %q: %w", resolved, err)
	}

	return nil
}

// Clear deletes the entire application cache directory and all its contents.
func (m *Manager) Clear() error {
	if err := os.RemoveAll(m.cacheDir); err != nil {
		return fmt.Errorf("clear cache %q: %w", m.cacheDir, err)
	}

	return nil
}
