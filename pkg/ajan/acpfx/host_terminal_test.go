package acpfx_test

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// This file pins terminal/*.
//
// The property worth the most here is the one in
// TestTerminalOutputIsCompleteWhenTheExitStatusAppears: an agent runs a
// command, waits for it, and reads the output. If "it exited" can be observed
// before the last of its output is retained, the agent reads a truncated
// result and reports a passing test suite as failing, or the reverse.

// runTerminal creates a terminal and returns its id.
func runTerminal(t *testing.T, host *acpfx.Host, script string) string {
	t.Helper()

	resp, err := host.CreateTerminal(t.Context(), &acpfx.CreateTerminalRequest{ //nolint:exhaustruct
		SessionID: testSessionID,
		Command:   "sh",
		Args:      []string{"-c", script},
	})
	if err != nil {
		t.Fatalf("terminal/create: %v", err)
	}

	return resp.TerminalID
}

func terminalOutput(
	t *testing.T,
	host *acpfx.Host,
	terminalID string,
) *acpfx.TerminalOutputResponse {
	t.Helper()

	resp, err := host.TerminalOutput(t.Context(), &acpfx.TerminalOutputRequest{
		SessionID:  testSessionID,
		TerminalID: terminalID,
	})
	if err != nil {
		t.Fatalf("terminal/output: %v", err)
	}

	return resp
}

func waitTerminal(
	t *testing.T,
	host *acpfx.Host,
	terminalID string,
) *acpfx.WaitForTerminalExitResponse {
	t.Helper()

	resp, err := host.WaitForExit(t.Context(), &acpfx.WaitForTerminalExitRequest{
		SessionID:  testSessionID,
		TerminalID: terminalID,
	})
	if err != nil {
		t.Fatalf("terminal/wait_for_exit: %v", err)
	}

	return resp
}

// TestTerminalRunsACommandToCompletion is the happy path end to end.
func TestTerminalRunsACommandToCompletion(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)
	id := runTerminal(t, host, "echo hello; echo oops >&2")

	exit := waitTerminal(t, host, id)
	if exit.ExitCode == nil || *exit.ExitCode != 0 {
		t.Fatalf("exit status = %+v, want code 0", exit)
	}

	out := terminalOutput(t, host, id)

	// Both streams are retained. ACP has one output field, so stderr has to
	// land in it: a command that explains its failure only on stderr would
	// otherwise appear to have failed silently.
	if !strings.Contains(out.Output, "hello") {
		t.Fatalf("stdout missing from output: %q", out.Output)
	}

	if !strings.Contains(out.Output, "oops") {
		t.Fatalf("stderr missing from output: %q", out.Output)
	}

	if out.Truncated {
		t.Fatal("short output reported as truncated")
	}
}

// TestTerminalReportsANonZeroExitCode pins that failure is reported as a
// status, not an error: the agent asked to run a command, and a command that
// fails still ran.
func TestTerminalReportsANonZeroExitCode(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)
	id := runTerminal(t, host, "exit 7")

	exit := waitTerminal(t, host, id)
	if exit.ExitCode == nil || *exit.ExitCode != 7 {
		t.Fatalf("exit status = %+v, want code 7", exit)
	}

	if exit.Signal != nil {
		t.Fatalf("a clean exit reported signal %q", *exit.Signal)
	}
}

