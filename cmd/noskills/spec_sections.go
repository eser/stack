// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// `spec <name> section` (TASK-325): `section [list]` prints the sections
// the completeness gate checks, `section <id> fill "text"` and
// `section <id> na "reason"` resolve one. noskillsfx changes the state
// files; this prints what commands/spec.ts prints.

func (l *lifecycleRun) specSection(ctx context.Context, prefix, spec string, args []string) (int, error) {
	if len(args) == 0 || args[0] == "list" {
		return l.specSectionList(prefix, spec)
	}

	action := ""
	if len(args) > 1 {
		action = args[1]
	}

	text := ""
	if len(args) > 2 {
		text = strings.Join(args[2:], " ")
	}

	result, err := noskillsfx.ResolveSpecSection(ctx, l.lifecycleEnv(l.projectRoot()), spec, args[0], action, text)
	if err != nil {
		if refusal, ok := noskillsfx.IsRefusal(err); ok && refusal.Kind == "usage" {
			writeln(l.e.stdout, refusal.Message)

			return clifx.ExitFailure, nil
		}

		return l.refusalOrError(err)
	}

	out := l.e.stdout
	label := "Section filled: "

	if action == noskillsfx.SectionNA {
		label = "Section marked N/A: "
	}

	writeln(out, green(label), result.Title, dim(" (by "+result.User.Name+")"))

	if !result.FileUpdated {
		writeln(out, yellow("spec.md has no placeholder for "+args[0]+"; only the state records it."))
	}

	switch {
	case len(result.Open) > 0:
		writeln(out, dim("Still open: "+strings.Join(result.Open, ", ")))
	case result.PendingDecisions > 0:
		writeln(out, dim("All sections resolved. Pending decisions: "+itoa(result.PendingDecisions)+"."))
	default:
		writeln(out, dim("All sections resolved."))
	}

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) specSectionList(prefix, spec string) (int, error) {
	entries, err := noskillsfx.SpecSections(l.lifecycleEnv(l.projectRoot()), spec)
	if err != nil {
		return 0, err //nolint:wrapcheck // specOf reports a missing spec as the TypeScript command does
	}

	out := l.e.stdout
	writeln(out, bold("Sections of "+spec))
	writeln(out, "")

	if len(entries) == 0 {
		writeln(out, dim("  No sections."))
	}

	for _, entry := range entries {
		writeln(out, "  "+entry.Symbol+" "+entry.ID, dim("  "+entry.Title+entry.Note))
	}

	writeln(out, "")
	writeln(out, dim("Fill: "+prefix+" spec "+spec+` section <id> fill "text"`))
	writeln(out, dim("N/A:  "+prefix+" spec "+spec+` section <id> na "reason"`))

	return clifx.ExitOK, nil
}
