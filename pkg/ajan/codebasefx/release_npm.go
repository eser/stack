// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// NpmBinaries are the release binaries that npm installs through a launcher
// package and one platform package per release target (TASK-261): the
// launcher `noskills` lists @eserstack/noskills-<platform> as
// optionalDependencies, and npm installs the one whose os and cpu match.
var NpmBinaries = []string{"noskills"} //nolint:gochecknoglobals

// maxStagedBinaryBytes bounds a binary read out of a release archive.
const maxStagedBinaryBytes = 512 << 20

var (
	// ErrNothingStaged is returned when the binaries directory holds no
	// archive of an npm binary.
	ErrNothingStaged = errors.New("no archive of an npm binary was found; run `eser dev compile` first")
	// ErrNotInArchive is returned when an archive does not hold the binary.
	ErrNotInArchive = errors.New("the archive does not hold the binary")
	// ErrPackageVersion is returned when a platform package's version is not
	// the release version.
	ErrPackageVersion = errors.New("the platform package's version is not the release version")
)

// NpmPlatform is the `<process.platform>-<process.arch>` of a release target,
// the suffix of its npm platform packages: darwin-arm64, linux-x64, win32-x64.
func NpmPlatform(target ReleaseTarget) string {
	platform := target.GOOS
	if platform == "windows" {
		platform = "win32"
	}

	arch := target.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}

	return platform + "-" + arch
}

// NpmPlatformPackage is the npm name of a binary's platform package:
// @eserstack/noskills-darwin-arm64.
func NpmPlatformPackage(binary string, target ReleaseTarget) string {
	return "@eserstack/" + binary + "-" + NpmPlatform(target)
}

// StageOptions configures StageNpmBinaries.
type StageOptions struct {
	// Log receives the progress lines; nil discards them.
	Log io.Writer
	// Root is the repository root; the platform packages are its
	// pkg/@eserstack/<binary>-<platform> directories.
	Root string
	// BinDir holds the archives `eser dev compile` wrote.
	BinDir  string
	Version string
}

// StageResult is what StageNpmBinaries copied, and which archives it did not
// find (a --current-only build has the host's only).
type StageResult struct {
	Staged  []string
	Missing []string
}

// StageNpmBinaries copies each npm binary out of its release archives into
// its platform packages, executable, next to the committed package.json,
// the way `make ajan-packages` stages the ajan libraries. A package whose
// version is not the release version is an error, so a binary is never
// published under another version's name.
func StageNpmBinaries(opts *StageOptions) (*StageResult, error) {
	result := &StageResult{} //nolint:exhaustruct

	for _, binary := range NpmBinaries {
		for _, target := range ReleaseTargets {
			archive := filepath.Join(opts.BinDir, ArchiveFileName(binary, opts.Version, target))
			if _, err := os.Stat(archive); errors.Is(err, os.ErrNotExist) {
				result.Missing = append(result.Missing, filepath.Base(archive))

				continue
			}

			path, err := stageOne(opts, binary, target, archive)
			if err != nil {
				return nil, err
			}

			if opts.Log != nil {
				_, _ = fmt.Fprintf(opts.Log, "staged %s\n", path)
			}

			result.Staged = append(result.Staged, path)
		}
	}

	if len(result.Staged) == 0 {
		return nil, fmt.Errorf("%w (in %s)", ErrNothingStaged, opts.BinDir)
	}

	return result, nil
}

func stageOne(opts *StageOptions, binary string, target ReleaseTarget, archive string) (string, error) {
	dir := filepath.Join(opts.Root, "pkg", "@eserstack", binary+"-"+NpmPlatform(target))

	manifest, err := os.ReadFile(filepath.Join(dir, "package.json")) //nolint:gosec // G304: a platform package of the repository
	if err != nil {
		return "", fmt.Errorf("read the package.json of %s: %w", NpmPlatformPackage(binary, target), err)
	}

	var pkg struct {
		Version string `json:"version"`
	}

	if err := json.Unmarshal(manifest, &pkg); err != nil {
		return "", fmt.Errorf("parse %s: %w", filepath.Join(dir, "package.json"), err)
	}

	if pkg.Version != opts.Version {
		return "", fmt.Errorf("%w: %s is %q, the release is %q", ErrPackageVersion,
			NpmPlatformPackage(binary, target), pkg.Version, opts.Version)
	}

	fileName := binary
	if target.GOOS == "windows" {
		fileName += ".exe"
	}

	data, err := os.ReadFile(archive) //nolint:gosec // G304: an archive `eser dev compile` wrote
	if err != nil {
		return "", fmt.Errorf("read %s: %w", archive, err)
	}

	var body []byte
	if target.GOOS == "windows" {
		body, err = readZipEntry(data, fileName)
	} else {
		body, err = readTarGzEntry(data, fileName)
	}

	if err != nil {
		return "", fmt.Errorf("%s: %w", filepath.Base(archive), err)
	}

	path := filepath.Join(dir, fileName)
	if err := os.WriteFile(path, body, 0o755); err != nil { //nolint:gosec // G306: an executable for npm to install
		return "", fmt.Errorf("write %s: %w", path, err)
	}

	// WriteFile keeps the mode of a file that already exists.
	if err := os.Chmod(path, 0o755); err != nil { //nolint:gosec // G302: an executable for npm to install
		return "", fmt.Errorf("make %s executable: %w", path, err)
	}

	return path, nil
}

func readTarGzEntry(data []byte, name string) ([]byte, error) {
	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("open the gzip stream: %w", err)
	}

	defer func() { _ = gz.Close() }()

	tr := tar.NewReader(gz)

	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("%w: %s", ErrNotInArchive, name)
		}

		if err != nil {
			return nil, fmt.Errorf("read the tar archive: %w", err)
		}

		if header.Name == name && header.Typeflag == tar.TypeReg {
			return readBounded(tr)
		}
	}
}

func readZipEntry(data []byte, name string) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("open the zip archive: %w", err)
	}

	for _, file := range zr.File {
		if file.Name != name || file.FileInfo().IsDir() {
			continue
		}

		rc, err := file.Open()
		if err != nil {
			return nil, fmt.Errorf("open %s: %w", name, err)
		}

		body, err := readBounded(rc)
		_ = rc.Close()

		return body, err
	}

	return nil, fmt.Errorf("%w: %s", ErrNotInArchive, name)
}

func readBounded(r io.Reader) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r, maxStagedBinaryBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read the binary: %w", err)
	}

	if len(body) > maxStagedBinaryBytes {
		return nil, fmt.Errorf("the binary is larger than %d bytes", maxStagedBinaryBytes) //nolint:err113
	}

	return body, nil
}
