// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package testingfx provides lightweight testing utilities: an in-memory
// filesystem and a fake HTTP server. It mirrors the portable subset of
// @eserstack/testing.
//
// Note: Go's t.TempDir() creates and auto-cleans a real temporary directory;
// there is no need for a withTmpDir wrapper.
package testingfx

import (
	"io/fs"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
)

// FakeFile is a single file entry in FakeFs.
type FakeFile struct {
	Content []byte
	ModTime time.Time
	Mode    fs.FileMode
}

// FakeFs is an in-memory filesystem that satisfies fs.FS and also supports
// writing and listing files. Safe for concurrent use.
type FakeFs struct {
	mu    sync.RWMutex
	files map[string]*FakeFile
}

// NewFakeFs creates a FakeFs pre-populated from the given map.
// Keys are slash-separated paths (no leading slash). Values are file contents.
func NewFakeFs(initial map[string][]byte) *FakeFs {
	f := &FakeFs{files: make(map[string]*FakeFile, len(initial))}
	now := time.Now()

	for name, content := range initial {
		name = path.Clean(name)
		data := make([]byte, len(content))
		copy(data, content)

		f.files[name] = &FakeFile{Content: data, ModTime: now, Mode: 0o644}
	}

	return f
}

// Open implements fs.FS.
func (f *FakeFs) Open(name string) (fs.File, error) {
	name = path.Clean(name)

	f.mu.RLock()
	entry, ok := f.files[name]
	f.mu.RUnlock()

	if !ok {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrNotExist}
	}

	return &fakeOpenFile{
		name:    name,
		content: entry.Content,
		modTime: entry.ModTime,
		mode:    entry.Mode,
	}, nil
}

// ReadFile reads and returns the contents of the named file.
func (f *FakeFs) ReadFile(name string) ([]byte, error) {
	name = path.Clean(name)

	f.mu.RLock()
	entry, ok := f.files[name]
	f.mu.RUnlock()

	if !ok {
		return nil, &fs.PathError{Op: "read", Path: name, Err: fs.ErrNotExist}
	}

	out := make([]byte, len(entry.Content))
	copy(out, entry.Content)

	return out, nil
}

// WriteFile writes data to the named file, creating it if needed.
func (f *FakeFs) WriteFile(name string, data []byte) {
	name = path.Clean(name)
	content := make([]byte, len(data))
	copy(content, data)

	f.mu.Lock()
	f.files[name] = &FakeFile{Content: content, ModTime: time.Now(), Mode: 0o644}
	f.mu.Unlock()
}

// Exists reports whether a file with the given name exists.
func (f *FakeFs) Exists(name string) bool {
	name = path.Clean(name)

	f.mu.RLock()
	_, ok := f.files[name]
	f.mu.RUnlock()

	return ok
}

// Delete removes a file. It is a no-op if the file does not exist.
func (f *FakeFs) Delete(name string) {
	name = path.Clean(name)

	f.mu.Lock()
	delete(f.files, name)
	f.mu.Unlock()
}

// List returns a sorted slice of all file paths in the fake filesystem.
func (f *FakeFs) List() []string {
	f.mu.RLock()
	names := make([]string, 0, len(f.files))
	for n := range f.files {
		names = append(names, n)
	}
	f.mu.RUnlock()

	sort.Strings(names)

	return names
}

// ListDir returns a sorted slice of file paths under the given directory prefix.
func (f *FakeFs) ListDir(dir string) []string {
	dir = path.Clean(dir)
	prefix := dir + "/"

	f.mu.RLock()
	var names []string

	for n := range f.files {
		if strings.HasPrefix(n, prefix) || n == dir {
			names = append(names, n)
		}
	}

	f.mu.RUnlock()

	sort.Strings(names)

	return names
}

// fakeOpenFile implements fs.File for FakeFs.
type fakeOpenFile struct {
	name    string
	content []byte
	modTime time.Time
	mode    fs.FileMode
	offset  int
}

func (f *fakeOpenFile) Read(b []byte) (int, error) {
	if f.offset >= len(f.content) {
		return 0, fs.ErrClosed
	}

	n := copy(b, f.content[f.offset:])
	f.offset += n

	return n, nil
}

func (f *fakeOpenFile) Close() error { return nil }

func (f *fakeOpenFile) Stat() (fs.FileInfo, error) {
	return &fakeFileInfo{
		name:    path.Base(f.name),
		size:    int64(len(f.content)),
		modTime: f.modTime,
		mode:    f.mode,
	}, nil
}

// fakeFileInfo implements fs.FileInfo for FakeFs entries.
type fakeFileInfo struct {
	name    string
	size    int64
	modTime time.Time
	mode    fs.FileMode
}

func (i *fakeFileInfo) Name() string       { return i.name }
func (i *fakeFileInfo) Size() int64        { return i.size }
func (i *fakeFileInfo) Mode() fs.FileMode  { return i.mode }
func (i *fakeFileInfo) ModTime() time.Time { return i.modTime }
func (i *fakeFileInfo) IsDir() bool        { return false }
func (i *fakeFileInfo) Sys() any           { return nil }