// TestTerminalOutputIsCompleteWhenTheExitStatusAppears is the barrier test.
//
// shellfx closes its "process exited" channel *before* closing the output
// channel, so a status gated on the process alone can be observed while the
// last chunks are still queued. An agent that waits for a command and then
// reads its output would lose the tail -- which for a build or a test run is
// the only part that matters, because the verdict is printed last.
//
// # Why the payload is shaped like this
//
// The window between "the process is reaped" and "its output is retained" is
// only as wide as the pump is slow, and the pump is normally fast enough that
// a small payload never catches a missing barrier: an earlier version of this
// test emitted 220 KiB, and 20 consecutive runs against a deliberately broken
// barrier all passed. It was pinning nothing.
//
// Eight MiB against a four MiB limit makes the pump do a four MiB memmove per
// chunk, so it falls reliably behind a process that is already exiting. In
// that state the same break is caught every run.
//
// The assertion is the tail rather than a byte count because truncation is
// expected here: what must hold is that the last thing the command printed
// survived, not that everything did. No polling -- the output is read once,
// immediately after the wait returns.
func TestTerminalOutputIsCompleteWhenTheExitStatusAppears(t *testing.T) {
	t.Parallel()

	const marker = "FINAL-MARKER"

	root := t.TempDir()

	host := acpfx.NewHost(acpfx.HostOptions{OutputByteLimit: 4 << 20}) //nolint:exhaustruct
	host.SessionStarted(testSessionID, acpfx.SessionRoots{Cwd: root, AdditionalDirectories: nil})
	t.Cleanup(host.ReleaseAll)

	id := runTerminal(
		t, host,
		"yes "+strings.Repeat("A", 62)+" | head -n 131072; echo "+marker,
	)

	waitTerminal(t, host, id)

	out := terminalOutput(t, host, id)

	if !strings.HasSuffix(strings.TrimRight(out.Output, "\n"), marker) {
		tail := out.Output[max(0, len(out.Output)-40):]

		t.Fatalf(
			"the last line the command printed is missing: wait_for_exit reported "+
				"it finished while its output was still in flight (retained %d bytes, "+
				"ending %q)",
			len(out.Output), tail,
		)
	}
}

// TestTerminalTruncatesAtACharacterBoundary pins the spec's requirement that
// discarding from the front leaves valid text.
//
// The payload is three-byte runes and the limit is not a multiple of three, so
// a byte-exact cut lands inside a rune. That produces output starting with a
// stray continuation byte -- garbage in the first thing the agent reads.
func TestTerminalTruncatesAtACharacterBoundary(t *testing.T) {
	t.Parallel()

	const limit = 100

	root := t.TempDir()

	host := acpfx.NewHost(acpfx.HostOptions{OutputByteLimit: limit}) //nolint:exhaustruct
	host.SessionStarted(testSessionID, acpfx.SessionRoots{Cwd: root, AdditionalDirectories: nil})
	t.Cleanup(host.ReleaseAll)

	id := runTerminal(
		t, host,
		`i=0; while [ $i -lt 200 ]; do printf '€'; i=$((i+1)); done`,
	)

	waitTerminal(t, host, id)

	out := terminalOutput(t, host, id)

	if !out.Truncated {
		t.Fatalf("600 bytes retained under a %d byte limit without reporting truncation", limit)
	}

	if len(out.Output) > limit {
		t.Fatalf("retained %d bytes, over the %d byte limit", len(out.Output), limit)
	}

	if !utf8.ValidString(out.Output) {
		t.Fatalf("truncation split a character: %q", out.Output)
	}

	if strings.Trim(out.Output, "€") != "" {
		t.Fatalf("output contains something other than the payload: %q", out.Output)
	}
}

// TestTerminalKillKeepsTheOutput pins that killing does not discard what the
// command printed. That output is usually the reason it had to be killed.
func TestTerminalKillKeepsTheOutput(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)
	id := runTerminal(t, host, "echo started; sleep 30")

	waitFor(t, "the command to print", func() bool {
		return strings.Contains(terminalOutput(t, host, id).Output, "started")
	})

	if _, err := host.KillTerminal(t.Context(), &acpfx.KillTerminalRequest{
		SessionID:  testSessionID,
		TerminalID: id,
	}); err != nil {
		t.Fatalf("terminal/kill: %v", err)
	}

	out := terminalOutput(t, host, id)

	if !strings.Contains(out.Output, "started") {
		t.Fatalf("output lost after kill: %q", out.Output)
	}

	if out.ExitStatus == nil {
		t.Fatal("a killed command reported no exit status")
	}

	// We killed it, so we can name the signal. Anything else would be guessing.
	if out.ExitStatus.Signal == nil || *out.ExitStatus.Signal != "SIGKILL" {
		t.Fatalf("exit status = %+v, want signal SIGKILL", out.ExitStatus)
	}
}

