// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package pty_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/shellfx/pty"
)

// drain reads the whole PTY output until EOF.
func drain(t *testing.T, s *pty.Session) string {
	t.Helper()

	var out strings.Builder

	for {
		chunk, ok := s.Read()
		if !ok {
			break
		}

		out.Write(chunk)
	}

	return out.String()
}

func TestSpawnEchoAndExitCode(t *testing.T) {
	t.Parallel()

	s, err := pty.Spawn(pty.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "printf hello; exit 7"},
		Cols:    80,
		Rows:    24,
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	out := drain(t, s)

	if code := s.Close(); code != 7 {
		t.Errorf("exit code = %d, want 7", code)
	}

	if !strings.Contains(out, "hello") {
		t.Errorf("output = %q, want it to contain %q", out, "hello")
	}
}

func TestChildSeesControllingTTY(t *testing.T) {
	t.Parallel()

	s, err := pty.Spawn(pty.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", "test -t 0 && printf ISATTY"},
		Cols:    80,
		Rows:    24,
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	out := drain(t, s)
	_ = s.Close()

	if !strings.Contains(out, "ISATTY") {
		t.Errorf("output = %q, want the child to report a controlling tty", out)
	}
}

func TestWriteIsReadByChild(t *testing.T) {
	t.Parallel()

	// The child reads one line from the PTY and echoes it back tagged, then
	// exits — deterministic, no timing/kill race.
	s, err := pty.Spawn(pty.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", `read line; printf "got:%s" "$line"`},
		Cols:    80,
		Rows:    24,
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	if err := s.Write([]byte("ping\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	out := drain(t, s)
	_ = s.Close()

	if !strings.Contains(out, "got:ping") {
		t.Errorf("output = %q, want it to contain %q", out, "got:ping")
	}
}

// TestChildSeesTheSizes pins the window size set at spawn and by Resize, as
// the child reads them with stty.
func TestChildSeesTheSizes(t *testing.T) {
	t.Parallel()

	s, err := pty.Spawn(pty.SpawnOptions{
		Command: "sh",
		Args:    []string{"-c", `printf "start:%s\n" "$(stty size)"; read line; printf "after:%s\n" "$(stty size)"`},
		Cols:    91,
		Rows:    17,
	})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	// Resize only once the child has read the first size.
	var out strings.Builder

	for !strings.Contains(out.String(), "start:") {
		chunk, ok := s.Read()
		if !ok {
			t.Fatalf("the child exited early; output %q", out.String())
		}

		out.Write(chunk)
	}

	if err := s.Resize(100, 40); err != nil {
		t.Fatalf("resize: %v", err)
	}

	if err := s.Write([]byte("go\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	out.WriteString(drain(t, s))
	_ = s.Close()

	for _, want := range []string{"start:17 91", "after:40 100"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("output = %q, want it to contain %q", out.String(), want)
		}
	}
}

// TestResizeRacingTheExitIsSafe pins that a resize while the child exits,
// and the master is closed, returns at most an error: run it with -race.
func TestResizeRacingTheExitIsSafe(t *testing.T) {
	t.Parallel()

	s, err := pty.Spawn(pty.SpawnOptions{Command: "sh", Args: []string{"-c", "exit 0"}, Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}

	done := make(chan struct{})

	go func() {
		defer close(done)

		drain(t, s)
	}()

	for {
		select {
		case <-done:
			_ = s.Close()

			return
		default:
			_ = s.Resize(81, 25) // fails once the master is closed, which is the point
			_ = s.Resize(80, 24) // as above
		}
	}
}
