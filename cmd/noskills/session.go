// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"io"
	"strconv"
	"strings"
	"sync"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The commands of TASK-259.1: session (commands/session.ts), config
// (commands/config.ts) and diagrams (commands/diagrams.ts), on
// noskillsfx. They print what the TypeScript commands print, except where
// the README's list of differences says otherwise.

// sessionCommands are the first words this file and its siblings answer.
func sessionCommands() []string {
	return []string{"session", "config", "diagrams"}
}

// runSessionCommand answers session, config or diagrams and returns the
// exit code.
func runSessionCommand(ctx context.Context, e *env, args []string) int {
	l := &lifecycleRun{e: e, args: args, mu: sync.Mutex{}, warned: map[string]bool{}}

	var (
		code int
		err  error
	)

	switch args[0] {
	case "session":
		code, err = l.session(args[1:])
	case "config":
		code, err = l.config(ctx, args[1:])
	default:
		code, err = l.diagrams(args[1:])
	}

	if err != nil {
		_, _ = io.WriteString(e.stderr, "noskills: "+err.Error()+"\n")

		return clifx.ExitFailure
	}

	return code
}

func (l *lifecycleRun) session(args []string) (int, error) {
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch sub {
	case "start":
		return l.sessionStart(root, prefix, args[1:])
	case "end":
		return l.sessionEnd(root, args[1:]), nil
	case "list":
		l.sessionList(root, prefix)

		return clifx.ExitOK, nil
	case "gc":
		l.sessionGc(root)

		return clifx.ExitOK, nil
	}

	out := l.e.stdout
	writeln(out, "Usage: "+prefix+" session <start | end | list | gc>")
	writeln(out, "")
	writeln(out, dim("  start --spec=<name>   Bind to a spec"))
	writeln(out, dim("  start --free          Idle mode (no spec, no enforcement)"))
	writeln(out, dim("  start --auto          Auto-detect spec or idle"))
	writeln(out, dim("  end [--id=<id>]       End current/specific session"))
	writeln(out, dim("  list                  Show active sessions"))
	writeln(out, dim("  gc                    Remove stale sessions"))

	return clifx.ExitOK, nil
}

// sessionPhase is the phase resolveState gives a spec; sessionStart has
// refused an empty name before it asks.
func (l *lifecycleRun) sessionPhase(root, spec, prefix string) (string, error) {
	state, err := noskillsfx.ResolveState(root, spec, prefix, l.warn)
	if err != nil {
		return "", err //nolint:wrapcheck // the message is the TypeScript one
	}

	return noskillsfx.StringField(state, "phase"), nil
}

