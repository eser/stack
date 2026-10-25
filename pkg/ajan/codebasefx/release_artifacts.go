// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ReleaseTarget is one platform of the release: the Rust target triple the
// archive names carry (decision-38) and the Go platform it builds for.
type ReleaseTarget struct {
	Triple string
	GOOS   string
	GOARCH string
}

// ReleaseTargets are the five release platforms, in the order of
// pkg/@eserstack/ajan/targets.ts NATIVE_TARGETS.
var ReleaseTargets = []ReleaseTarget{ //nolint:gochecknoglobals
	{Triple: "aarch64-apple-darwin", GOOS: "darwin", GOARCH: "arm64"},
	{Triple: "x86_64-apple-darwin", GOOS: "darwin", GOARCH: "amd64"},
	{Triple: "aarch64-unknown-linux-gnu", GOOS: "linux", GOARCH: "arm64"},
	{Triple: "x86_64-unknown-linux-gnu", GOOS: "linux", GOARCH: "amd64"},
	{Triple: "x86_64-pc-windows-msvc", GOOS: "windows", GOARCH: "amd64"},
}

// ReleaseBinary is one Go command the release ships: its name, its main
// package, the variable -X sets to the version and, for a command built
// once per name, the variable -X sets to Name.
type ReleaseBinary struct {
	Name       string
	Main       string
	VersionVar string
	NameVar    string
}

// ReleaseBinaries are the commands `eser dev compile` builds (decision-8):
// the Go eser, noskills and noskills-server, and the forwarding stub under
// the laroux archive name that installed v4.5.x laroux binaries update to
// (decision-9). cmd/noskills took the place of the noskills stub (TASK-261),
// so installed v4.5.x noskills binaries update to it; ADR 0005 records when
// the laroux stub stops being built.
var ReleaseBinaries = []ReleaseBinary{ //nolint:gochecknoglobals
	{Name: "eser", Main: "./cmd/eser", VersionVar: "main.version", NameVar: ""},
	{
		Name:       "noskills-server",
		Main:       "./cmd/noskills-server",
		VersionVar: "github.com/eser/stack/pkg/ajan/noskillsserverfx.Version",
		NameVar:    "",
	},
	{Name: "laroux", Main: "./cmd/legacy-forwarder", VersionVar: "main.version", NameVar: "main.name"},
	{Name: "noskills", Main: "./cmd/noskills", VersionVar: "main.version", NameVar: ""},
}

// ErrNoHostTarget is returned when --current-only finds no release target
// for the host.
var ErrNoHostTarget = errors.New("no release target matches this host")

// ArchiveFileName is the release archive of a binary for a target:
// <name>-v<version>-<triple>.tar.gz, or .zip on Windows.
func ArchiveFileName(binary, version string, target ReleaseTarget) string {
	ext := ".tar.gz"
	if target.GOOS == "windows" {
		ext = ".zip"
	}

	return binary + "-v" + version + "-" + target.Triple + ext
}

// HostReleaseTarget is the release target of goos and goarch.
func HostReleaseTarget(goos, goarch string) (ReleaseTarget, error) {
	for _, target := range ReleaseTargets {
		if target.GOOS == goos && target.GOARCH == goarch {
			return target, nil
		}
	}

	return ReleaseTarget{}, fmt.Errorf("%w (%s/%s)", ErrNoHostTarget, goos, goarch) //nolint:exhaustruct
}

// CompileOptions configures CompileRelease.
type CompileOptions struct {
	// Build compiles one binary for one target into out; nil runs go build
	// with CGO_ENABLED=0, -trimpath and -ldflags "-s -w -X <VersionVar>=<v>"
	// (plus -X <NameVar>=<Name> when NameVar is set).
	Build func(ctx context.Context, root string, binary ReleaseBinary, target ReleaseTarget, version, out string) error
	// Log receives the progress lines; nil discards them.
	Log io.Writer
	// ModTime is the time stored for the archived files; zero reads
	// SOURCE_DATE_EPOCH, then uses the current time.
	ModTime time.Time

	Root     string
	OutDir   string
	Version  string
	Targets  []ReleaseTarget
	Binaries []ReleaseBinary
}

