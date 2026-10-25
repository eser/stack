// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// legacy-forwarder is the forwarding stub shipped under the release archive
// names of tools that no longer ship as standalone binaries (decision-9).
// Installed v4.5.x laroux and noskills binaries self-update to it, and from
// then on it runs the npm package of the same name:
//
//	<name> <args>      runs npx --yes <name>@<version> <args>, or prints
//	                   `npm i -g <name>` when npx is not on PATH
//	<name> version     prints the stub's version (also --version)
//	<name> update      prints how to move to the npm package
//
// The name is set at build time, like the version, because a self-update or
// a package manager can rename the file (laroux.new, laroux.exe, a Homebrew
// symlink) and argv[0] would then name the wrong package. `eser dev compile`
// builds it once per name:
//
//	go build -ldflags "-X main.name=laroux -X main.version=$(cat VERSION)" ./cmd/legacy-forwarder
//
// ADR 0005 records when the stubs stop being built.
package main

import (
	"context"
	"os"
	"os/exec"
)

// name and version are set by the linker; a build without main.name refuses
// to run (see forwarder.run).
var (
	name    = ""    //nolint:gochecknoglobals // set by the linker
	version = "dev" //nolint:gochecknoglobals // set by the linker
)

func main() {
	executable, err := os.Executable()
	if err != nil {
		executable = os.Args[0]
	}

	f := &forwarder{
		name:       name,
		version:    version,
		executable: executable,
		stdin:      os.Stdin,
		stdout:     os.Stdout,
		stderr:     os.Stderr,
		environ:    os.Environ(),
		lookPath:   exec.LookPath,
	}

	os.Exit(f.run(context.Background(), os.Args[1:]))
}
