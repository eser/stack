// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

// The Homebrew formulas and the Nix packages are built for these four
// triples; Windows has neither.
var unixReleaseTriples = []string{ //nolint:gochecknoglobals
	"x86_64-unknown-linux-gnu",
	"aarch64-unknown-linux-gnu",
	"x86_64-apple-darwin",
	"aarch64-apple-darwin",
}

const (
	sumsDownloadTimeout = 30 * time.Second
	gitRemoteTimeout    = 60 * time.Second
	gitLocalTimeout     = 15 * time.Second
)

var (
	// ErrPartialRelease is returned when a release has the archives of a
	// binary for some of the triples but not all of them.
	ErrPartialRelease = errors.New("the release has only some of the archives of a binary")
	// ErrNoArchives is returned when SHA256SUMS.txt names no archive a formula
	// or package is built from.
	ErrNoArchives = errors.New("SHA256SUMS.txt names no archive of a known binary")
	// ErrNoToken is returned when the tap push has no GitHub token.
	ErrNoToken = errors.New("GH_TOKEN environment variable is required for pushing to the homebrew-tap repo")

	credentialPattern = regexp.MustCompile(`://[^\s/@]+@`)
)

// HomebrewFormula is one formula of the eser/homebrew-tap repository.
type HomebrewFormula struct {
	Binary      string
	ClassName   string
	Description string
}

// HomebrewFormulas are the formulas of the tap; each is written only when
// the release has its archives.
var HomebrewFormulas = []HomebrewFormula{ //nolint:gochecknoglobals
	{Binary: "eser", ClassName: "Eser", Description: "Terminal client for Eser's work"},
	{Binary: "noskills", ClassName: "Noskills", Description: "State-machine orchestrator for AI agents"},
	{Binary: "laroux", ClassName: "Laroux", Description: "laroux.js framework CLI"},
	{
		Binary:      "noskills-server",
		ClassName:   "NoskillsServer",
		Description: "noskills-server — persistent Claude Code sessions that survive reboots",
	},
}

// NixPackages are the binaries the flake packages from release archives.
var NixPackages = []string{"eser", "noskills-server"} //nolint:gochecknoglobals

// releaseHashes returns the SHA-256 of binary's archive for each Unix
// triple: nil when the release has none of them, ErrPartialRelease when it
// has only some.
func releaseHashes(sums map[string]string, binary, version string) (map[string]string, error) {
	hashes := make(map[string]string, len(unixReleaseTriples))

	var missing []string

	for _, triple := range unixReleaseTriples {
		name := binary + "-v" + version + "-" + triple + ".tar.gz"
		if hash, ok := sums[name]; ok {
			hashes[triple] = hash
		} else {
			missing = append(missing, name)
		}
	}

	switch len(missing) {
	case 0:
		return hashes, nil
	case len(unixReleaseTriples):
		return nil, nil //nolint:nilnil // no archive of this binary: nothing to write
	default:
		return nil, fmt.Errorf("%w: %s is missing %s", ErrPartialRelease, binary, strings.Join(missing, ", "))
	}
}

// RenderHomebrewFormula writes the Ruby formula of a binary, as
// etc/scripts/update-homebrew-formula.ts wrote it.
func RenderHomebrewFormula(spec HomebrewFormula, version string, hashes map[string]string) string {
	url := func(triple string) string {
		return "https://github.com/eser/stack/releases/download/v" + version + "/" + spec.Binary + "-v" + version + "-" + triple + ".tar.gz"
	}

	return `class ` + spec.ClassName + ` < Formula
  desc "` + spec.Description + `"
  homepage "https://github.com/eser/stack"
  version "` + version + `"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "` + url("aarch64-apple-darwin") + `"
      sha256 "` + hashes["aarch64-apple-darwin"] + `"
    end
    on_intel do
      url "` + url("x86_64-apple-darwin") + `"
      sha256 "` + hashes["x86_64-apple-darwin"] + `"
    end
  end

  on_linux do
    on_arm do
      url "` + url("aarch64-unknown-linux-gnu") + `"
      sha256 "` + hashes["aarch64-unknown-linux-gnu"] + `"
    end
    on_intel do
      url "` + url("x86_64-unknown-linux-gnu") + `"
      sha256 "` + hashes["x86_64-unknown-linux-gnu"] + `"
    end
  end

  def install
    bin.install "` + spec.Binary + `"

    # Install the Go shared library if present in the archive (added in newer releases).
    # On macOS the library is a .dylib; on Linux it is a .so.
    if File.exist?("libeser_ajan.dylib")
      lib.install "libeser_ajan.dylib"
    elsif File.exist?("libeser_ajan.so")
      lib.install "libeser_ajan.so"
    end

    # Install the C header for FFI consumers if present.
    if File.exist?("libeser_ajan.h")
      include.install "libeser_ajan.h"
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/` + spec.Binary + ` --version")

    # Verify the Go bridge is functional when the shared library is installed.
    if (lib/"libeser_ajan.dylib").exist? || (lib/"libeser_ajan.so").exist?
      assert_match(/\d+\.\d+/, shell_output("#{bin}/` + spec.Binary + ` --version"))
    end
  end
end
`
}

