// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
)

// pluginPrefix is git's plugin convention: `eser foo` runs `eser-foo`.
const pluginPrefix = "eser-"

// knownPlugin is a command shipped as its own program.
type knownPlugin struct {
	bin        string // the executable name
	npmPackage string // the npm package that provides it; "" when none
}

// knownPlugins is the fixed table of the second resolution step (decision-10).
var knownPlugins = map[string]knownPlugin{ //nolint:gochecknoglobals
	"laroux":   {bin: "laroux", npmPackage: "laroux"},
	"noskills": {bin: "noskills", npmPackage: "noskills"},
	"posts":    {bin: "eser-posts", npmPackage: ""},
}

var semverPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`) //nolint:gochecknoglobals

// resolution is how forward runs a command: a program and its leading
// arguments, or a message when nothing provides the command.
type resolution struct {
	program string
	args    []string
	message string
}

// resolvePlugin finds what runs `eser <name>`, in order: `eser-<name>` on
// PATH; the known bin on PATH, then in each directory of ESER_PLUGIN_PATH
// (which the npm launcher sets); then `npx --yes <package>@<eser version>`
// when npx exists; otherwise a message naming the npm install command.
func resolvePlugin(e *env, name string) resolution {
	if name == "" || strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		return resolution{message: fmt.Sprintf("%q is not a command name", name)} //nolint:exhaustruct
	}

	if path, err := e.lookPath(pluginPrefix + name); err == nil {
		return resolution{program: path} //nolint:exhaustruct
	}

	known, isKnown := knownPlugins[name]
	if !isKnown {
		return resolution{ //nolint:exhaustruct
			message: fmt.Sprintf("Unknown command %q\n  No built-in command, manifest script, or %q executable on PATH.",
				name, pluginPrefix+name),
		}
	}

	if path, err := e.lookPath(known.bin); err == nil {
		return resolution{program: path} //nolint:exhaustruct
	}

	for _, dir := range filepath.SplitList(e.getenv("ESER_PLUGIN_PATH")) {
		if dir == "" {
			continue
		}

		for _, candidate := range binCandidates(e, filepath.Join(dir, known.bin)) {
			if isExecutable(candidate) {
				return resolution{program: candidate} //nolint:exhaustruct
			}
		}
	}

	if known.npmPackage == "" {
		return resolution{ //nolint:exhaustruct
			message: fmt.Sprintf("%q is not installed: put %q on PATH or in ESER_PLUGIN_PATH.", name, known.bin),
		}
	}

	spec := known.npmPackage
	if semverPattern.MatchString(e.version) {
		spec += "@" + e.version
	}

	if npx, err := e.lookPath("npx"); err == nil {
		return resolution{program: npx, args: []string{"--yes", spec}} //nolint:exhaustruct
	}

	return resolution{ //nolint:exhaustruct
		message: fmt.Sprintf("%q is not installed and npx is not on PATH.\n  Install it with: npm install -g %s",
			name, spec),
	}
}

// binCandidates are the file names a bin may have on the platform.
func binCandidates(e *env, base string) []string {
	if e.goos != "windows" {
		return []string{base}
	}

	return []string{base + ".exe", base + ".cmd", base}
}

func isExecutable(path string) bool {
	info, err := os.Stat(path) //nolint:gosec // G703: a bin name from the fixed table under a PATH or ESER_PLUGIN_PATH directory
	if err != nil || !info.Mode().IsRegular() {
		return false
	}

	return filepath.Ext(path) != "" || info.Mode().Perm()&0o111 != 0
}

// forward runs `eser <name> <args>` through the resolved plugin and returns
// its exit code.
func forward(ctx context.Context, e *env, name string, args []string) int {
	res := resolvePlugin(e, name)
	if res.program == "" {
		_, _ = fmt.Fprintln(e.stderr, res.message)

		return clifx.ExitFailure
	}

	code, err := e.runProcess(ctx, e, res.program, append(res.args, args...), e.cwd)
	if err != nil {
		_, _ = fmt.Fprintf(e.stderr, "eser: %v\n", err)

		return clifx.ExitFailure
	}

	return code
}