// TestTerminalReleaseFreesTheID pins that a released terminal is gone, so a
// stale id cannot read another command's output later.
func TestTerminalReleaseFreesTheID(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)
	id := runTerminal(t, host, "echo done")

	waitTerminal(t, host, id)

	if _, err := host.ReleaseTerminal(t.Context(), &acpfx.ReleaseTerminalRequest{
		SessionID:  testSessionID,
		TerminalID: id,
	}); err != nil {
		t.Fatalf("terminal/release: %v", err)
	}

	_, err := host.TerminalOutput(t.Context(), &acpfx.TerminalOutputRequest{
		SessionID:  testSessionID,
		TerminalID: id,
	})
	if !errors.Is(err, acpfx.ErrNoSuchTerminal) {
		t.Fatalf("a released terminal was still readable: %v", err)
	}
}

// TestTerminalIsScopedToItsSession pins that one session cannot reach
// another's terminals by id.
func TestTerminalIsScopedToItsSession(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)

	other := t.TempDir()
	host.SessionStarted("sess-2", acpfx.SessionRoots{Cwd: other, AdditionalDirectories: nil})

	id := runTerminal(t, host, "echo secret")
	waitTerminal(t, host, id)

	_, err := host.TerminalOutput(t.Context(), &acpfx.TerminalOutputRequest{
		SessionID:  "sess-2",
		TerminalID: id,
	})
	if !errors.Is(err, acpfx.ErrNoSuchTerminal) {
		t.Fatalf("session 2 read session 1's terminal: %v", err)
	}
}

// TestTerminalCapIsPerSession bounds a runaway agent. Without it, a loop that
// creates terminals leaves one live process per iteration for the lifetime of
// the connection.
func TestTerminalCapIsPerSession(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	host := acpfx.NewHost(acpfx.HostOptions{MaxTerminals: 2}) //nolint:exhaustruct
	host.SessionStarted(testSessionID, acpfx.SessionRoots{Cwd: root, AdditionalDirectories: nil})
	t.Cleanup(host.ReleaseAll)

	first := runTerminal(t, host, "sleep 30")
	runTerminal(t, host, "sleep 30")

	_, err := host.CreateTerminal(t.Context(), &acpfx.CreateTerminalRequest{ //nolint:exhaustruct
		SessionID: testSessionID,
		Command:   "sh",
		Args:      []string{"-c", "sleep 30"},
	})
	if !errors.Is(err, acpfx.ErrTooManyTerminals) {
		t.Fatalf("the third terminal was allowed past a cap of 2: %v", err)
	}

	// Releasing one returns the slot: the cap counts live terminals, not
	// terminals ever created.
	if _, err := host.ReleaseTerminal(t.Context(), &acpfx.ReleaseTerminalRequest{
		SessionID:  testSessionID,
		TerminalID: first,
	}); err != nil {
		t.Fatalf("terminal/release: %v", err)
	}

	runTerminal(t, host, "sleep 30")
}

// TestTerminalRunsInTheSessionCwd pins the default working directory. Without
// it a command runs wherever the daemon started, which is never what the agent
// meant by a relative path.
func TestTerminalRunsInTheSessionCwd(t *testing.T) {
	t.Parallel()

	host, root := newHostSession(t)
	id := runTerminal(t, host, "pwd")

	waitTerminal(t, host, id)

	got := strings.TrimSpace(terminalOutput(t, host, id).Output)
	if got != root {
		t.Fatalf("cwd = %q, want %q", got, root)
	}
}