// HomebrewPlan is the formulas a release updates: file name -> content, and
// the formulas left as they are because the release has no archive of them.
type HomebrewPlan struct {
	Formulas map[string]string
	Skipped  []string
}

// PlanHomebrew renders the formula of every binary the release has archives
// for.
func PlanHomebrew(version string, sums map[string]string) (*HomebrewPlan, error) {
	if !semverCorePattern.MatchString(version) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidVersionFile, version)
	}

	plan := &HomebrewPlan{Formulas: map[string]string{}} //nolint:exhaustruct

	for _, spec := range HomebrewFormulas {
		hashes, err := releaseHashes(sums, spec.Binary, version)
		if err != nil {
			return nil, err
		}

		if hashes == nil {
			plan.Skipped = append(plan.Skipped, spec.Binary)

			continue
		}

		plan.Formulas[spec.Binary+".rb"] = RenderHomebrewFormula(spec, version, hashes)
	}

	if len(plan.Formulas) == 0 {
		return nil, ErrNoArchives
	}

	return plan, nil
}

// DistributionEnv is where the distribution commands read releases from and
// push to; tests point it at local servers and repositories.
type DistributionEnv struct {
	HTTPClient *http.Client
	Log        io.Writer
	// DownloadBase is the base of <base>/v<version>/<asset>; "" is the eser/stack
	// GitHub Releases download URL.
	DownloadBase string
	// TapURL is the homebrew-tap clone URL; "" is github.com/eser/homebrew-tap
	// with the token.
	TapURL string
	Token  string
}

func (d *DistributionEnv) logf(format string, args ...any) {
	if d.Log != nil {
		_, _ = fmt.Fprintf(d.Log, format+"\n", args...)
	}
}

// DownloadSHA256Sums fetches the SHA256SUMS.txt of a release.
func DownloadSHA256Sums(ctx context.Context, env *DistributionEnv, version string) (map[string]string, error) {
	base := env.DownloadBase
	if base == "" {
		base = "https://github.com/eser/stack/releases/download"
	}

	url := strings.TrimSuffix(base, "/") + "/v" + version + "/SHA256SUMS.txt"
	env.logf("Downloading %s...", url)

	ctx, cancel := context.WithTimeout(ctx, sumsDownloadTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", url, err)
	}

	client := env.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download %s: %w; check that GitHub is reachable and rerun the job", url, err)
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download %s: HTTP %s", url, resp.Status) //nolint:err113
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) //nolint:mnd // a few hundred bytes in practice
	if err != nil {
		return nil, fmt.Errorf("download %s: %w", url, err)
	}

	sums := ParseSHA256Sums(string(body))
	if len(sums) == 0 {
		return nil, fmt.Errorf("%s: %w", url, ErrNoArchives)
	}

	return sums, nil
}

// PlaceholderSHA256Sums is a SHA256SUMS.txt with a distinct made-up hash for
// every Unix archive of the given binaries, for dry runs before a release
// exists.
func PlaceholderSHA256Sums(version string, binaries []string) map[string]string {
	sums := make(map[string]string)

	for i, binary := range binaries {
		for j, triple := range unixReleaseTriples {
			sums[binary+"-v"+version+"-"+triple+".tar.gz"] = fmt.Sprintf("%064x", i*10+j)
		}
	}

	return sums
}

// redactCredentials hides the user part of URLs in git output.
func redactCredentials(text string) string {
	return credentialPattern.ReplaceAllString(text, "://[redacted]@")
}

func runGitTimeout(ctx context.Context, dir string, timeout time.Duration, args ...string) (string, error) {
	return runGitEnvTimeout(ctx, dir, timeout, nil, args...)
}

// runGitEnvTimeout is runGitTimeout with extra environment variables, which
// take precedence over the inherited ones.
func runGitEnvTimeout(ctx context.Context, dir string, timeout time.Duration, env []string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir

	if env != nil {
		cmd.Env = append(os.Environ(), env...)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		line := redactCredentials("git " + strings.Join(args, " "))
		if ctx.Err() != nil {
			return "", fmt.Errorf("%s: did not finish within %s and was stopped; rerun the job, and check that github.com is reachable", line, timeout) //nolint:err113
		}

		return "", fmt.Errorf("%s: %w\n%s", line, err, redactCredentials(string(out)))
	}

	return strings.TrimSpace(string(out)), nil
}

