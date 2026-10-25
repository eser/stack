// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// The command name of the binary and its archives.
const command = "eser"

// maxArchiveBytes bounds a release archive download.
const maxArchiveBytes = 512 << 20

var (
	errUnsupportedPlatform = errors.New("unsupported platform")
	errMissingArchive      = errors.New("the release has no archive for this binary")
	errChecksum            = errors.New("checksum verification failed")
	errNoBinaryInArchive   = errors.New("the archive does not hold the binary")
)

// releaseTriples maps GOOS-GOARCH to the Rust target triple the release
// archives are named with (decision-38), from codebasefx.ReleaseTargets, the
// table `eser dev compile` builds. It must match the releaseTriple fields of
// pkg/@eserstack/ajan/targets.ts; a test compares the two.
var releaseTriples = func() map[string]string { //nolint:gochecknoglobals
	triples := make(map[string]string, len(codebasefx.ReleaseTargets))
	for _, target := range codebasefx.ReleaseTargets {
		triples[target.GOOS+"-"+target.GOARCH] = target.Triple
	}

	return triples
}()

// releaseEndpoints are where releases live; tests point them at a local server.
type releaseEndpoints struct {
	latest   string // the JSON of the latest release, with tag_name
	download string // the base of <download>/<tag>/<archive>
}

func defaultReleases() releaseEndpoints {
	return releaseEndpoints{
		latest:   "https://api.github.com/repos/eser/stack/releases/latest",
		download: "https://github.com/eser/stack/releases/download",
	}
}

// archiveName is the release archive of command for a version and platform:
// eser-v4.5.2-aarch64-apple-darwin.tar.gz.
func archiveName(version, goos, goarch string) (string, error) {
	triple, ok := releaseTriples[goos+"-"+goarch]
	if !ok {
		return "", fmt.Errorf("%w: %s-%s", errUnsupportedPlatform, goos, goarch)
	}

	ext := "tar.gz"
	if goos == "windows" {
		ext = "zip"
	}

	return fmt.Sprintf("%s-v%s-%s.%s", command, version, triple, ext), nil
}

func missingArchiveMessage(tag, archive string) string {
	return fmt.Sprintf("Release %s has no %s, so this %s binary cannot update itself.\n"+
		"Install the current version with:\n  npm install -g %s", tag, archive, command, command)
}

func (e *env) get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("request %s: %w", url, err)
	}

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", url, err)
	}

	return resp, nil
}

// latestVersion asks the releases endpoint for the newest version.
func latestVersion(ctx context.Context, e *env) (string, error) {
	resp, err := e.get(ctx, e.releases.latest)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: %s answered HTTP %d", errMissingArchive, e.releases.latest, resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&release); err != nil {
		return "", fmt.Errorf("read %s: %w", e.releases.latest, err)
	}

	return strings.TrimPrefix(release.TagName, "v"), nil
}

// newerThan reports whether version a is above b, comparing major.minor.patch.
func newerThan(a, b string) bool {
	parse := func(v string) [3]int {
		var out [3]int

		core, _, _ := strings.Cut(strings.TrimPrefix(v, "v"), "-")
		for i, part := range strings.SplitN(core, ".", 3) {
			out[i], _ = strconv.Atoi(part)
		}

		return out
	}

	pa, pb := parse(a), parse(b)
	for i := range pa {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}

	return false
}

// expectedChecksum finds archive's hash in a SHA256SUMS.txt text.
func expectedChecksum(sums, archive string) (string, bool) {
	scanner := bufio.NewScanner(strings.NewReader(sums))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 2 && strings.TrimPrefix(fields[1], "*") == archive {
			return fields[0], true
		}
	}

	return "", false
}

// downloadVerified downloads the archive of a version and verifies it against
// the release's SHA256SUMS.txt. It fails closed: an unreachable list, a list
// that does not name the archive and a mismatch all refuse the update.
func downloadVerified(ctx context.Context, e *env, version, archive string) ([]byte, error) {
	base := e.releases.download + "/v" + version

	resp, err := e.get(ctx, base+"/"+archive)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("%w\n%s", errMissingArchive, missingArchiveMessage("v"+version, archive))
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download %s: HTTP %d", archive, resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxArchiveBytes))
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", archive, err)
	}

	sumsResp, err := e.get(ctx, base+"/SHA256SUMS.txt")
	if err != nil {
		return nil, fmt.Errorf("%w: %w; refusing to install a binary that cannot be verified", errChecksum, err)
	}
	defer func() { _ = sumsResp.Body.Close() }()

	if sumsResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: SHA256SUMS.txt answered HTTP %d; refusing to install a binary that cannot be verified",
			errChecksum, sumsResp.StatusCode)
	}

	sums, err := io.ReadAll(io.LimitReader(sumsResp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errChecksum, err)
	}

	want, ok := expectedChecksum(string(sums), archive)
	if !ok {
		return nil, fmt.Errorf("%w: SHA256SUMS.txt lists no checksum for %s; refusing to install", errChecksum, archive)
	}

	sum := sha256.Sum256(data)
	if got := hex.EncodeToString(sum[:]); got != want {
		return nil, fmt.Errorf("%w for %s: expected %s, actual %s; refusing to install", errChecksum, archive, want, got)
	}

	return data, nil
}