// CompiledArchive is one archive CompileRelease wrote.
type CompiledArchive struct {
	Binary string
	Target ReleaseTarget
	Name   string
	Path   string
	SHA256 string
}

// CompileResult is what CompileRelease built, and what failed.
type CompileResult struct {
	Archives []CompiledArchive
	Failed   []string
	SumsPath string
}

// CompileRelease cross-compiles every binary for every target, archives each
// as <name>-v<version>-<triple>.tar.gz (.zip on Windows) with the binary at
// the archive root, and writes SHA256SUMS.txt in the sha256sum format. The
// output directory is emptied first. A failed build is listed in Failed and
// the others still run, as compile.ts did; the error is non-nil only when
// the output cannot be written.
func CompileRelease(ctx context.Context, opts *CompileOptions) (*CompileResult, error) {
	logf := func(format string, args ...any) {
		if opts.Log != nil {
			_, _ = fmt.Fprintf(opts.Log, format+"\n", args...)
		}
	}

	build := opts.Build
	if build == nil {
		build = goBuild
	}

	modTime := opts.ModTime
	if modTime.IsZero() {
		modTime = sourceDateEpoch()
	}

	if err := os.RemoveAll(opts.OutDir); err != nil {
		return nil, fmt.Errorf("empty %s: %w", opts.OutDir, err)
	}

	if err := os.MkdirAll(opts.OutDir, 0o750); err != nil {
		return nil, fmt.Errorf("create %s: %w", opts.OutDir, err)
	}

	names := make([]string, 0, len(opts.Binaries))
	for _, binary := range opts.Binaries {
		names = append(names, binary.Name)
	}

	logf("Compiling %s v%s for %d platform%s...", strings.Join(names, ", "), opts.Version,
		len(opts.Targets), map[bool]string{true: "", false: "s"}[len(opts.Targets) == 1])

	result := &CompileResult{SumsPath: filepath.Join(opts.OutDir, "SHA256SUMS.txt")} //nolint:exhaustruct

	var sums strings.Builder

	for _, binary := range opts.Binaries {
		for _, target := range opts.Targets {
			logf("  Compiling %s for %s...", binary.Name, target.Triple)

			archive, err := compileOne(ctx, opts, build, binary, target, modTime)
			if err != nil {
				logf("    ✗ %s/%s: %v", binary.Name, target.Triple, err)
				result.Failed = append(result.Failed, binary.Name+"/"+target.Triple)

				continue
			}

			result.Archives = append(result.Archives, *archive)
			fmt.Fprintf(&sums, "%s  %s\n", archive.SHA256, archive.Name)
		}
	}

	if err := os.WriteFile(result.SumsPath, []byte(sums.String()), 0o644); err != nil { //nolint:gosec // G306: a release asset
		return nil, fmt.Errorf("write SHA256SUMS.txt: %w", err)
	}

	logf("✓ %d/%d builds compiled successfully", len(result.Archives), len(opts.Binaries)*len(opts.Targets))

	if len(result.Failed) > 0 {
		logf("✗ %d targets failed: %s", len(result.Failed), strings.Join(result.Failed, ", "))
	}

	return result, nil
}

func compileOne(
	ctx context.Context,
	opts *CompileOptions,
	build func(context.Context, string, ReleaseBinary, ReleaseTarget, string, string) error,
	binary ReleaseBinary,
	target ReleaseTarget,
	modTime time.Time,
) (*CompiledArchive, error) {
	staging, err := os.MkdirTemp(opts.OutDir, "staging-"+binary.Name+"-"+target.Triple+"-")
	if err != nil {
		return nil, fmt.Errorf("create the staging directory: %w", err)
	}

	defer func() { _ = os.RemoveAll(staging) }()

	fileName := binary.Name
	if target.GOOS == "windows" {
		fileName += ".exe"
	}

	binaryPath := filepath.Join(staging, fileName)
	if err := build(ctx, opts.Root, binary, target, opts.Version, binaryPath); err != nil {
		return nil, err
	}

	data, err := os.ReadFile(binaryPath) //nolint:gosec // G304: the binary just built
	if err != nil {
		return nil, fmt.Errorf("read the built binary: %w", err)
	}

	var archive []byte
	if target.GOOS == "windows" {
		archive, err = zipArchive(fileName, data, modTime)
	} else {
		archive, err = tarGzArchive(fileName, data, modTime)
	}

	if err != nil {
		return nil, err
	}

	name := ArchiveFileName(binary.Name, opts.Version, target)
	path := filepath.Join(opts.OutDir, name)

	if err := os.WriteFile(path, archive, 0o644); err != nil { //nolint:gosec // G306: a release asset
		return nil, fmt.Errorf("write %s: %w", name, err)
	}

	sum := sha256.Sum256(archive)

	return &CompiledArchive{Binary: binary.Name, Target: target, Name: name, Path: path, SHA256: hex.EncodeToString(sum[:])}, nil
}