// tapCommitIdentity names the tap commit's author and committer. It goes in
// the environment because GIT_AUTHOR_* and GIT_COMMITTER_*, which git hooks
// and CI runners can set, override git config.
var tapCommitIdentity = []string{ //nolint:gochecknoglobals // constant data
	"GIT_AUTHOR_NAME=github-actions[bot]",
	"GIT_AUTHOR_EMAIL=github-actions[bot]@users.noreply.github.com",
	"GIT_COMMITTER_NAME=github-actions[bot]",
	"GIT_COMMITTER_EMAIL=github-actions[bot]@users.noreply.github.com",
}

// PushHomebrewFormulas clones the tap, writes the planned formulas under
// Formula/, and commits and pushes them when they changed. It reports whether
// a commit was pushed. The clone, whose remote URL holds the token, is removed
// even when a step fails.
func PushHomebrewFormulas(ctx context.Context, env *DistributionEnv, version string, plan *HomebrewPlan) (bool, error) {
	tapURL := env.TapURL
	if tapURL == "" {
		if env.Token == "" {
			return false, ErrNoToken
		}

		tapURL = "https://x-access-token:" + env.Token + "@github.com/eser/homebrew-tap.git"
	}

	clone, err := os.MkdirTemp("", "eser-homebrew-tap-")
	if err != nil {
		return false, fmt.Errorf("create the clone directory: %w", err)
	}

	defer func() { _ = os.RemoveAll(clone) }()

	env.logf("Cloning eser/homebrew-tap...")

	if _, err := runGitTimeout(ctx, "", gitRemoteTimeout, "clone", "--depth", "1", tapURL, clone); err != nil {
		return false, err
	}

	formulaDir := filepath.Join(clone, "Formula")
	if err := os.MkdirAll(formulaDir, 0o750); err != nil {
		return false, fmt.Errorf("create Formula: %w", err)
	}

	names := make([]string, 0, len(plan.Formulas))
	for name := range plan.Formulas {
		names = append(names, name)
	}

	slices.Sort(names)

	for _, name := range names {
		if err := os.WriteFile(filepath.Join(formulaDir, name), []byte(plan.Formulas[name]), 0o644); err != nil { //nolint:gosec // G306: a tap file
			return false, fmt.Errorf("write %s: %w", name, err)
		}

		env.logf("Wrote formula Formula/%s", name)
	}

	if _, err := runGitTimeout(ctx, clone, gitLocalTimeout, "add", "Formula"); err != nil {
		return false, err
	}

	diff, err := runGitTimeout(ctx, clone, gitLocalTimeout, "diff", "--cached", "--name-only")
	if err != nil {
		return false, err
	}

	if diff == "" {
		env.logf("No changes to commit; the formulas are already up to date.")

		return false, nil
	}

	if _, err := runGitEnvTimeout(ctx, clone, gitLocalTimeout, tapCommitIdentity, "commit", "-m", "chore: update eser formula to v"+version); err != nil {
		return false, err
	}

	env.logf("Pushing to eser/homebrew-tap...")

	if _, err := runGitTimeout(ctx, clone, gitRemoteTimeout, "push", "origin", "HEAD"); err != nil {
		return false, err
	}

	return true, nil
}

// HexToSRI turns a hex SHA-256 into the sha256-<base64> form Nix uses.
func HexToSRI(hash string) (string, error) {
	raw, err := hex.DecodeString(hash)
	if err != nil || len(raw) != 32 {
		return "", fmt.Errorf("invalid SHA256 hex hash %q: expected 64 hex characters", hash) //nolint:err113
	}

	return "sha256-" + base64.StdEncoding.EncodeToString(raw), nil
}

// NixHashes renders nix/hashes.json for a release: the version, and for each
// of NixPackages the release has archives of, the SRI hash of its archive per
// triple. The flake packages exactly the binaries it lists.
func NixHashes(version string, sums map[string]string) ([]byte, []string, error) {
	doc := orderedValue{kind: 'o', object: []orderedMember{ //nolint:exhaustruct
		{key: "version", value: orderedValue{kind: 's', scalar: version}}, //nolint:exhaustruct
	}}

	var skipped []string

	for _, binary := range NixPackages {
		hashes, err := releaseHashes(sums, binary, version)
		if err != nil {
			return nil, nil, err
		}

		if hashes == nil {
			skipped = append(skipped, binary)

			continue
		}

		entry := orderedValue{kind: 'o', object: []orderedMember{}} //nolint:exhaustruct

		for _, triple := range unixReleaseTriples {
			sri, err := HexToSRI(hashes[triple])
			if err != nil {
				return nil, nil, err
			}

			entry.object = append(entry.object, orderedMember{key: triple, value: orderedValue{kind: 's', scalar: sri}}) //nolint:exhaustruct
		}

		doc.object = append(doc.object, orderedMember{key: binary, value: entry})
	}

	if len(doc.object) == 1 {
		return nil, nil, ErrNoArchives
	}

	return doc.stringify(), skipped, nil
}
