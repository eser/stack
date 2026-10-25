// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/processfx"
)

// projectFiles are the config files DetectProjectType looks for, in the
// order it checks them; the first one found wins.
var projectFiles = []struct {
	name string
	kind ProjectType
}{
	{"go.mod", ProjectTypeGo},
	{"deno.json", ProjectTypeDeno},
	{"deno.jsonc", ProjectTypeDeno},
	{"package.json", ProjectTypeNode},
}

// DetectProjectType looks in dir for go.mod, deno.json, deno.jsonc and
// package.json, in that order, and returns the type of the first one found.
func DetectProjectType(dir string) ProjectDetection {
	for _, candidate := range projectFiles {
		path := filepath.Join(dir, candidate.name)
		if _, err := os.Stat(path); err == nil {
			return ProjectDetection{Type: candidate.kind, ConfigFile: path}
		}
	}

	return ProjectDetection{Type: ProjectTypeUnknown, ConfigFile: ""}
}

// languageMatches reports whether a recipe language suits a project type.
func languageMatches(language string, project ProjectType) bool {
	switch language {
	case "go":
		return project == ProjectTypeGo
	case "typescript", "javascript":
		return project == ProjectTypeDeno || project == ProjectTypeNode
	default:
		return false
	}
}

// GetDependencyInstructions returns the install commands for the recipe's
// declared dependencies, as the TypeScript kit does: `go get` for each Go
// module, then `deno add` for each JSR package, then `npm install` for each
// npm package. When the project type is known and does not suit the recipe's
// language, Warnings says so; callers show it without blocking.
func GetDependencyInstructions(recipe *Recipe, detection ProjectDetection) DependencyInstructions {
	if recipe.Dependencies == nil {
		return DependencyInstructions{}
	}

	var instructions []string

	var warnings []string

	if detection.Type != ProjectTypeUnknown && !languageMatches(recipe.Language, detection.Type) {
		warnings = append(warnings, fmt.Sprintf(
			"Recipe '%s' is for %s, but detected %s project (%s).",
			recipe.Name, recipe.Language, detection.Type, filepath.Base(detection.ConfigFile),
		))
	}

	deps := recipe.Dependencies

	for _, pkg := range deps.Go {
		instructions = append(instructions, "go get "+pkg)
	}

	for _, pkg := range deps.JSR {
		instructions = append(instructions, "deno add "+pkg)
	}

	for _, pkg := range deps.NPM {
		instructions = append(instructions, "npm install "+pkg)
	}

	return DependencyInstructions{
		Instructions: instructions,
		Warnings:     warnings,
	}
}

// InstallOptions configures RunInstallCommands.
type InstallOptions struct {
	CWD string
	// Stdout and Stderr receive the commands' output; nil discards it.
	Stdout io.Writer
	Stderr io.Writer
	// Verbose prints "  [install] <command>" on Stdout before each one.
	Verbose bool
	// Timeout bounds each command; zero selects DefaultCommandTimeout.
	Timeout time.Duration
}

// RunInstallCommands runs the install commands in order with their output on
// opts.Stdout and opts.Stderr, and stops at the first one that fails, as the
// TypeScript kit does. A failed result's Error is "Exit code <n>", or why the
// command could not start.
func RunInstallCommands(ctx context.Context, instructions []string, opts InstallOptions) []InstallResult {
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = DefaultCommandTimeout
	}

	results := make([]InstallResult, 0, len(instructions))

	for _, instruction := range instructions {
		parts := strings.Fields(instruction)
		if len(parts) == 0 {
			continue
		}

		if opts.Verbose {
			_, _ = fmt.Fprintf(writerOrDiscard(opts.Stdout), "  [install] %s\n", instruction)
		}

		result := runStreamingInstall(ctx, instruction, parts, opts, timeout)
		results = append(results, result)

		if !result.Success {
			break
		}
	}

	return results
}

func runStreamingInstall(ctx context.Context, instruction string, parts []string, opts InstallOptions, timeout time.Duration) InstallResult {
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, parts[0], parts[1:]...) //nolint:gosec // instruction comes from registry manifest
	cmd.Dir = opts.CWD
	cmd.Stdout = opts.Stdout
	cmd.Stderr = opts.Stderr
	processfx.HardenCommand(cmd)

	err := cmd.Run()
	if err == nil {
		return InstallResult{Command: instruction, Success: true, Error: ""}
	}

	if exitErr, ok := errors.AsType[*exec.ExitError](err); ok && cmdCtx.Err() == nil {
		return InstallResult{Command: instruction, Success: false, Error: fmt.Sprintf("Exit code %d", exitErr.ExitCode())}
	}

	if ctx.Err() == nil && errors.Is(cmdCtx.Err(), context.DeadlineExceeded) {
		err = fmt.Errorf("no exit within %v: %w", timeout, context.DeadlineExceeded)
	}

	return InstallResult{Command: instruction, Success: false, Error: err.Error()}
}

// InstallDependencies executes each instruction in cwd and records results.
// Execution continues even after failures so callers receive a full result set.
// Each instruction is bounded by DefaultCommandTimeout and by ctx: once ctx
// ends, the remaining instructions fail without starting.
func InstallDependencies(ctx context.Context, instructions []string, cwd string) []InstallResult {
	results := make([]InstallResult, 0, len(instructions))

	for _, instruction := range instructions {
		parts := strings.Fields(instruction)
		if len(parts) == 0 {
			continue
		}

		results = append(results, runInstallInstruction(ctx, instruction, parts, cwd))
	}

	return results
}

func runInstallInstruction(ctx context.Context, instruction string, parts []string, cwd string) InstallResult {
	cmdCtx, cancel := context.WithTimeout(ctx, DefaultCommandTimeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, parts[0], parts[1:]...) //nolint:gosec // instruction comes from registry manifest
	cmd.Dir = cwd
	// On timeout, kill the whole process group, so a package manager's own
	// children do not outlive the bound.
	processfx.HardenCommand(cmd)

	output, err := cmd.CombinedOutput()

	result := InstallResult{Command: instruction, Success: err == nil}
	if err != nil {
		if ctx.Err() == nil && errors.Is(cmdCtx.Err(), context.DeadlineExceeded) {
			err = fmt.Errorf("no exit within %v: %w", DefaultCommandTimeout, context.DeadlineExceeded)
		}

		result.Error = strings.TrimSpace(string(output)) + ": " + err.Error()
	}

	return result
}