// goBuild runs go build for one target, without cgo.
func goBuild(ctx context.Context, root string, binary ReleaseBinary, target ReleaseTarget, version, out string) error {
	ldflags := "-s -w -X " + binary.VersionVar + "=" + version
	if binary.NameVar != "" {
		ldflags += " -X " + binary.NameVar + "=" + binary.Name
	}

	cmd := exec.CommandContext(ctx, "go", "build", "-trimpath", //nolint:gosec // G204: fixed arguments from the release tables
		"-ldflags", ldflags, "-o", out, binary.Main)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "GOOS="+target.GOOS, "GOARCH="+target.GOARCH, "CGO_ENABLED=0")

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("go build %s: %w\n%s", binary.Main, err, strings.TrimSpace(string(output)))
	}

	return nil
}

// sourceDateEpoch is SOURCE_DATE_EPOCH when it is set, so a rebuild of the
// same commit gives the same archive bytes, and the current time otherwise.
func sourceDateEpoch() time.Time {
	if raw := os.Getenv("SOURCE_DATE_EPOCH"); raw != "" {
		if seconds, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return time.Unix(seconds, 0).UTC()
		}
	}

	return time.Now().UTC().Truncate(time.Second)
}

func tarGzArchive(name string, data []byte, modTime time.Time) ([]byte, error) {
	var buf bytes.Buffer

	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)

	header := &tar.Header{ //nolint:exhaustruct
		Typeflag: tar.TypeReg,
		Name:     name,
		Mode:     0o755,
		Size:     int64(len(data)),
		ModTime:  modTime,
		Format:   tar.FormatPAX,
	}

	if err := tw.WriteHeader(header); err != nil {
		return nil, fmt.Errorf("write the tar header: %w", err)
	}

	if _, err := tw.Write(data); err != nil {
		return nil, fmt.Errorf("write the tar entry: %w", err)
	}

	if err := tw.Close(); err != nil {
		return nil, fmt.Errorf("close the tar archive: %w", err)
	}

	if err := gz.Close(); err != nil {
		return nil, fmt.Errorf("close the gzip stream: %w", err)
	}

	return buf.Bytes(), nil
}

func zipArchive(name string, data []byte, modTime time.Time) ([]byte, error) {
	var buf bytes.Buffer

	zw := zip.NewWriter(&buf)

	header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: modTime} //nolint:exhaustruct
	header.SetMode(0o755)

	w, err := zw.CreateHeader(header)
	if err != nil {
		return nil, fmt.Errorf("write the zip header: %w", err)
	}

	if _, err := w.Write(data); err != nil {
		return nil, fmt.Errorf("write the zip entry: %w", err)
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("close the zip archive: %w", err)
	}

	return buf.Bytes(), nil
}

// ParseSHA256Sums reads sha256sum output into file name -> hex hash, skipping
// lines that are not "<64 hex>  <name>" (one or two spaces).
func ParseSHA256Sums(text string) map[string]string {
	sums := make(map[string]string)

	for line := range strings.SplitSeq(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if len(line) < 66 { //nolint:mnd // 64 hex digits, a space and a name
			continue
		}

		hash, rest := line[:64], line[64:]
		if _, err := hex.DecodeString(hash); err != nil || strings.ToLower(hash) != hash {
			continue
		}

		name := strings.TrimPrefix(strings.TrimPrefix(rest, " "), " ")
		if len(name) == len(rest) || name == "" {
			continue
		}

		sums[name] = hash
	}

	return sums
}
