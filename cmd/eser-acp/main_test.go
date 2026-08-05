// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main_test

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// recordingHandler is the client half: it records the transcript in the order
// it was delivered.
type recordingHandler struct {
	mu      sync.Mutex
	updates []acpfx.SessionUpdate
}

func (h *recordingHandler) RequestPermission(
	_ context.Context,
	_ *acpfx.RequestPermissionRequest,
) (acpfx.PermissionOutcome, error) {
	return acpfx.CancelPermission(), nil
}

func (h *recordingHandler) SessionUpdate(_ context.Context, note *acpfx.SessionNotification) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.updates = append(h.updates, note.Update)
}

// texts returns the text of every agent message chunk, in delivery order.
func (h *recordingHandler) texts() []string {
	h.mu.Lock()
	defer h.mu.Unlock()

	out := make([]string, 0, len(h.updates))

	for _, update := range h.updates {
		if update.SessionUpdate == acpfx.UpdateAgentMessageChunk && update.Content != nil {
			out = append(out, update.Content.Text)
		}
	}

	return out
}

// These tests drive the compiled binary, not the packages inside it.
//
// Everything below the main function is already covered in-process by the
// acpfx and shim suites. What only a real binary can exercise is the wiring
// main itself owns: flag parsing, backend selection, and the decision to serve
// the protocol on os.Stdin/os.Stdout -- plus the behaviour of a process whose
// stdin reaches EOF, which is how a real client shuts an agent down and is the
// one path that has to work when nothing is left to read.

const (
	// fakeVendorEnv selects the fake vendor CLI mode. It is read by TestMain in
	// the child, and propagates two process levels: the test spawns eser-acp,
	// which spawns the vendor with an inherited environment.
	fakeVendorEnv = "ESER_ACP_FAKE_VENDOR"

	fakeVendorTurn  = "turn"
	fakeVendorNoisy = "noisy"

	// fakeVendorKiro answers in kiro's JSONL vocabulary, reporting its own argv
	// so a test can see which flags main built.
	fakeVendorKiro = "kiro"
)

// binaryPath is the compiled eser-acp under test, built once for the package.
var binaryPath string //nolint:gochecknoglobals

func TestMain(m *testing.M) {
	// Intercept before the testing framework parses flags: the fake vendor is
	// invoked with claude's flags (--print, --output-format, ...), which the
	// flag package would reject.
	if mode := os.Getenv(fakeVendorEnv); mode != "" {
		runFakeVendor(mode)
	}

	os.Exit(buildAndRun(m))
}

// buildAndRun compiles the binary, runs the suite, and cleans up. It is
// separate from TestMain so the deferred cleanup runs before os.Exit.
func buildAndRun(m *testing.M) int {
	dir, err := os.MkdirTemp("", "eser-acp-build")
	if err != nil {
		panic(err)
	}

	defer func() { _ = os.RemoveAll(dir) }()

	binaryPath = filepath.Join(dir, "eser-acp")

	build := exec.Command("go", "build", "-o", binaryPath, ".")

	if out, err := build.CombinedOutput(); err != nil {
		panic("building eser-acp: " + err.Error() + "\n" + string(out))
	}

	return m.Run()
}

// runFakeVendor impersonates the claude CLI's stream-json mode. It never
// returns.
func runFakeVendor(mode string) {
	if mode == fakeVendorNoisy {
		// A vendor that chatters on stderr. eser-acp must keep this off its own
		// stdout, which is the protocol stream.
		_, _ = os.Stderr.WriteString("warning: config file not found\n")
	}

	encoder := json.NewEncoder(os.Stdout)
	emit := func(event map[string]any) { _ = encoder.Encode(event) }

	if mode == fakeVendorKiro {
		emit(map[string]any{"type": "content", "text": "ARGV: " + strings.Join(os.Args[1:], " ")})
		emit(map[string]any{"type": "done"})
		os.Exit(0)
	}

	emit(map[string]any{"type": "system", "subtype": "init", "session_id": "vendor-1"})

	// Several chunks, numbered, so the client can assert the transcript was
	// neither reordered nor truncated across two process boundaries.
	content := make([]map[string]any, 0, binaryChunks)
	for i := range binaryChunks {
		content = append(content, map[string]any{"type": "text", "text": strconv.Itoa(i)})
	}

	emit(map[string]any{
		"type":       "assistant",
		"session_id": "vendor-1",
		"message":    map[string]any{"content": content},
	})

	emit(map[string]any{"type": "result", "subtype": "success", "session_id": "vendor-1"})

	os.Exit(0)
}

