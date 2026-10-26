// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
)

var errNotInstalled = errors.New("not installed")

// installDir is where `eser install` puts the binary: ~/.local/bin when it
// exists, else /usr/local/bin, as the TypeScript CLI does.
func installDir(e *env) string {
	if home, err := e.homeDir(); err == nil {
		local := filepath.Join(home, ".local", "bin")
		if info, err := os.Stat(local); err == nil && info.IsDir() {
			return local
		}
	}

	return "/usr/local/bin"
}

func binaryName(e *env) string {
	if e.goos == "windows" {
		return command + ".exe"
	}

	return command
}

func completionHint(w io.Writer) {
	_, _ = fmt.Fprintln(w, "Shell completions: add one of these to your shell's startup file:")
	_, _ = fmt.Fprintln(w, "  source <(eser completion bash)")
	_, _ = fmt.Fprintln(w, "  source <(eser completion zsh)")
	_, _ = fmt.Fprintln(w, "  eser completion fish | source")
}

func installCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "install",
		Short: "Copy this binary to ~/.local/bin or /usr/local/bin",
		Run: func(c *clifx.Context) error {
			self, err := e.executable()
			if err != nil {
				return fmt.Errorf("find the running binary: %w", err)
			}

			target := filepath.Join(installDir(e), binaryName(e))

			data, err := os.ReadFile(self) //nolint:gosec // G304: the running binary
			if err != nil {
				return fmt.Errorf("read %s: %w", self, err)
			}

			if err := os.WriteFile(target, data, 0o755); err != nil { //nolint:gosec // G306: an executable
				return fmt.Errorf("write %s: %w (try: sudo %s install)", target, err, command)
			}

			_, _ = fmt.Fprintf(e.stdout, "Installed %s %s to %s.\n", command, e.version, target)
			completionHint(e.stdout)

			return nil
		},
	}
}

func uninstallCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "uninstall",
		Short: "Remove the binary that `eser install` put in place",
		Run: func(c *clifx.Context) error {
			target := filepath.Join(installDir(e), binaryName(e))
			if !fileExists(target) {
				return &clifx.ExitError{
					Code: clifx.ExitFailure,
					Err: fmt.Errorf("%w: no %s at %s; an npm install is removed with: npm uninstall -g %s",
						errNotInstalled, binaryName(e), target, command),
				}
			}

			if err := os.Remove(target); err != nil {
				return fmt.Errorf("remove %s: %w (try: sudo %s uninstall)", target, err, command)
			}

			_, _ = fmt.Fprintf(e.stdout, "Removed %s.\n", target)
			_, _ = fmt.Fprintln(e.stdout, "Remove the `eser completion` line from your shell's startup file if you added one.")

			return nil
		},
	}
}

// toolVersion runs `<tool> --version` with a timeout and returns its first line.
func toolVersion(ctx context.Context, e *env, tool string) (string, bool) {
	path, err := e.lookPath(tool)
	if err != nil {
		return "", false
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	flag := "--version"
	if tool == "go" {
		flag = "version"
	}

	out, err := exec.CommandContext(ctx, path, flag).Output() //nolint:gosec // G204: a fixed tool name from PATH
	if err != nil {
		return path, true
	}

	line, _, _ := strings.Cut(string(bytes.TrimSpace(out)), "\n")

	return line, true
}

func doctorCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "doctor",
		Short: "Report the installation and the tools eser uses",
		Run: func(c *clifx.Context) error {
			report := doctorReport(c, e)

			return c.Output(report, func(w io.Writer) error {
				for _, line := range report {
					mark := "✓"
					if !line.OK {
						mark = "✗"
					}

					_, _ = fmt.Fprintf(w, "  %-16s %s %s\n", line.Label+":", mark, line.Value)
				}

				return nil
			})
		},
	}
}

// doctorLine is one row of `eser doctor`.
type doctorLine struct {
	Label string `json:"label"`
	Value string `json:"value"`
	OK    bool   `json:"ok"`
}

func doctorReport(ctx context.Context, e *env) []doctorLine {
	lines := []doctorLine{{Label: "Version", Value: e.version, OK: true}}

	platform := e.goos + "-" + e.goarch
	if triple, ok := releaseTriples[platform]; ok {
		lines = append(lines, doctorLine{Label: "Platform", Value: platform + " (" + triple + ")", OK: true})
	} else {
		lines = append(lines, doctorLine{Label: "Platform", Value: platform + " (no release archive; eser update cannot work)", OK: false})
	}

	if self, err := e.executable(); err == nil {
		lines = append(lines, doctorLine{Label: "Binary", Value: self, OK: true})
	}

	if path, err := e.lookPath(command); err == nil {
		lines = append(lines, doctorLine{Label: "On PATH", Value: path, OK: true})
	} else {
		lines = append(lines, doctorLine{Label: "On PATH", Value: "not found; run eser install", OK: false})
	}

	for _, tool := range []string{"git", "node", "pnpm", "go"} {
		version, ok := toolVersion(ctx, e, tool)
		if !ok {
			version = "not found"
		}

		lines = append(lines, doctorLine{Label: tool, Value: version, OK: ok})
	}

	_, manifestErr := loadScripts(e.cwd)
	switch {
	case manifestErr != nil:
		lines = append(lines, doctorLine{Label: "Manifest", Value: manifestErr.Error(), OK: false})
	case fileExists(filepath.Join(e.cwd, ".eser", "manifest.yml")) || fileExists(filepath.Join(e.cwd, ".eser", "manifest.yaml")):
		lines = append(lines, doctorLine{Label: "Manifest", Value: ".eser/manifest.yml", OK: true})
	default:
		lines = append(lines, doctorLine{Label: "Manifest", Value: "none in this directory", OK: true})
	}

	hook := filepath.Join(e.cwd, ".git", "hooks", "pre-commit")
	content, err := os.ReadFile(hook) //nolint:gosec // G304: the project's own hook
	switch {
	case err != nil:
		lines = append(lines, doctorLine{Label: "Git hooks", Value: "not installed", OK: false})
	case bytes.Contains(content, []byte("eser")):
		lines = append(lines, doctorLine{Label: "Git hooks", Value: "pre-commit runs eser", OK: true})
	default:
		lines = append(lines, doctorLine{Label: "Git hooks", Value: "pre-commit does not run eser", OK: false})
	}

	return lines
}
