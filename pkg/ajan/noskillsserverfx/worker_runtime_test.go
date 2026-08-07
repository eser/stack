package noskillsserverfx

import (
	"errors"
	"strings"
	"testing"
)

// The mux worker is plain TypeScript importing node: builtins and workspace
// packages. Deno and Bun run that directly; Node needs a loader. None of it is
// Deno-specific, and hardcoding `deno` made a Deno install a hard requirement
// for mux sessions on a machine that already had a working runtime.
func TestWorkerRuntimeHonoursTheOverride(t *testing.T) {
	for _, tc := range []struct{ forced, wantCmd, wantArg string }{
		{"deno", "deno", "run"},
		{"bun", "bun", "run"},
		{"node", "node", "/w.ts"},
	} {
		t.Setenv(envWorkerRuntime, tc.forced)

		cmd, args, err := workerRuntime("/w.ts", "/s.sock")
		if err != nil {
			t.Fatalf("%s: %v", tc.forced, err)
		}

		if cmd != tc.wantCmd || args[0] != tc.wantArg {
			t.Fatalf("%s -> %s %v", tc.forced, cmd, args)
		}

		if args[len(args)-1] != "/s.sock" || args[len(args)-2] != "/w.ts" {
			t.Fatalf("%s dropped its arguments: %v", tc.forced, args)
		}
	}
}

func TestWorkerRuntimeRejectsAnUnknownOverride(t *testing.T) {
	t.Setenv(envWorkerRuntime, "rhino")

	_, _, err := workerRuntime("/w.ts", "/s.sock")
	if !errors.Is(err, ErrWorkerRuntimeMissing) {
		t.Fatalf("error = %v, want ErrWorkerRuntimeMissing", err)
	}

	// The message must name what was asked for and what is accepted; "not found"
	// alone sends someone looking for an install problem they do not have.
	if !strings.Contains(err.Error(), "rhino") || !strings.Contains(err.Error(), "deno") {
		t.Fatalf("unhelpful message: %v", err)
	}
}

// Without an override it must find a runtime on any machine that has one. This
// asserts discovery works at all, not which one wins.
func TestWorkerRuntimeDiscoversOne(t *testing.T) {
	cmd, args, err := workerRuntime("/w.ts", "/s.sock")
	if err != nil {
		t.Skip("no javascript runtime on this machine")
	}

	if cmd != "deno" && cmd != "bun" && cmd != "node" {
		t.Fatalf("unexpected runtime %q", cmd)
	}

	if len(args) < 2 {
		t.Fatalf("args too short: %v", args)
	}
}
