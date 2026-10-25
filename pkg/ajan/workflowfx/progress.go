// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"fmt"
	"io"
	"strings"
)

// progressColumn is where the status column starts, as in the TypeScript run
// command (pkg/@eserstack/workflows/run.ts).
const progressColumn = 50

// ProgressPrinter returns an OnStepEnd callback that prints each step as it
// ends, in the TypeScript run command's format:
//
//	deno-formatter....................................Passed (0.5s)
//	go-lint...........................................Failed (3.3s)
//	  ✗ pkg/x.go:4: message
//
// A step that changed files reports "Fixed (N files, 0.2s)".
func ProgressPrinter(w io.Writer) func(name string, result StepResult) {
	return func(_ string, result StepResult) {
		name := result.Name
		dots := strings.Repeat(".", max(1, progressColumn-len(name)))
		timing := fmt.Sprintf("%.1fs", result.DurationMs/1000)

		var status string

		switch {
		case result.Passed && len(result.Mutations) > 0:
			plural := "s"
			if len(result.Mutations) == 1 {
				plural = ""
			}

			status = fmt.Sprintf("Fixed (%d file%s, %s)", len(result.Mutations), plural, timing)
		case result.Passed:
			status = fmt.Sprintf("Passed (%s)", timing)
		default:
			status = fmt.Sprintf("Failed (%s)", timing)
		}

		_, _ = fmt.Fprintf(w, "%s%s%s\n", name, dots, status)

		if result.Passed {
			return
		}

		for _, issue := range result.Issues {
			location := issue.Path
			if location != "" && issue.Line > 0 {
				location = fmt.Sprintf("%s:%d", issue.Path, issue.Line)
			}

			if location != "" {
				location += ": "
			}

			_, _ = fmt.Fprintf(w, "  ✗ %s%s\n", location, issue.Message)
		}
	}
}
