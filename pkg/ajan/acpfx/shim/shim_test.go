// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim_test

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/acpfx/shim"
)

// These tests drive the whole stack: a real acpfx.Client, over a real pipe, to
// a real acpfx.Agent running the real Shim, which spawns a fake `claude` as a
// real subprocess. Only the vendor CLI is a stand-in -- and it is a stand-in
// for a wire format, not for any of our code.

const fakeClaudeEnv = "ACP_SHIM_FAKE_CLAUDE"

const (
	// fakeClaudeTurn emits a normal turn: text, a tool call, then a result.
	fakeClaudeTurn = "turn"

	// fakeClaudeEcho reports what it received, so the test can assert on how it
	// was invoked and what arrived on stdin.
	fakeClaudeEcho = "echo"

	// fakeClaudeHang never answers, so the turn must be ended by cancellation.
	fakeClaudeHang = "hang"

	// fakeClaudeFail dies with a diagnosis on stderr.
	fakeClaudeFail = "fail"
)

// TestMain intercepts before the testing framework parses flags, because the
// fake is invoked with the vendor CLI's flags (--print, --output-format, ...)
// which the flag package would reject.
func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeClaudeEnv); mode != "" {
		runFakeClaude(mode)
	}

	if mode := os.Getenv(fakeJSONLEnv); mode != "" {
		runFakeJSONL(mode)
	}

	os.Exit(m.Run())
}

// runFakeClaude impersonates `claude --print --input-format stream-json
// --output-format stream-json`. It never returns.
func runFakeClaude(mode string) {
	stdin, _ := io.ReadAll(os.Stdin)

	encoder := json.NewEncoder(os.Stdout)

	emit := func(event map[string]any) { _ = encoder.Encode(event) }

	switch mode {
	case fakeClaudeFail:
		_, _ = io.WriteString(os.Stderr, "Invalid API key\n")
		os.Exit(1)

	case fakeClaudeHang:
		// A plain `select {}` would trip Go's all-goroutines-asleep detector and
		// exit, which looks like a clean turn end rather than a hang. Sleeping
		// keeps the process genuinely alive with stdout open, so only a kill
		// ends it.
		time.Sleep(10 * time.Minute)

	case fakeClaudeEcho:
		emit(map[string]any{"type": "system", "subtype": "init", "session_id": "sess-echo"})
		emit(map[string]any{
			"type":       "assistant",
			"session_id": "sess-echo",
			"message": map[string]any{"content": []map[string]any{
				{"type": "text", "text": "ARGV: " + strings.Join(os.Args[1:], " ")},
				{"type": "text", "text": "STDIN: " + strings.TrimSpace(string(stdin))},
			}},
		})
		emit(map[string]any{
			"type": "result", "subtype": "success", "session_id": "sess-echo",
		})

	default:
		emit(map[string]any{"type": "system", "subtype": "init", "session_id": "sess-abc"})
		emit(map[string]any{
			"type":       "assistant",
			"session_id": "sess-abc",
			"message": map[string]any{"content": []map[string]any{
				{"type": "thinking", "text": "considering"},
				{"type": "text", "text": "Here is the answer."},
				{"type": "tool_use", "id": "tu-1", "name": "Write",
					"input": map[string]any{"file_path": "/tmp/x"}},
			}},
		})
		emit(map[string]any{
			"type": "result", "subtype": "success", "session_id": "sess-abc",
			"result": "Here is the answer.",
		})
	}

	os.Exit(0)
}

func fakeClaude(t *testing.T, mode string) *shim.ClaudeCode {
	t.Helper()

	t.Setenv(fakeClaudeEnv, mode)

	return &shim.ClaudeCode{Command: os.Args[0], ExtraArgs: nil}
}

// collectingClient records everything the agent streams.
type collectingClient struct {
	mu      sync.Mutex
	updates []acpfx.SessionUpdate
}

func (c *collectingClient) RequestPermission(
	_ context.Context,
	_ *acpfx.RequestPermissionRequest,
) (acpfx.PermissionOutcome, error) {
	return acpfx.CancelPermission(), nil
}

func (c *collectingClient) SessionUpdate(_ context.Context, note *acpfx.SessionNotification) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.updates = append(c.updates, note.Update)
}

