// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/eser/stack/pkg/ajan/processfx"
)

// projectFiles maps sentinel filenames to their ProjectType.
var projectFiles = map[string]ProjectType{
	"go.mod":       ProjectTypeGo,
	"deno.json":    ProjectTypeDeno,
	"deno.jsonc":   ProjectTypeDeno,
	"package.json": ProjectTypeNode,
}

// DetectProjectType scans dir for well-known build-system files and returns
// the first match. Detection order follows projectFiles map iteration, which
// is non-deterministic; if multiple project files coexist, the result is
// implementation-defined (typically the last-iterated winner).
func DetectProjectType(dir string) ProjectDetection {
	for filename, pt := range projectFiles {
		path := filepath.Join(dir, filename)
		if _, err := os.Stat(path); err == nil {
			return ProjectDetection{Type: pt, ConfigFile: path}
		}
	}

	return ProjectDetection{Type: ProjectTypeUnknown}
}

// GetDependencyInstructions returns shell install commands for the recipe's
// declared dependencies, matched against the detected project type.
//
// Mismatches (e.g. NPM deps in a Go project) are surfaced as Warnings rather
// than errors so callers can display them without blocking.
func GetDependencyInstructions(recipe *Recipe, detection ProjectDetection) DependencyInstructions {
	if recipe.Dependencies == nil {
		return DependencyInstructions{}
	}

	var instructions []string
	var warnings []string

	deps := recipe.Dependencies

	if len(deps.Go) > 0 {
		if detection.Type != ProjectTypeGo && detection.Type != ProjectTypeUnknown {
			warnings = append(warnings,
				fmt.Sprintf("recipe declares Go dependencies but project type is %q", detection.Type),
			)
		}

		for _, pkg := range deps.Go {
			instructions = append(instructions, "go get "+pkg)
		}
	}

	if len(deps.NPM) > 0 {
		if detection.Type != ProjectTypeNode && detection.Type != ProjectTypeUnknown {
			warnings = append(warnings,
				fmt.Sprintf("recipe declares npm dependencies but project type is %q", detection.Type),
			)
		}

		if len(deps.NPM) == 1 {
			instructions = append(instructions, "npm install "+deps.NPM[0])
		} else {
			instructions = append(instructions, "npm install "+strings.Join(deps.NPM, " "))
		}
	}

	if len(deps.JSR) > 0 {
		if detection.Type != ProjectTypeDeno && detection.Type != ProjectTypeNode && detection.Type != ProjectTypeUnknown {
			warnings = append(warnings,
				fmt.Sprintf("recipe declares JSR dependencies but project type is %q", detection.Type),
			)
		}

		for _, pkg := range deps.JSR {
			instructions = append(instructions, "deno add "+pkg)
		}
	}

	return DependencyInstructions{
		Instructions: instructions,
		Warnings:     warnings,
	}
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
