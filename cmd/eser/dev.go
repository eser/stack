// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
)

var errBuildsFailed = errors.New("some builds failed")

// The release build commands (M3-T10, decision-39): `eser dev compile` writes
// the release archives and SHA256SUMS.txt, `eser dev homebrew` and
// `eser dev nix-hashes` follow a published release.

func (e *env) readVersion() (string, error) {
	data, err := os.ReadFile(filepath.Join(e.cwd, "VERSION"))
	if err != nil {
		return "", fmt.Errorf("read VERSION: %w", err)
	}

	return strings.TrimSpace(string(data)), nil
}

func (e *env) distributionEnv() *codebasefx.DistributionEnv {
	return &codebasefx.DistributionEnv{
		HTTPClient:   e.httpClient,
		Log:          e.stdout,
		DownloadBase: e.releaseAssetBase(),
		TapURL:       e.tapURL,
		Token:        e.getenv("GH_TOKEN"),
	}
}

// releaseAssetBase is the download base without the tag, or "" for GitHub.
func (e *env) releaseAssetBase() string {
	if e.releases.download == defaultReleases().download {
		return ""
	}

	return e.releases.download
}

// releaseSums reads --sums, or a placeholder for each binary the release
// builds in a dry run, or the published release's SHA256SUMS.txt.
func releaseSums(c *clifx.Context, e *env, version string) (map[string]string, error) {
	if path := c.String("sums"); path != "" {
		if !filepath.IsAbs(path) {
			path = filepath.Join(e.cwd, path)
		}

		data, err := os.ReadFile(path) //nolint:gosec // G304: the file the user named
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}

		return codebasefx.ParseSHA256Sums(string(data)), nil
	}

	if c.Bool("dry-run") {
		names := make([]string, 0, len(codebasefx.ReleaseBinaries))
		for _, binary := range codebasefx.ReleaseBinaries {
			names = append(names, binary.Name)
		}

		return codebasefx.PlaceholderSHA256Sums(version, names), nil
	}

	return codebasefx.DownloadSHA256Sums(c, e.distributionEnv(), version) //nolint:wrapcheck
}

func sumsFlags(fs *flag.FlagSet) {
	fs.Bool("dry-run", false, "use placeholder hashes for the binaries this release builds, and write or push nothing")
	fs.String("sums", "", "read the hashes from this SHA256SUMS.txt instead of the release")
}

func devCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "dev",
		Short: "Release build tools: archives, Homebrew formulas and Nix hashes",
		Subcommands: []*clifx.Command{
			{
				Name:  "compile",
				Short: "Cross-compile the release binaries into archives and SHA256SUMS.txt",
				Long: "Builds eser, noskills-server and the laroux and noskills forwarding stubs " +
					"(cmd/legacy-forwarder) with CGO_ENABLED=0 for the five release targets into " +
					"<name>-v<version>-<triple>.tar.gz (.zip on Windows) and SHA256SUMS.txt. SOURCE_DATE_EPOCH " +
					"sets the time stored in the archives.",
				Flags: func(fs *flag.FlagSet) {
					fs.Bool("current-only", false, "build for this host only")
					fs.String("out", "etc/temp/binaries", "the output directory, emptied first")
				},
				Run: func(c *clifx.Context) error {
					version, err := e.readVersion()
					if err != nil {
						return err
					}

					targets := codebasefx.ReleaseTargets
					if c.Bool("current-only") {
						host, err := codebasefx.HostReleaseTarget(e.goos, e.goarch)
						if err != nil {
							return fmt.Errorf("--current-only: %w", err)
						}

						targets = []codebasefx.ReleaseTarget{host}
					}

					out := c.String("out")
					if !filepath.IsAbs(out) {
						out = filepath.Join(e.cwd, out)
					}

					result, err := codebasefx.CompileRelease(c, &codebasefx.CompileOptions{ //nolint:exhaustruct
						Root:     e.cwd,
						OutDir:   out,
						Version:  version,
						Targets:  targets,
						Binaries: codebasefx.ReleaseBinaries,
						Log:      e.stdout,
						Build:    e.releaseBuild,
					})
					if err != nil {
						return err //nolint:wrapcheck
					}

					_, _ = fmt.Fprintf(e.stdout, "\nOutput: %s\n", out)
					for _, archive := range result.Archives {
						_, _ = fmt.Fprintf(e.stdout, "  %s\n", archive.Name)
					}

					_, _ = fmt.Fprintln(e.stdout, "  SHA256SUMS.txt")

					if len(result.Failed) > 0 {
						return fmt.Errorf("%w: %s", errBuildsFailed, strings.Join(result.Failed, ", "))
					}

					return nil
				},
			},
			{
				Name:  "homebrew",
				Short: "Update the eser/homebrew-tap formulas from the release's SHA256SUMS.txt",
				Long: "Renders the formula of each binary the release has archives for and pushes them to " +
					"eser/homebrew-tap with GH_TOKEN; a formula whose archives the release lacks stays as it is.",
				Flags: sumsFlags,
				Run: func(c *clifx.Context) error {
					version, err := e.readVersion()
					if err != nil {
						return err
					}

					sums, err := releaseSums(c, e, version)
					if err != nil {
						return err
					}

					plan, err := codebasefx.PlanHomebrew(version, sums)
					if err != nil {
						return err //nolint:wrapcheck
					}

					names := make([]string, 0, len(plan.Formulas))
					for name := range plan.Formulas {
						names = append(names, name)
					}

					slices.Sort(names)
					_, _ = fmt.Fprintf(e.stdout, "Version: %s\nFormulas: %s\n", version, strings.Join(names, ", "))

					if len(plan.Skipped) > 0 {
						_, _ = fmt.Fprintf(e.stdout, "Left as they are (no archives in this release): %s\n", strings.Join(plan.Skipped, ", "))
					}

					if c.Bool("dry-run") {
						_, _ = fmt.Fprintf(e.stdout, "[dry-run] rendered %d formulas; skipping clone and push.\n", len(plan.Formulas))

						return nil
					}

					pushed, err := codebasefx.PushHomebrewFormulas(c, e.distributionEnv(), version, plan)
					if err != nil {
						return err //nolint:wrapcheck
					}

					if pushed {
						_, _ = fmt.Fprintln(e.stdout, "Done: Homebrew formulas updated.")
					}

					return nil
				},
			},
			{
				Name:  "nix-hashes",
				Short: "Write nix/hashes.json from the release's SHA256SUMS.txt",
				Long: "Writes the version and, for each of eser and noskills-server the release has archives " +
					"for, the SRI hash of each archive; the flake packages the binaries the file lists.",
				Flags: sumsFlags,
				Run: func(c *clifx.Context) error {
					version, err := e.readVersion()
					if err != nil {
						return err
					}

					sums, err := releaseSums(c, e, version)
					if err != nil {
						return err
					}

					data, skipped, err := codebasefx.NixHashes(version, sums)
					if err != nil {
						return err //nolint:wrapcheck
					}

					if len(skipped) > 0 {
						_, _ = fmt.Fprintf(e.stdout, "Not packaged (no archives in this release): %s\n", strings.Join(skipped, ", "))
					}

					path := filepath.Join(e.cwd, "nix", "hashes.json")
					if c.Bool("dry-run") {
						_, _ = fmt.Fprintf(e.stdout, "[dry-run] would write %s:\n%s", path, data)

						return nil
					}

					if err := os.WriteFile(path, data, 0o644); err != nil { //nolint:gosec // G306: a repository file
						return fmt.Errorf("write nix/hashes.json: %w", err)
					}

					_, _ = fmt.Fprintf(e.stdout, "Wrote %s\n", path)

					return nil
				},
			},
		},
	}
}
