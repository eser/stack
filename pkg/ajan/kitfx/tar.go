// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const (
	// DefaultMaxBytes bounds the decompressed size of a whole-repo tarball,
	// tar headers included: 256 MiB. `git archive HEAD | wc -c` on eser/stack,
	// a large monorepo, gives about 13 MiB.
	DefaultMaxBytes int64 = 256 << 20

	// DefaultMaxEntries bounds the number of entries of a whole-repo tarball.
	// `git archive HEAD | tar -t | wc -l` on eser/stack gives about 2,400.
	DefaultMaxEntries = 20_000
)

// Tarball limits, as TarballLimitError.Limit names them.
const (
	LimitMaxBytes   = "maxBytes"
	LimitMaxEntries = "maxEntries"
)

// TarballLimitError is an archive that went past MaxBytes or MaxEntries.
type TarballLimitError struct {
	// Limit is LimitMaxBytes or LimitMaxEntries.
	Limit string
	Max   int64
}

func (e *TarballLimitError) Error() string {
	measure := fmt.Sprintf("entry count exceeds %s (%d)", e.Limit, e.Max)
	if e.Limit == LimitMaxBytes {
		measure = fmt.Sprintf("decompressed size exceeds %s (%d bytes)", e.Limit, e.Max)
	}

	return fmt.Sprintf(
		"extract tarball: %s; a recipe template should be far smaller, so check that the specifier names the "+
			"intended repository and ref, or raise %s for an archive you trust",
		measure, e.Limit,
	)
}

// ExtractOptions configures ExtractTarball.
type ExtractOptions struct {
	// StripComponents drops this many leading path components, like
	// tar --strip-components.
	StripComponents int
	// Subpath keeps only the files under this directory, relative to it.
	Subpath string
	// MaxBytes bounds the decompressed bytes read, tar headers and the
	// entries Subpath leaves out included; zero selects DefaultMaxBytes.
	MaxBytes int64
	// MaxEntries bounds the entries read, directories, links and metadata
	// included; zero selects DefaultMaxEntries.
	MaxEntries int
}

// limitReader fails with a *TarballLimitError once more than max bytes have
// been read through it.
type limitReader struct {
	r     io.Reader
	max   int64
	total int64
}

func (l *limitReader) Read(buf []byte) (int, error) {
	n, err := l.r.Read(buf)
	l.total += int64(n)

	if l.total > l.max {
		return 0, &TarballLimitError{Limit: LimitMaxBytes, Max: l.max}
	}

	return n, err //nolint:wrapcheck // io.EOF must reach the tar reader as is
}

// ExtractTarball extracts a gzipped tar stream into dir. Archives come from
// untrusted repositories, so only regular files are written, an entry whose
// path leaves dir is dropped, and extraction stops at the byte and entry
// limits with a *TarballLimitError; files written before that stay in dir.
func ExtractTarball(r io.Reader, dir string, opts ExtractOptions) error {
	maxBytes := opts.MaxBytes
	if maxBytes == 0 {
		maxBytes = DefaultMaxBytes
	}

	maxEntries := opts.MaxEntries
	if maxEntries == 0 {
		maxEntries = DefaultMaxEntries
	}

	if maxBytes < 0 || maxEntries < 0 {
		return fmt.Errorf("extract tarball: maxBytes %d and maxEntries %d must be positive integers", maxBytes, maxEntries)
	}

	gz, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("extract tarball: decompress: %w", err)
	}

	defer func() { _ = gz.Close() }()

	subpath := strings.Trim(path.Clean("/"+filepath.ToSlash(opts.Subpath)), "/")
	reader := tar.NewReader(&limitReader{r: gz, max: maxBytes, total: 0})

	for entries := 1; ; entries++ {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}

		if err != nil {
			if limitErr, ok := errors.AsType[*TarballLimitError](err); ok {
				return limitErr
			}

			return fmt.Errorf("extract tarball: read entry %d: %w", entries, err)
		}

		if entries > maxEntries {
			return &TarballLimitError{Limit: LimitMaxEntries, Max: int64(maxEntries)}
		}

		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeCont {
			continue
		}

		relative, ok := tarEntryPath(header.Name, opts.StripComponents, subpath)
		if !ok {
			continue
		}

		if err := writeTarEntry(reader, filepath.Join(dir, filepath.FromSlash(relative))); err != nil {
			if limitErr, ok := errors.AsType[*TarballLimitError](err); ok {
				return limitErr
			}

			return fmt.Errorf("extract tarball: write %s: %w", relative, err)
		}
	}
}

// tarEntryPath maps an archive path to its path under the target directory;
// ok is false for an entry that escapes it, sits at or above the strip level,
// or lies outside subpath.
func tarEntryPath(name string, strip int, subpath string) (string, bool) {
	cleaned := path.Clean(name)
	if strings.HasPrefix(cleaned, "..") || path.IsAbs(cleaned) {
		return "", false
	}

	parts := strings.Split(cleaned, "/")
	if strip >= len(parts) {
		return "", false
	}

	stripped := strings.Join(parts[strip:], "/")
	if subpath == "" || subpath == "." {
		return stripped, true
	}

	relative, found := strings.CutPrefix(stripped, subpath+"/")
	if !found || relative == "" {
		return "", false
	}

	return relative, true
}

func writeTarEntry(r io.Reader, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil { //nolint:gosec // G301: a temporary extraction directory
		return err //nolint:wrapcheck // the caller names the entry
	}

	file, err := os.Create(dest) //nolint:gosec // G304: a path inside the extraction directory, checked by tarEntryPath
	if err != nil {
		return err //nolint:wrapcheck
	}

	if _, err := io.Copy(file, r); err != nil { //nolint:gosec // G110: the limitReader bounds the decompressed size
		_ = file.Close()

		return err //nolint:wrapcheck
	}

	return file.Close() //nolint:wrapcheck
}
