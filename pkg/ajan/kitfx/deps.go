// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
func InstallDependencies(instructions []string, cwd string) []InstallResult {
	results := make([]InstallResult, 0, len(instructions))

	for _, instruction := range instructions {
		parts := strings.Fields(instruction)
		if len(parts) == 0 {
			continue
		}

		cmd := exec.Command(parts[0], parts[1:]...) //nolint:gosec // instruction comes from registry manifest
		cmd.Dir = cwd

		output, err := cmd.CombinedOutput()

		result := InstallResult{Command: instruction, Success: err == nil}
		if err != nil {
			result.Error = strings.TrimSpace(string(output)) + ": " + err.Error()
		}

		results = append(results, result)
	}

	return results
}