// extractBinary returns the eser binary inside a tar.gz or zip archive.
func extractBinary(data []byte, archive, goos string) ([]byte, error) {
	want := command
	if goos == "windows" {
		want += ".exe"
	}

	if strings.HasSuffix(archive, ".zip") {
		reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", archive, err)
		}

		for _, file := range reader.File {
			if path.Base(file.Name) == want {
				rc, err := file.Open()
				if err != nil {
					return nil, fmt.Errorf("read %s: %w", archive, err)
				}
				defer func() { _ = rc.Close() }()

				return io.ReadAll(io.LimitReader(rc, maxArchiveBytes)) //nolint:wrapcheck
			}
		}

		return nil, fmt.Errorf("%w: %s has no %s", errNoBinaryInArchive, archive, want)
	}

	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", archive, err)
	}
	defer func() { _ = gz.Close() }()

	tr := tar.NewReader(gz)

	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("%w: %s has no %s", errNoBinaryInArchive, archive, want)
		}

		if err != nil {
			return nil, fmt.Errorf("read %s: %w", archive, err)
		}

		if header.Typeflag == tar.TypeReg && path.Base(header.Name) == want {
			return io.ReadAll(io.LimitReader(tr, maxArchiveBytes)) //nolint:wrapcheck
		}
	}
}

// replaceSelf writes the new binary next to the running one and renames it
// over it. On Windows a running binary cannot be replaced, so the new one is
// left as eser.new.exe with a note.
func replaceSelf(e *env, binary []byte) (string, error) {
	self, err := e.executable()
	if err != nil {
		return "", fmt.Errorf("find the running binary: %w", err)
	}

	if resolved, err := filepath.EvalSymlinks(self); err == nil {
		self = resolved
	}

	if e.goos == "windows" {
		next := strings.TrimSuffix(self, ".exe") + ".new.exe"
		if err := os.WriteFile(next, binary, 0o755); err != nil { //nolint:gosec // G306: an executable
			return "", fmt.Errorf("write %s: %w", next, err)
		}

		return fmt.Sprintf("Downloaded. Close this terminal and rename\n  %s\nto\n  %s", next, self), nil
	}

	next := self + ".new"
	if err := os.WriteFile(next, binary, 0o755); err != nil { //nolint:gosec // G306: an executable
		return "", fmt.Errorf("write %s: %w (try: sudo %s update)", next, err, command)
	}

	if err := os.Rename(next, self); err != nil {
		_ = os.Remove(next)

		return "", fmt.Errorf("replace %s: %w (try: sudo %s update)", self, err, command)
	}

	return "", nil
}

// selfUpdate updates the running binary to the latest release.
func selfUpdate(ctx context.Context, e *env) error {
	latest, err := latestVersion(ctx, e)
	if err != nil {
		return err
	}

	if !newerThan(latest, e.version) {
		_, _ = fmt.Fprintf(e.stdout, "%s %s is the latest version.\n", command, e.version)

		return nil
	}

	archive, err := archiveName(latest, e.goos, e.goarch)
	if err != nil {
		return err
	}

	_, _ = fmt.Fprintf(e.stdout, "Downloading %s...\n", archive)

	data, err := downloadVerified(ctx, e, latest, archive)
	if err != nil {
		return err
	}

	_, _ = fmt.Fprintln(e.stdout, "Checksum verified.")

	binary, err := extractBinary(data, archive, e.goos)
	if err != nil {
		return err
	}

	note, err := replaceSelf(e, binary)
	if err != nil {
		return err
	}

	if note != "" {
		_, _ = fmt.Fprintln(e.stdout, note)

		return nil
	}

	_, _ = fmt.Fprintf(e.stdout, "Updated %s %s to %s.\n", command, e.version, latest)

	return nil
}

func updateCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "update",
		Short: "Update eser to the latest release",
		Long: "Downloads the latest release archive for this platform from GitHub Releases, verifies it " +
			"against the release's SHA256SUMS.txt, and replaces this binary.",
		Run: func(c *clifx.Context) error {
			return selfUpdate(c, e)
		},
	}
}