func (l *lifecycleRun) sessionStart(root, prefix string, args []string) (int, error) { //nolint:cyclop,funlen // the steps of sessionStart, in order
	out := l.e.stdout

	if !noskillsfx.IsHookInitialized(root) {
		writeln(out, red("noskills is not initialized."), " Run: ", bold(prefix+" init"))

		return clifx.ExitFailure, nil
	}

	var spec *string

	free, auto := false, false

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--spec="):
			value := strings.TrimPrefix(arg, "--spec=")
			spec = &value
		case arg == "--free":
			free = true
		case arg == "--auto":
			auto = true
		}
	}

	// The modes exclude each other: a free session that names a spec, or an
	// auto pick that drops the spec asked for, would bind something else.
	if (spec != nil && (free || auto)) || (free && auto) {
		writeln(out, red("Use only one of --spec=<name>, --free or --auto."))

		return clifx.ExitFailure, nil
	}

	if spec != nil && *spec == "" {
		writeln(out, red("--spec needs a spec name."))
		writeln(out, dim("Example: "+prefix+" session start --spec=my-feature"))

		return clifx.ExitFailure, nil
	}

	if auto {
		var active []string

		for _, entry := range noskillsfx.ListSpecStateObjects(root, l.warn) {
			phase := noskillsfx.StringField(entry.State, "phase")
			if phase != noskillsfx.PhaseCompleted && phase != noskillsfx.PhaseIdle {
				active = append(active, entry.Name)
			}
		}

		if len(active) == 1 {
			spec = &active[0]
		} else {
			free = true
		}
	}

	if spec == nil && !free {
		writeln(out, red("Specify --spec=<name>, --free, or --auto."))
		writeln(out, dim("Example: "+prefix+" session start --spec=my-feature"))

		return clifx.ExitFailure, nil
	}

	var phase *string

	if spec != nil {
		resolved, err := l.sessionPhase(root, *spec, prefix)
		if err != nil {
			writeln(out, red("Error: "+err.Error()))

			return clifx.ExitFailure, nil
		}

		phase = &resolved
	}

	id, err := noskillsfx.GenerateSessionID()
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the operation
	}

	mode := noskillsfx.SessionModeSpec
	recorded := phase

	if free {
		mode = noskillsfx.SessionModeFree
		recorded = nil
	}

	now := noskillsfx.ISOTime(l.e.now())

	err = noskillsfx.CreateSession(root, &noskillsfx.Session{
		ID:    id,
		Spec:  spec,
		Mode:  mode,
		Phase: recorded,
		// 0 means no owning process. This process exits as soon as it
		// prints the export lines, so its own pid would name a dead
		// process, and the agent that later works in the session is not
		// known here.
		Pid:          0,
		StartedAt:    now,
		LastActiveAt: now,
		Tool:         noskillsfx.CodingToolClaudeCode,
		ProjectRoot:  root,
	})
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	writeln(out, green("Session started."))
	writeln(out, "  ID:   ", bold(id))
	writeln(out, "  Mode: ", bold(mode))

	if spec != nil {
		writeln(out, "  Spec: ", bold(*spec))

		if phase != nil {
			writeln(out, "  Phase: ", dim(*phase))
		}
	}

	writeln(out, "")
	writeln(out, "Run:")
	writeln(out, bold("  export NOSKILLS_SESSION="+id))
	writeln(out, bold("  export NOSKILLS_PROJECT_ROOT="+root))

	return clifx.ExitOK, nil
}

func (l *lifecycleRun) sessionEnd(root string, args []string) int {
	out := l.e.stdout

	var id *string

	for _, arg := range args {
		if value, found := strings.CutPrefix(arg, "--id="); found {
			id = &value
		}
	}

	if id == nil {
		if value, set := l.e.lookupEnv("NOSKILLS_SESSION"); set {
			id = &value
		}
	}

	if id == nil {
		writeln(out, red("No session specified. Use --id=<id> or set NOSKILLS_SESSION env var."))

		return clifx.ExitFailure
	}

	if !noskillsfx.DeleteSession(root, *id) {
		writeln(out, red("Session not found: "+*id))

		return clifx.ExitFailure
	}

	writeln(out, green("Session ended: "), dim(*id))

	return clifx.ExitOK
}

func (l *lifecycleRun) sessionList(root, prefix string) {
	out := l.e.stdout
	lines := noskillsfx.SessionLines(root, l.e.now())

	writeln(out, bold("Sessions"))
	writeln(out, "")

	if len(lines) == 0 {
		writeln(out, dim("  No active sessions. Start one with: "+prefix+" session start --spec=<name>"))

		return
	}

	for _, line := range lines {
		stale := ""
		if line.Stale {
			stale = red(" (stale)")
		}

		writeln(out, "  ", bold(line.ID), "  ", dim(noskillsfx.JSPadEnd(line.Mode, 25)), " ",
			dim(noskillsfx.JSPadEnd(line.Phase, 18)), " ", dim(line.Age), stale)
	}
}

func (l *lifecycleRun) sessionGc(root string) {
	out := l.e.stdout
	removed := noskillsfx.GcStaleSessions(root, l.e.now())

	if len(removed) == 0 {
		writeln(out, dim("No stale sessions to remove."))

		return
	}

	writeln(out, green("Removed "+strconv.Itoa(len(removed))+" stale session(s):"))

	for _, id := range removed {
		writeln(out, "  ", dim(id))
	}
}