// binaryChunks is how many text blocks the fake vendor streams in one turn.
const binaryChunks = 64

// TestBinaryDrivesAFullTurn is the conformance test the plan asks for, against
// an agent we ship rather than one we install.
//
// The client here is the real acpfx client spawning the real eser-acp binary as
// a subprocess and speaking ACP to it over real OS pipes. Only the vendor CLI
// is a stand-in, and it stands in for a wire format rather than for any of our
// code.
func TestBinaryDrivesAFullTurn(t *testing.T) {
	handler := &recordingHandler{} //nolint:exhaustruct

	client, err := acpfx.Spawn(t.Context(), acpfx.SpawnOptions{ //nolint:exhaustruct
		Command: binaryPath,
		Args:    []string{"--backend", "claude-code", "--command", os.Args[0]},
		Env:     append(os.Environ(), fakeVendorEnv+"="+fakeVendorTurn),
	}, handler, &acpfx.Implementation{
		Name: "conformance", Title: "conformance", Version: "0.0.0",
	})
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	t.Cleanup(func() { _ = client.Close() })

	info := client.AgentInfo()
	if info == nil || info.Name != "claude-code" {
		t.Fatalf("agent info = %+v, want name claude-code", info)
	}

	// The shim declares loadSession false because --resume needs a vendor
	// session id it cannot know cold. An agent that over-declares here is worse
	// than one that under-declares, so pin it.
	if client.AgentCapabilities().LoadSession {
		t.Fatal("the shim advertised loadSession, which it cannot honour cold")
	}

	session, err := client.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	resp, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hello")})
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stopReason = %q, want end_turn", resp.StopReason)
	}

	// Read once, with no polling: across two process boundaries the turn's
	// transcript must be complete and in order when Prompt hands back.
	texts := handler.texts()
	if len(texts) != binaryChunks {
		t.Fatalf(
			"Prompt returned with %d of %d chunks delivered",
			len(texts), binaryChunks,
		)
	}

	for i, text := range texts {
		if text != strconv.Itoa(i) {
			t.Fatalf("chunk %d is %q: the transcript was reordered", i, text)
		}
	}
}

// TestBinaryRepliesBeforeExitingOnStdinEOF is a regression test for a defect
// that only a real process could show.
//
// Feeding frames from a file closes stdin as soon as they are read. The agent
// sees EOF while its handlers are still running, and an implementation that
// treats "the client stopped sending" as "the connection is gone" tears the
// write side down before the replies are written -- so the process exits 0
// having answered nothing. Every in-process test missed this because a pipe
// held open by a live client never reaches EOF mid-turn.
func TestBinaryRepliesBeforeExitingOnStdinEOF(t *testing.T) {
	frames := strings.Join([]string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize",` +
			`"params":{"protocolVersion":1,"clientCapabilities":{}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"session/new",` +
			`"params":{"cwd":"/tmp","mcpServers":[]}}`,
	}, "\n") + "\n"

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath)
	cmd.Stdin = strings.NewReader(frames)

	var stderr strings.Builder

	cmd.Stderr = &stderr

	stdout, err := cmd.Output()
	if err != nil {
		t.Fatalf("eser-acp exited with %v (stderr: %s)", err, stderr.String())
	}

	replies := parseFrames(t, stdout)

	for _, id := range []int{1, 2} {
		reply, ok := replies[id]
		if !ok {
			t.Fatalf(
				"no reply to request %d; the agent exited on stdin EOF without "+
					"answering (stdout: %q)",
				id, string(stdout),
			)
		}

		if reply.Error != nil {
			t.Fatalf("request %d failed: %v", id, reply.Error)
		}

		if len(reply.Result) == 0 {
			t.Fatalf("request %d got a reply with no result", id)
		}
	}
}

