package acpfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// The fake agent runs as a subprocess of the test binary, selected by this
// environment variable. Spawning the test binary itself is the standard way to
// get a real child process with real pipes without shipping a fixture binary.
const fakeAgentEnv = "ACPFX_FAKE_AGENT_MODE"

const (
	// fakeAgentHealthy speaks ACP correctly.
	fakeAgentHealthy = "healthy"

	// fakeAgentBroken models the most common misconfiguration: a binary that
	// exists but does not understand the ACP flag, and says so on stderr.
	fakeAgentBroken = "broken"

	// fakeAgentSilent models the worst case: a binary that reads stdin and
	// never answers. Only the handshake timeout can break this.
	fakeAgentSilent = "silent"
)

const fakeSessionID = "sess-fake-1"

// TestAcpfxFakeAgentHelper is not a test.
//
// It is the entry point the fake agent subprocess is invoked at. Under a normal
// test run the environment variable is unset and it skips; the child sets it.
func TestAcpfxFakeAgentHelper(t *testing.T) {
	mode := os.Getenv(fakeAgentEnv)
	if mode == "" {
		t.Skip("subprocess entry point, not a test")
	}

	runFakeAgent(mode)
}

// fakeAgentMarkerEnv names a file the healthy agent touches on its way out.
//
// Its presence is proof the agent reached its own exit path rather than being
// killed -- a signalled process never runs this.
const fakeAgentMarkerEnv = "ACPFX_FAKE_AGENT_MARKER"

// runFakeAgent never returns: it exits the process directly so the testing
// framework never gets to print its own trailer, which would otherwise land in
// the middle of the ACP frame stream on stdout.
func runFakeAgent(mode string) {
	switch mode {
	case fakeAgentBroken:
		_, _ = io.WriteString(os.Stderr, "fatal: unknown flag --acp\n")
		os.Exit(2)

	case fakeAgentSilent:
		// Consume stdin and answer nothing.
		_, _ = io.Copy(io.Discard, os.Stdin)
		os.Exit(0)

	default:
		serveFakeAgent()

		// Reached only on stdin EOF, i.e. a graceful shutdown.
		//
		// G703: the path comes from the test's own t.TempDir, not from input.
		if marker := os.Getenv(fakeAgentMarkerEnv); marker != "" {
			_ = os.WriteFile(marker, []byte("exited"), 0o600) //nolint:gosec
		}

		os.Exit(0)
	}
}

// serveFakeAgent implements just enough of the agent half of ACP v1 to take a
// client through initialize -> session/new -> session/prompt.
func serveFakeAgent() {
	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)

	for {
		var msg struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}

		if err := decoder.Decode(&msg); err != nil {
			return // stdin EOF: the client is shutting us down
		}

		switch msg.Method {
		case acpfx.MethodInitialize:
			fakeReply(encoder, msg.ID, acpfx.InitializeResponse{
				ProtocolVersion: acpfx.ProtocolVersion,
				AgentInfo: &acpfx.Implementation{
					Name: "fake-agent", Title: "Fake Agent", Version: "0.1.0",
				},
				AgentCapabilities: acpfx.AgentCapabilities{
					LoadSession: true,
					Prompt:      acpfx.PromptCapabilities{Image: true}, //nolint:exhaustruct
				},
				AuthMethods: nil,
			})

		case acpfx.MethodSessionNew:
			fakeReply(encoder, msg.ID, acpfx.NewSessionResponse{
				SessionID: fakeSessionID,
				Modes:     nil,
			})

		case acpfx.MethodSessionPrompt:
			// Stream a chunk before answering, exactly as a real turn does.
			fakeNotify(encoder, acpfx.MethodSessionUpdate, acpfx.SessionNotification{
				SessionID: fakeSessionID,
				Update: acpfx.SessionUpdate{ //nolint:exhaustruct
					SessionUpdate: acpfx.UpdateAgentMessageChunk,
					Content:       &acpfx.ContentBlock{Type: acpfx.ContentBlockText, Text: "pong"}, //nolint:exhaustruct
				},
			})

			fakeReply(encoder, msg.ID, acpfx.PromptResponse{
				StopReason: acpfx.StopReasonEndTurn,
			})
		}
	}
}

func fakeReply(encoder *json.Encoder, id json.RawMessage, result any) {
	_ = encoder.Encode(map[string]any{
		"jsonrpc": "2.0", "id": id, "result": result,
	})
}

func fakeNotify(encoder *json.Encoder, method string, params any) {
	_ = encoder.Encode(map[string]any{
		"jsonrpc": "2.0", "method": method, "params": params,
	})
}

// fakeAgentOptions builds SpawnOptions that re-invoke this test binary as the
// agent in the given mode.
func fakeAgentOptions(mode string) acpfx.SpawnOptions {
	return acpfx.SpawnOptions{ //nolint:exhaustruct
		Command: os.Args[0],
		Args:    []string{"-test.run=^TestAcpfxFakeAgentHelper$"},
		Env:     append(os.Environ(), fakeAgentEnv+"="+mode),
	}
}

// recordingHandler collects session updates in arrival order.
type recordingHandler struct {
	mu      sync.Mutex
	updates []*acpfx.SessionNotification
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

	h.updates = append(h.updates, note)
}

