// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// The package outputs of the release binaries (TASK-261): `eser dev
// npm-binaries` puts the compiled noskills into its npm platform packages,
// and `eser dev nix-vendor-hash` keeps the flake's buildGoModule vendorHash
// in step with go.sum.

func devNpmBinariesCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "npm-binaries",
		Short: "Copy the compiled binaries into their npm platform packages",
		Long: "Extracts each npm binary (" + strings.Join(codebasefx.NpmBinaries, ", ") + ") from the archives " +
			"`eser dev compile` wrote into pkg/@eserstack/<binary>-<platform>/, next to the committed package.json, " +
			"for the targets whose archives exist.",
		Flags: func(fs *flag.FlagSet) {
			fs.String("from", "etc/temp/binaries", "the directory `eser dev compile` wrote")
		},
		Run: func(c *clifx.Context) error {
			version, err := e.readVersion()
			if err != nil {
				return err
			}

			from := c.String("from")
			if !filepath.IsAbs(from) {
				from = filepath.Join(e.cwd, from)
			}

			result, err := codebasefx.StageNpmBinaries(&codebasefx.StageOptions{
				Root: e.cwd, BinDir: from, Version: version, Log: e.stdout,
			})
			if err != nil {
				return err //nolint:wrapcheck
			}

			if len(result.Missing) > 0 {
				_, _ = fmt.Fprintf(e.stdout, "Not staged (no archive): %s\n", strings.Join(result.Missing, ", "))
			}

			return nil
		},
	}
}

func devNixVendorHashCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "nix-vendor-hash",
		Short: "Write the vendorHash of the flake's noskills package from go.sum",
		Long: "Runs `go mod vendor` into a temporary directory, hashes it the way Nix does, and writes the " +
			"result into flake.nix's vendorHash. --check changes nothing and fails when the value is stale.",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("check", false, "fail when flake.nix's vendorHash does not match go.sum, without writing it")
		},
		Run: func(c *clifx.Context) error {
			path := filepath.Join(e.cwd, "flake.nix")

			data, err := os.ReadFile(path) //nolint:gosec // G304: the repository's flake
			if err != nil {
				return fmt.Errorf("read flake.nix: %w", err)
			}

			current, err := codebasefx.FlakeVendorHash(string(data))
			if err != nil {
				return err //nolint:wrapcheck
			}

			want, err := codebasefx.GoVendorHash(c, e.cwd)
			if err != nil {
				return err //nolint:wrapcheck
			}

			if current == want {
				_, _ = fmt.Fprintf(e.stdout, "flake.nix vendorHash is up to date: %s\n", want)

				return nil
			}

			if c.Bool("check") {
				return fmt.Errorf("%w: it is %s, go.sum gives %s; run `go run ./cmd/eser dev nix-vendor-hash`",
					codebasefx.ErrVendorHashStale, current, want)
			}

			updated, err := codebasefx.SetFlakeVendorHash(string(data), want)
			if err != nil {
				return err //nolint:wrapcheck
			}

			if err := os.WriteFile(path, []byte(updated), 0o644); err != nil { //nolint:gosec // G306: a repository file
				return fmt.Errorf("write flake.nix: %w", err)
			}

			_, _ = fmt.Fprintf(e.stdout, "Wrote vendorHash %s to %s\n", want, path)

			return nil
		},
	}
}
