// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/tsgen"
	"github.com/eser/stack/pkg/ajan/nativefx"
)

// nativeTypesCommand writes the TypeScript types of the native functions into
// the packages that own them (ADR 0011). The Go function is the source: change
// its Go types or schema, run this, and the TypeScript types follow. The gate
// runs it with --check, so a change that leaves them behind fails.
func nativeTypesCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "native-types",
		Short: "Generate the TypeScript types of the native functions into the packages that own them",
		Long: "Writes " + tsgen.ModuleFile + " into the package each native function names as its owner, with " +
			"the input and output types of every function it owns, from the schemas of the Go descriptors. " +
			"With --check it writes nothing and exits 1 when a file is missing or differs.",
		Flags: func(fs *flag.FlagSet) {
			fs.Bool("check", false, "fail when a generated file is missing or out of date, and write nothing")
		},
		Run: func(c *clifx.Context) error {
			functions := functionsfx.NewRegistry()
			if err := nativefx.Register(functions); err != nil {
				return fmt.Errorf("register the native functions: %w", err)
			}

			files, err := tsgen.Files(functions.List())
			if err != nil {
				return fmt.Errorf("generate the types: %w", err)
			}

			return writeNativeTypes(e, files, c.Bool("check"))
		},
	}
}

// writeNativeTypes writes the module of each owner under pkg/<owner>, or with
// check compares it with the file there.
func writeNativeTypes(e *env, files map[string][]byte, check bool) error {
	owners := make([]string, 0, len(files))
	for owner := range files {
		owners = append(owners, owner)
	}

	slices.Sort(owners)

	var stale []string

	for _, owner := range owners {
		dir := filepath.Join(e.cwd, "pkg", filepath.FromSlash(owner))
		path := filepath.Join(dir, tsgen.ModuleFile)

		if info, err := os.Stat(dir); err != nil || !info.IsDir() {
			return fmt.Errorf("owner %s has no package at %s", owner, dir) //nolint:err113
		}

		existing, err := os.ReadFile(path) //nolint:gosec // G304: the generated file of a workspace package
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("read %s: %w", path, err)
		}

		if bytes.Equal(existing, files[owner]) {
			continue
		}

		if check {
			stale = append(stale, path)

			continue
		}

		if err := os.WriteFile(path, files[owner], 0o644); err != nil { //nolint:gosec // G306: a repository file
			return fmt.Errorf("write %s: %w", path, err)
		}

		_, _ = fmt.Fprintf(e.stdout, "wrote %s\n", path)
	}

	if len(stale) > 0 {
		for _, path := range stale {
			_, _ = fmt.Fprintf(e.stderr, "out of date: %s\n", path)
		}

		return &clifx.ExitError{
			Code: clifx.ExitFailure,
			Err:  fmt.Errorf("%d generated file(s) out of date; run: go run ./cmd/eser codebase native-types", len(stale)), //nolint:err113
		}
	}

	return nil
}
