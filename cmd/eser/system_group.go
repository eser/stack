// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path"
	"runtime"
	"strconv"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
)

// The `system` group and `eser ajan` of the TypeScript eser (TASK-255): the
// TypeScript CLI held its operational commands under `system` (with
// `install`, `update`, `version` and `doctor` also at the root, as here), plus
// `completions` and `info`, and reported the Go bridge with `ajan version`.

// supportedShells are the shells `system completions` writes a script for.
var supportedShells = []string{"bash", "zsh", "fish"} //nolint:gochecknoglobals

func versionCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "version",
		Short: "Print the eser version",
		Run: func(c *clifx.Context) error {
			return c.Output(map[string]string{"version": e.version}, func(w io.Writer) error {
				_, err := fmt.Fprintln(w, "eser", e.version)

				return err
			})
		},
	}
}

func systemCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "system",
		Short: "Commands related to this CLI: install, update, version, diagnosis",
		Subcommands: []*clifx.Command{
			installCommand(e),
			uninstallCommand(e),
			updateCommand(e),
			completionsCommand(e),
			versionCommand(e),
			doctorCommand(e),
			infoCommand(e),
		},
	}
}

// completionsCommand prints the completion script of a shell, the one
// `eser completion <shell>` prints; without --shell, the shell of $SHELL.
func completionsCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "completions",
		Short: "Print the shell completion script",
		Long: "Prints the completion script for --shell, or for the shell $SHELL names. " +
			"Load it with `source <(eser system completions --shell zsh)` or write it to the shell's completions directory.",
		Flags: func(fs *flag.FlagSet) {
			fs.String("shell", "", "bash, zsh or fish (default: the shell of $SHELL)")
		},
		Run: func(c *clifx.Context) error {
			shell := c.String("shell")
			if shell == "" {
				shell = path.Base(e.getenv("SHELL"))
			}

			script, ok := clifx.CompletionScript(command, shell)
			if !ok {
				return clifx.Usagef("invalid shell %q. Supported shells: %s", shell, strings.Join(supportedShells, ", "))
			}

			_, err := io.WriteString(e.stdout, script)

			return err //nolint:wrapcheck
		},
	}
}

// systemInfo is what `eser system info` reports.
type systemInfo struct {
	Runtime     map[string]string `json:"runtime"`
	Locations   map[string]string `json:"locations"`
	Process     map[string]string `json:"process"`
	Install     map[string]string `json:"install"`
	Environment map[string]string `json:"environment"`
}

// infoSections are the human output's sections, in order, with their keys.
var infoSections = []struct { //nolint:gochecknoglobals
	title string
	keys  []string
	pick  func(info *systemInfo) map[string]string
}{
	{"Runtime", []string{"name", "version", "platform", "arch"}, func(i *systemInfo) map[string]string { return i.Runtime }},
	{"Locations", []string{"home", "tmpdir", "cwd", "pid", "binary"}, func(i *systemInfo) map[string]string { return i.Locations }},
	{"Process", []string{"args"}, func(i *systemInfo) map[string]string { return i.Process }},
	{"Install", []string{"method", "on PATH"}, func(i *systemInfo) map[string]string { return i.Install }},
	{"Environment", []string{"PATH", "HOME", "SHELL", "TERM"}, func(i *systemInfo) map[string]string { return i.Environment }},
}

// infoCommand reports the runtime and the execution context, as the
// TypeScript `system info` did, with Go's runtime in place of Node's.
func infoCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "info",
		Short: "Show the runtime and execution context",
		Run: func(c *clifx.Context) error {
			info := collectInfo(e)

			return c.Output(info, func(w io.Writer) error {
				_, _ = fmt.Fprintln(w, "eser system info")

				for _, section := range infoSections {
					values := section.pick(info)
					_, _ = fmt.Fprintf(w, "\n  %s\n", section.title)

					for _, key := range section.keys {
						if value, ok := values[key]; ok {
							_, _ = fmt.Fprintf(w, "  %-20s%s\n", key+":", value)
						}
					}
				}

				_, err := fmt.Fprintln(w)

				return err //nolint:wrapcheck
			})
		},
	}
}

func collectInfo(e *env) *systemInfo {
	info := &systemInfo{
		Runtime: map[string]string{
			"name": "go", "version": runtime.Version(), "platform": e.goos, "arch": e.goarch,
		},
		Locations: map[string]string{
			"tmpdir": os.TempDir(), "cwd": e.cwd, "pid": strconv.Itoa(os.Getpid()),
		},
		Process:     map[string]string{"args": strings.Join(os.Args, " ")},
		Install:     map[string]string{"method": "binary"},
		Environment: map[string]string{},
	}

	if home, err := e.homeDir(); err == nil {
		info.Locations["home"] = home
	}

	if self, err := e.executable(); err == nil {
		info.Locations["binary"] = self

		if npmInstalled(self) {
			info.Install["method"] = "npm (the eser launcher)"
		}
	}

	if found, err := e.lookPath(command); err == nil {
		info.Install["on PATH"] = found
	} else {
		info.Install["on PATH"] = "no"
	}

	for _, key := range []string{"PATH", "HOME", "SHELL", "TERM"} {
		value := e.getenv(key)
		if value == "" {
			continue
		}

		if key == "PATH" {
			value = fmt.Sprintf("(%d entries)", len(strings.Split(value, string(os.PathListSeparator))))
		}

		info.Environment[key] = value
	}

	return info
}

// ajanCommand reports the Go library, which the Go eser links in: the
// TypeScript eser loaded it through the FFI bridge and printed the bridge's
// handshake here.
func ajanCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "ajan",
		Short: "The Go library (pkg/ajan) eser is built on",
		Subcommands: []*clifx.Command{{ //nolint:exhaustruct
			Name:  "version",
			Short: "Show the ajan library version",
			Run: func(c *clifx.Context) error {
				report := map[string]string{"version": e.version, "backend": "linked", "go": runtime.Version()}

				return c.Output(report, func(w io.Writer) error {
					_, err := fmt.Fprintf(w, "eser-ajan version %s (linked into eser, %s)\n", e.version, runtime.Version())

					return err //nolint:wrapcheck
				})
			},
		}},
	}
}
