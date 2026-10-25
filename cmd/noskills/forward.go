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
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The commands this binary does not implement yet run in the TypeScript
// noskills CLI, found in this order:
//
//  1. NOSKILLS_TS_CLI, a command line split on whitespace (no shell), such
//     as `node /path/to/pkg/@eserstack/noskills/main.ts`;
//  2. NOSKILLS_TS_BUNDLE, the TypeScript CLI bundle that the npm noskills
//     launcher ships next to itself and sets, run with `node` from PATH;
//  3. `npx --yes noskills@<version>` when npx is on PATH.
//
// The npm noskills package is the launcher of this binary (TASK-261), so
// step 3 runs this binary again, now with NOSKILLS_TS_BUNDLE set. The npx run
// gets NOSKILLS_VIA_NPX=1, and a binary that finds it set never takes step 3
// again, so a launcher without the bundle cannot start a loop. A noskills
// bin in ESER_PLUGIN_PATH is not looked at: the eser npm launcher points it
// at the noskills launcher, which is this binary too.
//
// NOSKILLS_NO_FORWARD=1 turns forwarding off, so a test can prove that a
// command ran in Go. The forwarded CLI gets NOSKILLS_CLI_PREFIX set to the
// command that runs this binary: `noskills init` then writes it into the
// manifest, and every hook and wrapper generated from that manifest calls
// the Go binary instead of `npx eser@latest noskills`.

const (
	envTSCLI     = "NOSKILLS_TS_CLI"
	envTSBundle  = "NOSKILLS_TS_BUNDLE"
	envViaNpx    = "NOSKILLS_VIA_NPX"
	envNoForward = "NOSKILLS_NO_FORWARD"
	envCLIPrefix = "NOSKILLS_CLI_PREFIX"
	npmPackage   = "noskills"
)

var semverPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`) //nolint:gochecknoglobals // compiled once

// tsCLI is how the TypeScript CLI runs: a program, its leading arguments
// and the variables it gets on top of forwardEnviron, or a message when none
// is found.
type tsCLI struct {
	program string
	args    []string
	env     []string
	message string
}

// sameFile reports whether two paths name one file.
func sameFile(a, b string) bool {
	left, err := os.Stat(a)
	if err != nil {
		return false
	}

	right, err := os.Stat(b)
	if err != nil {
		return false
	}

	return os.SameFile(left, right)
}

func failedLookup(message string) tsCLI {
	return tsCLI{program: "", args: nil, env: nil, message: message}
}

func resolveTSCLI(e *env) tsCLI {
	if e.getenv(envNoForward) == "1" {
		return failedLookup(envNoForward + " is set, so the TypeScript noskills CLI is not run.")
	}

	if words := strings.Fields(e.getenv(envTSCLI)); len(words) > 0 {
		return tsCLI{program: words[0], args: words[1:], env: nil, message: ""}
	}

	if bundle := e.getenv(envTSBundle); bundle != "" {
		return bundledTSCLI(e, bundle)
	}

	spec := npmPackage
	if semverPattern.MatchString(e.version) {
		spec += "@" + e.version
	}

	if e.getenv(envViaNpx) == "1" {
		return failedLookup("npx ran this binary without its TypeScript CLI (" + envTSBundle + " is not set), " +
			"so " + spec + " is not run through npx again. Reinstall the noskills npm package, or set " + envTSCLI +
			" to the command that runs the TypeScript CLI.")
	}

	if npx, err := e.lookPath("npx"); err == nil {
		return tsCLI{program: npx, args: []string{"--yes", spec}, env: []string{envViaNpx + "=1"}, message: ""}
	}

	return failedLookup("This command runs in the TypeScript noskills CLI, and none was found: install Node.js so npx " +
		"can run " + spec + ", or set " + envTSCLI + " to the command that runs it.")
}

// bundledTSCLI runs the TypeScript CLI bundle of the npm launcher with the
// node on PATH.
func bundledTSCLI(e *env, bundle string) tsCLI {
	if info, err := os.Stat(bundle); err != nil || !info.Mode().IsRegular() {
		return failedLookup(envTSBundle + " names " + bundle + ", which is not a file: reinstall the noskills npm package.")
	}

	node, err := e.lookPath("node")
	if err != nil {
		return failedLookup("This command runs in the TypeScript noskills CLI at " + bundle + ", and node is not on PATH.")
	}

	return tsCLI{program: node, args: []string{bundle}, env: nil, message: ""}
}

// selfCommand is how a shell runs this binary: `noskills` when that name on
// PATH is this file, otherwise its absolute path, quoted when it needs it.
func selfCommand(e *env) string {
	self, err := e.executable()
	if err != nil {
		return ""
	}

	if onPath, err := e.lookPath("noskills"); err == nil && sameFile(onPath, self) {
		return "noskills"
	}

	if resolved, err := filepath.EvalSymlinks(self); err == nil {
		self = resolved
	}

	if strings.ContainsAny(self, " \t\n'\"\\$`&|;<>()*?[]#~!{}") {
		return noskillsfx.ShellQuote(self)
	}

	return self
}

// forwardEnviron is the environment the TypeScript CLI gets: this one, plus
// NOSKILLS_CLI_PREFIX naming this binary unless the user set it.
func forwardEnviron(e *env) []string {
	environ := e.environ()

	if _, set := e.lookupEnv(envCLIPrefix); set {
		return environ
	}

	if prefix := selfCommand(e); prefix != "" {
		environ = append(environ, envCLIPrefix+"="+prefix)
	}

	return environ
}

// forward runs `noskills <args>` in the TypeScript CLI and returns its exit
// code.
func forward(ctx context.Context, e *env, args []string) int {
	cli := resolveTSCLI(e)
	if cli.program == "" {
		_, _ = fmt.Fprintln(e.stderr, "noskills: "+cli.message)

		return clifx.ExitFailure
	}

	code, err := e.runProcess(ctx, e, cli.program, append(cli.args, args...), append(forwardEnviron(e), cli.env...), e.cwd)
	if err != nil {
		_, _ = fmt.Fprintf(e.stderr, "noskills: %v\n", err)

		return clifx.ExitFailure
	}

	return code
}