// TestTerminalCwdIsConfinedToTheRoots pins that the requested cwd goes through
// the same jail as fs/*.
//
// This bounds where a command starts, not what it can reach: the command runs
// with our privileges, and ACP gates that with session/request_permission
// rather than with a path check.
func TestTerminalCwdIsConfinedToTheRoots(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)
	outside := t.TempDir()

	_, err := host.CreateTerminal(t.Context(), &acpfx.CreateTerminalRequest{ //nolint:exhaustruct
		SessionID: testSessionID,
		Command:   "sh",
		Args:      []string{"-c", "pwd"},
		Cwd:       outside,
	})
	if !errors.Is(err, acpfx.ErrPathOutsideRoots) {
		t.Fatalf("a terminal started outside the session roots: %v", err)
	}
}

// TestTerminalEnvOverlaysTheProcessEnvironment pins that requested variables
// are added to the environment rather than replacing it.
//
// Replacing it hands the command no PATH, no HOME and no locale, so most of
// what an agent runs fails -- and fails in ways that look like a broken
// machine rather than a broken environment.
func TestTerminalEnvOverlaysTheProcessEnvironment(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)

	resp, err := host.CreateTerminal(t.Context(), &acpfx.CreateTerminalRequest{ //nolint:exhaustruct
		SessionID: testSessionID,
		Command:   "sh",
		Args:      []string{"-c", `echo "var=$EASY_MARKER path=${PATH:+set}"`},
		Env:       []acpfx.EnvVariable{{Name: "EASY_MARKER", Value: "present"}},
	})
	if err != nil {
		t.Fatalf("terminal/create: %v", err)
	}

	waitTerminal(t, host, resp.TerminalID)

	out := terminalOutput(t, host, resp.TerminalID).Output

	if !strings.Contains(out, "var=present") {
		t.Fatalf("the requested variable did not reach the command: %q", out)
	}

	if !strings.Contains(out, "path=set") {
		t.Fatalf("the inherited environment was replaced: %q", out)
	}
}

// TestTerminalDeniesUnregisteredSession pins the same fail-closed default the
// fs path has: no roots, no terminals.
func TestTerminalDeniesUnregisteredSession(t *testing.T) {
	t.Parallel()

	host := acpfx.NewHost(acpfx.HostOptions{}) //nolint:exhaustruct
	t.Cleanup(host.ReleaseAll)

	_, err := host.CreateTerminal(t.Context(), &acpfx.CreateTerminalRequest{ //nolint:exhaustruct
		SessionID: "never-registered",
		Command:   "sh",
		Args:      []string{"-c", "echo hi"},
	})
	if !errors.Is(err, acpfx.ErrNoSessionRoots) {
		t.Fatalf("an unregistered session started a process: %v", err)
	}
}

// TestReleaseAllReapsLiveTerminals pins connection teardown.
//
// ACP v1 has no method that ends a session, so nothing in the protocol ever
// releases a terminal the agent forgot about. Without this the processes
// outlive the connection.
func TestReleaseAllReapsLiveTerminals(t *testing.T) {
	t.Parallel()

	host, _ := newHostSession(t)

	id := runTerminal(t, host, "sleep 30")

	host.ReleaseAll()

	_, err := host.TerminalOutput(t.Context(), &acpfx.TerminalOutputRequest{
		SessionID:  testSessionID,
		TerminalID: id,
	})
	if !errors.Is(err, acpfx.ErrNoSuchTerminal) {
		t.Fatalf("a terminal survived ReleaseAll: %v", err)
	}
}