func (c *collectingClient) snapshot() []acpfx.SessionUpdate {
	c.mu.Lock()
	defer c.mu.Unlock()

	return append([]acpfx.SessionUpdate(nil), c.updates...)
}

// texts returns the concatenated text of every update of the given kind.
func (c *collectingClient) texts(kind acpfx.SessionUpdateKind) string {
	var sb strings.Builder

	for _, update := range c.snapshot() {
		if update.SessionUpdate == kind && update.Content != nil {
			sb.WriteString(update.Content.Text)
		}
	}

	return sb.String()
}

// connectShim wires a real client to a real agent running the shim.
func connectShim(
	t *testing.T,
	backend shim.Backend,
) (*acpfx.Client, *collectingClient) {
	t.Helper()

	clientReader, agentWriter := io.Pipe()
	agentReader, clientWriter := io.Pipe()

	served := acpfx.NewAgent(agentReader, agentWriter, nil, shim.New(backend, "test"))

	handler := &collectingClient{} //nolint:exhaustruct

	client, err := acpfx.NewClient(
		t.Context(), clientReader, clientWriter, nil, handler,
		&acpfx.Implementation{Name: "test", Title: "test", Version: "0.0.0"},
	)
	if err != nil {
		t.Fatalf("handshake: %v", err)
	}

	t.Cleanup(func() {
		_ = client.Close()
		_ = served.Close()
	})

	return client, handler
}

func newShimSession(t *testing.T, client *acpfx.Client) *acpfx.Session {
	t.Helper()

	session, err := client.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	return session
}

// TestShimTranslatesAVendorTurn is the end-to-end translation contract: vendor
// stream-json in, ACP session/update out.
func TestShimTranslatesAVendorTurn(t *testing.T) {
	client, handler := connectShim(t, fakeClaude(t, fakeClaudeTurn))

	session := newShimSession(t, client)

	resp, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")})
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stopReason = %q, want end_turn", resp.StopReason)
	}

	waitFor(t, "the turn's updates", func() bool { return len(handler.snapshot()) >= 3 })

	if got := handler.texts(acpfx.UpdateAgentMessageChunk); got != "Here is the answer." {
		t.Fatalf("message text = %q", got)
	}

	if got := handler.texts(acpfx.UpdateAgentThoughtChunk); got != "considering" {
		t.Fatalf("thought text = %q -- thinking must not be merged into the answer", got)
	}

	var call *acpfx.ToolCall

	for _, update := range handler.snapshot() {
		if update.SessionUpdate == acpfx.UpdateToolCall {
			call = update.ToolCall
		}
	}

	if call == nil {
		t.Fatal("tool_use was never translated to an ACP tool_call")
	}

	if call.ToolCallID != "tu-1" || call.Title != "Write" {
		t.Fatalf("tool call = %+v", call)
	}

	if call.Kind != "edit" {
		t.Fatalf("tool kind = %q, want edit -- this is the write signal consumers gate on", call.Kind)
	}
}

// TestShimSendsPromptOnStdinNotArgv pins the ARG_MAX property.
//
// Every ad-hoc shell-out this migration replaces passed the prompt as argv,
// which fails once the prompt grows past the platform limit. The prompt must
// travel on stdin, and the invocation must carry the stream-json flags that
// make that possible.
func TestShimSendsPromptOnStdinNotArgv(t *testing.T) {
	client, handler := connectShim(t, fakeClaude(t, fakeClaudeEcho))

	session := newShimSession(t, client)

	// Large enough that an argv-based implementation would fail outright.
	needle := strings.Repeat("abcdefgh", 64*1024) // 512 KiB

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock(needle)},
	); err != nil {
		t.Fatalf("Prompt with a 512 KiB prompt: %v", err)
	}

	waitFor(t, "the echo", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "STDIN:")
	})

	echoed := handler.texts(acpfx.UpdateAgentMessageChunk)

	argv, stdin, found := strings.Cut(echoed, "STDIN:")
	if !found {
		t.Fatalf("fake CLI did not report stdin: %q", truncate(echoed))
	}

	if !strings.Contains(stdin, needle) {
		t.Fatal("the prompt did not arrive on stdin")
	}

	if strings.Contains(argv, needle) {
		t.Fatal("the prompt was passed as argv -- this is the ARG_MAX hazard")
	}

	for _, flag := range []string{"--print", "--input-format", "--output-format", "--verbose"} {
		if !strings.Contains(argv, flag) {
			t.Fatalf("invocation missing %s: %q", flag, truncate(argv))
		}
	}
}

