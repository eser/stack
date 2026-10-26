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
	App AppIdentifier
	// BaseDir overrides the XDG cache home. Defaults to XdgCacheHome().
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
// XDG cache home when BaseDir is empty), namespaced by Org and Name.
func NewManager(opts Options) *Manager {
	base := opts.BaseDir
	if base == "" {
		base = XdgCacheHome()
	}

	var dir string
	if opts.App.Org != "" {
		dir = filepath.Join(base, opts.App.Org, opts.App.Name)
	} else {
		dir = filepath.Join(base, opts.App.Name)
	}

	return &Manager{cacheDir: dir}
}

// Dir returns the absolute path to the application cache directory.
func (m *Manager) Dir() string { return m.cacheDir }

// VersionedPath returns the path for a named artefact under a semver version.
// A leading "v" is normalised so "1.0.0" and "v1.0.0" resolve to the same path.
func (m *Manager) VersionedPath(version, name string) string {
	v := "v" + strings.TrimPrefix(version, "v")

	return filepath.Join(m.cacheDir, v, name)
}

// Exists reports whether path exists on disk.
func (m *Manager) Exists(path string) bool {
	_, err := os.Stat(path)

	return !errors.Is(err, fs.ErrNotExist)
}

// EnsureDir creates path and all parents if they do not already exist.
func (m *Manager) EnsureDir(path string) error {
	if err := os.MkdirAll(path, 0o755); err != nil { //nolint:gosec // directory creation
		return fmt.Errorf("ensure dir %q: %w", path, err)
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

// Remove deletes the entry at path (file or directory tree).
func (m *Manager) Remove(path string) error {
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("remove cache entry %q: %w", path, err)
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