func (h *recordingHandler) texts() []string {
	h.mu.Lock()
	defer h.mu.Unlock()

	out := make([]string, 0, len(h.updates))

	for _, note := range h.updates {
		if note.Update.Content != nil {
			out = append(out, note.Update.Content.Text)
		}
	}

	return out
}

var testClientInfo = &acpfx.Implementation{ //nolint:gochecknoglobals
	Name: "acpfx-test", Title: "acpfx test", Version: "0.0.0",
}

// TestSpawnDrivesAFullTurn is the Phase 1 end-to-end.
//
// Everything before this drove the codec over in-memory pipes. This drives a
// real subprocess over real OS pipes, through the whole v1 sequence:
// initialize -> session/new -> session/prompt -> session/update -> stopReason.
func TestSpawnDrivesAFullTurn(t *testing.T) {
	t.Parallel()

	handler := &recordingHandler{} //nolint:exhaustruct

	client, err := acpfx.Spawn(
		t.Context(), fakeAgentOptions(fakeAgentHealthy), handler, testClientInfo,
	)
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	t.Cleanup(func() { _ = client.Close() })

	if info := client.AgentInfo(); info == nil || info.Name != "fake-agent" {
		t.Fatalf("agent info = %+v, want name fake-agent", info)
	}

	if !client.AgentCapabilities().LoadSession {
		t.Fatal("loadSession capability was advertised but not recorded")
	}

	session, err := client.NewSession(t.Context(), &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}

	if session.ID() != fakeSessionID {
		t.Fatalf("session id = %q, want %q", session.ID(), fakeSessionID)
	}

	resp, err := session.Prompt(t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("ping")})
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stop reason = %q, want %q", resp.StopReason, acpfx.StopReasonEndTurn)
	}

	// No polling. Prompt drains the session's update queue before returning, so
	// the turn's transcript is complete the moment it hands back -- and across a
	// real process boundary, not just in-memory pipes. An earlier version polled
	// here with a comment excusing updates that landed after the response; that
	// excuse was the defect, not the timing.
	texts := handler.texts()
	if len(texts) != 1 {
		t.Fatalf("handler saw %d updates on return, want 1", len(texts))
	}

	if texts[0] != "pong" {
		t.Fatalf("streamed text = %q, want %q", texts[0], "pong")
	}
}

// TestSpawnSurfacesAgentStderr pins the diagnosis path.
//
// A child that dies during the handshake makes the client see nothing but EOF.
// "connection closed" is useless to whoever misconfigured the agent; the
// child's own stderr is the entire explanation, so it has to reach the error.
func TestSpawnSurfacesAgentStderr(t *testing.T) {
	t.Parallel()

	_, err := acpfx.Spawn(
		t.Context(), fakeAgentOptions(fakeAgentBroken), &recordingHandler{}, testClientInfo, //nolint:exhaustruct
	)
	if err == nil {
		t.Fatal("Spawn succeeded against a binary that exits during handshake")
	}

	if !errors.Is(err, acpfx.ErrSpawn) {
		t.Fatalf("error = %v, want ErrSpawn", err)
	}

	if !strings.Contains(err.Error(), "unknown flag --acp") {
		t.Fatalf("error %q does not carry the agent's stderr", err)
	}
}

// TestSpawnHandshakeTimesOut covers the binary that answers nothing at all.
//
// Without a bound on initialize this hangs forever. Note the contrast with
// session/prompt, which must never carry a general timeout.
func TestSpawnHandshakeTimesOut(t *testing.T) {
	t.Parallel()

	opts := fakeAgentOptions(fakeAgentSilent)
	opts.HandshakeTimeout = 2 * time.Second

	started := time.Now()

	_, err := acpfx.Spawn(t.Context(), opts, &recordingHandler{}, testClientInfo) //nolint:exhaustruct
	if err == nil {
		t.Fatal("Spawn succeeded against an agent that never replies")
	}

	if !errors.Is(err, acpfx.ErrSpawn) {
		t.Fatalf("error = %v, want ErrSpawn", err)
	}

	if elapsed := time.Since(started); elapsed > 30*time.Second {
		t.Fatalf("handshake took %v: the timeout was not applied", elapsed)
	}
}

// TestSpawnCloseIsGraceful pins that Close lets the agent exit on stdin EOF
// rather than killing it.
//
// The assertion is the marker file, not the clock. An earlier version timed
// Close and failed if it exceeded 2s, which is only 1s clear of shutdownGrace
// -- enough to flake on a loaded machine, and a timing budget is the wrong way
// to ask "did this exit on its own?" anyway. A killed process never reaches
// its own exit path, so the marker answers it exactly.
func TestSpawnCloseIsGraceful(t *testing.T) {
	t.Parallel()

	marker := filepath.Join(t.TempDir(), "exited")

	opts := fakeAgentOptions(fakeAgentHealthy)
	opts.Env = append(opts.Env, fakeAgentMarkerEnv+"="+marker)

	client, err := acpfx.Spawn(t.Context(), opts, &recordingHandler{}, testClientInfo) //nolint:exhaustruct
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	if err := client.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("agent never reached its own exit path, so Close killed it: %v", err)
	}

	// The connection must be down regardless of how the agent went.
	select {
	case <-client.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("connection still live after Close")
	}
}