// TestTerminalOverTheWire drives the whole capability through a real
// connection, so the typed dispatch added to HandleRequest is covered too.
func TestTerminalOverTheWire(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	agent := &scriptedAgent{cancelCh: make(chan string, 1)} //nolint:exhaustruct
	handler := &hostClient{Host: acpfx.NewHost(acpfx.HostOptions{})}
	t.Cleanup(handler.ReleaseAll)

	connected, served := connectHandler(t, handler, agent)

	session, err := connected.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: root,
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	created, err := served.CreateTerminal(t.Context(), &acpfx.CreateTerminalRequest{ //nolint:exhaustruct
		SessionID: session.ID(),
		Command:   "sh",
		Args:      []string{"-c", "echo wired; exit 3"},
	})
	if err != nil {
		t.Fatalf("agent-initiated terminal/create: %v", err)
	}

	exit, err := served.WaitForTerminalExit(t.Context(), &acpfx.WaitForTerminalExitRequest{
		SessionID:  session.ID(),
		TerminalID: created.TerminalID,
	})
	if err != nil {
		t.Fatalf("agent-initiated terminal/wait_for_exit: %v", err)
	}

	if exit.ExitCode == nil || *exit.ExitCode != 3 {
		t.Fatalf("exit status = %+v, want code 3", exit)
	}

	out, err := served.TerminalOutput(t.Context(), &acpfx.TerminalOutputRequest{
		SessionID:  session.ID(),
		TerminalID: created.TerminalID,
	})
	if err != nil {
		t.Fatalf("agent-initiated terminal/output: %v", err)
	}

	if strings.TrimSpace(out.Output) != "wired" {
		t.Fatalf("output = %q", out.Output)
	}

	if _, err := served.ReleaseTerminal(t.Context(), &acpfx.ReleaseTerminalRequest{
		SessionID:  session.ID(),
		TerminalID: created.TerminalID,
	}); err != nil {
		t.Fatalf("agent-initiated terminal/release: %v", err)
	}
}

// TestTerminalPathsAreSchemaShaped is the structural check for the wire types
// added here, matching what schema_conformance_test.go does for the rest.
func TestTerminalPathsAreSchemaShaped(t *testing.T) {
	t.Parallel()

	limit := 4096
	code := 0
	signal := "SIGKILL"

	validateAgainst(t, "CreateTerminalRequest", &acpfx.CreateTerminalRequest{
		SessionID:       "sess-1",
		Command:         "go",
		Args:            []string{"test", "./..."},
		Env:             []acpfx.EnvVariable{{Name: "CI", Value: "1"}},
		Cwd:             filepath.Join(t.TempDir(), "sub"),
		OutputByteLimit: &limit,
	})

	validateAgainst(t, "CreateTerminalResponse", &acpfx.CreateTerminalResponse{
		TerminalID: "term-1",
	})

	validateAgainst(t, "TerminalOutputResponse", &acpfx.TerminalOutputResponse{
		Output:     "hello",
		Truncated:  true,
		ExitStatus: &acpfx.TerminalExitStatus{ExitCode: &code, Signal: nil},
	})

	// The unknown-ending encoding: both fields null. It has to validate, or the
	// honest answer would be unsendable and something would have to be invented.
	validateAgainst(t, "TerminalOutputResponse", &acpfx.TerminalOutputResponse{
		Output:     "",
		Truncated:  false,
		ExitStatus: &acpfx.TerminalExitStatus{ExitCode: nil, Signal: nil},
	})

	validateAgainst(t, "WaitForTerminalExitResponse", &acpfx.WaitForTerminalExitResponse{
		ExitCode: nil,
		Signal:   &signal,
	})

	validateAgainst(t, "ReadTextFileRequest", &acpfx.ReadTextFileRequest{
		SessionID: "sess-1",
		Path:      "/tmp/x.txt",
		Line:      &code,
		Limit:     &limit,
	})

	validateAgainst(t, "ReadTextFileResponse", &acpfx.ReadTextFileResponse{Content: "x"})

	validateAgainst(t, "WriteTextFileRequest", &acpfx.WriteTextFileRequest{
		SessionID: "sess-1",
		Path:      "/tmp/x.txt",
		Content:   "x",
	})
}