// TestShimResumesWithVendorSessionID pins that a second turn continues the
// vendor conversation instead of starting a fresh one.
//
// The old CLI adapters passed neither --resume nor --session-id, so every call
// began a new agent and the entire history had to be re-sent as one blob.
func TestShimResumesWithVendorSessionID(t *testing.T) {
	client, handler := connectShim(t, fakeClaude(t, fakeClaudeEcho))

	session := newShimSession(t, client)

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("first")},
	); err != nil {
		t.Fatalf("first Prompt: %v", err)
	}

	waitFor(t, "the first turn", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "ARGV:")
	})

	before := handler.texts(acpfx.UpdateAgentMessageChunk)
	if strings.Contains(before, "--resume") {
		t.Fatal("the first turn should not resume anything")
	}

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("second")},
	); err != nil {
		t.Fatalf("second Prompt: %v", err)
	}

	waitFor(t, "the second turn", func() bool {
		return strings.Count(handler.texts(acpfx.UpdateAgentMessageChunk), "ARGV:") >= 2
	})

	after := strings.TrimPrefix(handler.texts(acpfx.UpdateAgentMessageChunk), before)

	if !strings.Contains(after, "--resume sess-echo") {
		t.Fatalf("second turn did not resume the vendor session: %q", truncate(after))
	}
}

// TestShimCancelEndsAHangingTurn pins that cancellation reaches the vendor
// subprocess, and that the turn ends as a stop reason rather than an error.
func TestShimCancelEndsAHangingTurn(t *testing.T) {
	client, _ := connectShim(t, fakeClaude(t, fakeClaudeHang))

	session := newShimSession(t, client)

	done := make(chan *acpfx.PromptResponse, 1)
	failed := make(chan error, 1)

	go func() {
		resp, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")})
		if err != nil {
			failed <- err

			return
		}

		done <- resp
	}()

	// Let the turn get as far as spawning the vendor process.
	time.Sleep(500 * time.Millisecond)

	if err := session.Cancel(t.Context()); err != nil {
		t.Fatalf("Cancel: %v", err)
	}

	select {
	case resp := <-done:
		if resp.StopReason != acpfx.StopReasonCancelled {
			t.Fatalf("stopReason = %q, want cancelled", resp.StopReason)
		}
	case err := <-failed:
		t.Fatalf("cancel surfaced as an error rather than a stop reason: %v", err)
	case <-time.After(20 * time.Second):
		t.Fatal("the turn never ended after cancel")
	}
}

// TestShimSurfacesVendorStderr pins that a vendor failure explains itself.
//
// The failure mode this guards is silent success: the CLI dies before writing
// any stream-json, so its stdout reaches EOF immediately and the drain loop
// sees a turn that simply had nothing in it. Reporting that as end_turn hands
// the user an empty answer and no reason -- and the reason exists, on the
// child's stderr. A turn the vendor never ran must fail, carrying that text.
//
// An earlier version of this test returned early when Prompt succeeded, with a
// comment excusing it. That excuse made the test vacuous: it passed against
// exactly the defect it was named for.
func TestShimSurfacesVendorStderr(t *testing.T) {
	client, handler := connectShim(t, fakeClaude(t, fakeClaudeFail))

	session := newShimSession(t, client)

	_, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")})
	if err == nil {
		t.Fatal("a vendor that died without running the turn reported success")
	}

	if !strings.Contains(err.Error(), "Invalid API key") {
		t.Fatalf("error %q does not carry the vendor's stderr", err)
	}

	if got := handler.texts(acpfx.UpdateAgentMessageChunk); got != "" {
		t.Fatalf("a failed turn streamed content: %q", got)
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)

	for {
		if cond() {
			return
		}

		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}

		time.Sleep(20 * time.Millisecond)
	}
}

func truncate(s string) string {
	const limit = 300

	if len(s) <= limit {
		return s
	}

	return s[:limit] + "..."
}