// TestBinaryKeepsStdoutClean pins the contract that makes stdio usable as a
// protocol stream: a vendor that writes diagnostics must not corrupt it.
//
// A single stray line on stdout desynchronises the client's decoder for the
// rest of the connection, so this is a fail-the-session bug rather than a
// cosmetic one.
func TestBinaryKeepsStdoutClean(t *testing.T) {
	handler := &recordingHandler{} //nolint:exhaustruct

	client, err := acpfx.Spawn(t.Context(), acpfx.SpawnOptions{ //nolint:exhaustruct
		Command: binaryPath,
		Args:    []string{"--command", os.Args[0]},
		Env:     append(os.Environ(), fakeVendorEnv+"="+fakeVendorNoisy),
	}, handler, &acpfx.Implementation{
		Name: "conformance", Title: "conformance", Version: "0.0.0",
	})
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	t.Cleanup(func() { _ = client.Close() })

	session, err := client.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	// A turn completing at all proves the stream stayed parseable: the client's
	// decoder would have failed on any non-frame line the vendor's stderr leaked
	// onto stdout.
	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hello")},
	); err != nil {
		t.Fatalf("Prompt after the vendor wrote to stderr: %v", err)
	}

	if got := len(handler.texts()); got != binaryChunks {
		t.Fatalf("got %d chunks, want %d", got, binaryChunks)
	}
}

// TestBinarySelectsTheRequestedBackend pins the wiring main owns: --backend
// picks the implementation, and --model reaches the vendor's argv.
//
// Both are only observable from outside the process. In-process tests
// construct a backend directly and so cannot tell whether the flag that names
// it is connected to anything -- a selectBackend that ignored --backend
// entirely would pass every one of them.
func TestBinarySelectsTheRequestedBackend(t *testing.T) {
	handler := &recordingHandler{} //nolint:exhaustruct

	client, err := acpfx.Spawn(t.Context(), acpfx.SpawnOptions{ //nolint:exhaustruct
		Command: binaryPath,
		Args: []string{
			"--backend", "kiro", "--command", os.Args[0], "--model", "sonnet-test",
		},
		Env: append(os.Environ(), fakeVendorEnv+"="+fakeVendorKiro),
	}, handler, &acpfx.Implementation{
		Name: "conformance", Title: "conformance", Version: "0.0.0",
	})
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	t.Cleanup(func() { _ = client.Close() })

	if info := client.AgentInfo(); info == nil || info.Name != "kiro" {
		t.Fatalf("agent info = %+v, want name kiro -- --backend was ignored", info)
	}

	session, err := client.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hello")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	argv := strings.Join(handler.texts(), "")

	for _, want := range []string{"--output json", "--model sonnet-test"} {
		if !strings.Contains(argv, want) {
			t.Fatalf("vendor invocation missing %q: %q", want, argv)
		}
	}
}

// TestBinaryRejectsUnknownBackend pins that a misconfiguration fails loudly on
// stderr and exits non-zero, rather than starting an agent that serves nothing.
func TestBinaryRejectsUnknownBackend(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, "--backend", "nonesuch")
	cmd.Stdin = strings.NewReader("")

	output, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatal("eser-acp exited 0 with an unknown backend")
	}

	if !strings.Contains(string(output), "nonesuch") {
		t.Fatalf("error output does not name the bad backend: %q", string(output))
	}
}

// parseFrames indexes JSON-RPC replies by request id.
//
// Indexing rather than comparing positions is deliberate: requests are served
// concurrently, so replies may be written in any order. JSON-RPC correlates by
// id, and a test that assumed order would be asserting something the protocol
// does not promise.
func parseFrames(t *testing.T, stdout []byte) map[int]frame {
	t.Helper()

	replies := make(map[int]frame)

	for line := range strings.Lines(string(stdout)) {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		var msg frame
		if err := json.Unmarshal([]byte(trimmed), &msg); err != nil {
			t.Fatalf("stdout carried a non-frame line %q: %v", trimmed, err)
		}

		if msg.JSONRPC != "2.0" {
			t.Fatalf("frame %q is not JSON-RPC 2.0", trimmed)
		}

		if msg.ID != nil {
			replies[*msg.ID] = msg
		}
	}

	return replies
}

type frame struct {
	ID      *int            `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *acpfx.Error    `json:"error"`
	JSONRPC string          `json:"jsonrpc"`
}
