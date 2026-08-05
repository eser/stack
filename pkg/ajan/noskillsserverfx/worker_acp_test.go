package noskillsserverfx

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

// These tests drive the real acpWorker against a real acpfx.Client connected by
// real pipes to a real acpfx.Agent. Only the agent's *behaviour* is scripted --
// none of the protocol machinery is stubbed, so what is under test is the
// translation between ACP and the daemon's worker protocol rather than a mock
// of it.

// scriptedAgent is an ACP agent whose turn behaviour the test supplies.
type scriptedAgent struct {
	// turn runs one prompt. It may emit updates and request permission.
	turn func(ctx context.Context, req *acpfx.PromptRequest, emit acpfx.UpdateFunc) acpfx.StopReason

	// loadSession advertises and serves session/load when true.
	loadSession bool

	mu sync.Mutex
	// loaded records the session ids session/load was asked for.
	loaded []string
	// newCwd records the cwds session/new was asked for.
	newCwd []string

	conn *acpfx.Agent

	// stdout is the agent's write end of the pipe. Closing it is what a dying
	// subprocess does, and is the only way to reproduce that here: NewAgent is
	// given a nil closer, so Agent.Close tears down its own read loop without
	// touching the pipe the client is reading.
	stdout *io.PipeWriter

	cancelOnce sync.Once
	cancelled  chan struct{}
}

func (a *scriptedAgent) Initialize(
	_ context.Context,
	req *acpfx.InitializeRequest,
) (*acpfx.InitializeResponse, error) {
	return &acpfx.InitializeResponse{ //nolint:exhaustruct
		ProtocolVersion: req.ProtocolVersion,
		AgentInfo: &acpfx.Implementation{
			Name: "scripted", Title: "scripted", Version: "0",
		},
		AgentCapabilities: acpfx.AgentCapabilities{ //nolint:exhaustruct
			LoadSession: a.loadSession,
		},
	}, nil
}

func (a *scriptedAgent) NewSession(
	_ context.Context,
	req *acpfx.NewSessionRequest,
) (*acpfx.NewSessionResponse, error) {
	a.mu.Lock()
	a.newCwd = append(a.newCwd, req.Cwd)
	a.mu.Unlock()

	return &acpfx.NewSessionResponse{SessionID: "agent-session-1", Modes: nil}, nil
}

func (a *scriptedAgent) LoadSession(
	_ context.Context,
	req *acpfx.LoadSessionRequest,
) (*acpfx.LoadSessionResponse, error) {
	a.mu.Lock()
	a.loaded = append(a.loaded, req.SessionID)
	a.mu.Unlock()

	return &acpfx.LoadSessionResponse{Modes: nil}, nil
}

func (a *scriptedAgent) Prompt(
	ctx context.Context,
	req *acpfx.PromptRequest,
	emit acpfx.UpdateFunc,
) (*acpfx.PromptResponse, error) {
	return &acpfx.PromptResponse{StopReason: a.turn(ctx, req, emit)}, nil
}

func (a *scriptedAgent) Cancel(_ context.Context, _ *acpfx.CancelNotification) {
	a.cancelOnce.Do(func() { close(a.cancelled) })
}

func (a *scriptedAgent) loadedSessions() []string {
	a.mu.Lock()
	defer a.mu.Unlock()

	return append([]string(nil), a.loaded...)
}

// connectACPWorker wires a real worker to a real agent over pipes.
func connectACPWorker(
	t *testing.T,
	agent *scriptedAgent,
	dataDir string,
) *acpWorker {
	t.Helper()

	if agent.turn == nil {
		agent.turn = func(
			_ context.Context, _ *acpfx.PromptRequest, _ acpfx.UpdateFunc,
		) acpfx.StopReason {
			return acpfx.StopReasonEndTurn
		}
	}

	agent.cancelled = make(chan struct{})

	clientReader, agentWriter := io.Pipe()
	agentReader, clientWriter := io.Pipe()

	agent.conn = acpfx.NewAgent(agentReader, agentWriter, nil, agent)
	agent.stdout = agentWriter

	worker := newACPWorker("sess-test", t.TempDir(), dataDir, logfx.NewLogger())

	client, err := acpfx.NewClient(
		t.Context(), clientReader, clientWriter, nil, worker,
		&acpfx.Implementation{Name: "test", Title: "test", Version: "0"},
	)
	if err != nil {
		t.Fatalf("handshake: %v", err)
	}

	worker.attach(client)

	t.Cleanup(func() {
		_ = worker.Close()
		_ = agent.conn.Close()
	})

	return worker
}

// collectEvents drains the worker's events until cond is satisfied or time runs
// out, returning everything seen.
func collectEvents(
	t *testing.T,
	worker *acpWorker,
	cond func([]WorkerEvent) bool,
) []WorkerEvent {
	t.Helper()

	var seen []WorkerEvent

	deadline := time.After(15 * time.Second)

	for {
		if cond(seen) {
			return seen
		}

		select {
		case evt, ok := <-worker.Events():
			if !ok {
				t.Fatalf("events channel closed early; saw %s", eventTypes(seen))
			}

			seen = append(seen, evt)

		case <-deadline:
			t.Fatalf("timed out; saw %s", eventTypes(seen))
		}
	}
}

func eventTypes(events []WorkerEvent) string {
	names := make([]string, 0, len(events))
	for _, evt := range events {
		names = append(names, evt.Type)
	}

	return "[" + strings.Join(names, " ") + "]"
}

func hasType(events []WorkerEvent, want string) bool {
	for _, evt := range events {
		if evt.Type == want {
			return true
		}
	}

	return false
}

func findType(t *testing.T, events []WorkerEvent, want string) map[string]any {
	t.Helper()

	for _, evt := range events {
		if evt.Type != want {
			continue
		}

		var decoded map[string]any
		if err := json.Unmarshal(evt.Payload, &decoded); err != nil {
			t.Fatalf("event %s has unparseable payload: %v", want, err)
		}

		return decoded
	}

	t.Fatalf("no %s event in %s", want, eventTypes(events))

	return nil
}

// TestACPWorkerStreamsATurnAsSdkEvents pins the core translation: ACP
// session/update in, the daemon's own event vocabulary out.
//
// The vocabulary matters more than it looks. The ledger, the fanout
// broadcaster, replay and the WebTransport attach path all carry these payloads
// opaquely, so emitting anything else would mean changing every one of them --
// and every client -- in lockstep.
func TestACPWorkerStreamsATurnAsSdkEvents(t *testing.T) {
	agent := &scriptedAgent{ //nolint:exhaustruct
		turn: func(
			_ context.Context, _ *acpfx.PromptRequest, emit acpfx.UpdateFunc,
		) acpfx.StopReason {
			_ = emit(acpfx.SessionUpdate{ //nolint:exhaustruct
				SessionUpdate: acpfx.UpdateAgentMessageChunk,
				Content: &acpfx.ContentBlock{ //nolint:exhaustruct
					Type: acpfx.ContentBlockText, Text: "hello",
				},
			})

			return acpfx.StopReasonEndTurn
		},
	}

	worker := connectACPWorker(t, agent, "")

	if err := worker.SendQueryStart(t.Context(), t.TempDir(), "sess-test", ""); err != nil {
		t.Fatalf("SendQueryStart: %v", err)
	}

	if err := worker.PushMessage("hi"); err != nil {
		t.Fatalf("PushMessage: %v", err)
	}

	events := collectEvents(t, worker, func(seen []WorkerEvent) bool {
		return hasType(seen, "query_done")
	})

	update := findType(t, events, "sdk_event")

	inner, ok := update["event"].(map[string]any)
	if !ok {
		t.Fatalf("sdk_event carries no event object: %v", update)
	}

	if inner["sessionUpdate"] != "agent_message_chunk" {
		t.Fatalf("sdk_event is not a typed ACP update: %v", inner)
	}

	// The stop reason is new information the SDK path had no way to report.
	if done := findType(t, events, "query_done"); done["stopReason"] != "end_turn" {
		t.Fatalf("query_done did not carry the stop reason: %v", done)
	}
}

// TestACPWorkerRoutesPermissionThroughTheDaemonProtocol is the join this
// migration exists to make.
//
// The daemon already had a requestId-correlated permission round-trip built
// against the SDK's canUseTool. ACP's session/request_permission is the same
// exchange in a different envelope, so it must land in the same path rather
// than a second one -- otherwise every UI that renders a prompt needs a new
// case.
func TestACPWorkerRoutesPermissionThroughTheDaemonProtocol(t *testing.T) {
	granted := make(chan acpfx.PermissionOutcome, 1)

	agent := &scriptedAgent{} //nolint:exhaustruct

	// Assigned after construction so the closure can call back through the
	// agent's own connection -- which is what makes this a real mid-turn
	// request rather than a staged one.
	agent.turn = func(
		ctx context.Context, req *acpfx.PromptRequest, _ acpfx.UpdateFunc,
	) acpfx.StopReason {
		outcome, err := agent.conn.RequestPermission(
			ctx, &acpfx.RequestPermissionRequest{
				SessionID: req.SessionID,
				ToolCall: acpfx.ToolCall{ //nolint:exhaustruct
					ToolCallID: "tu-1",
					Title:      "Write",
					Kind:       "edit",
					RawInput:   json.RawMessage(`{"file_path":"/tmp/x"}`),
				},
				Options: []acpfx.PermissionOption{
					{OptionID: "yes", Name: "Allow", Kind: acpfx.PermissionAllowOnce},
					{OptionID: "no", Name: "Deny", Kind: acpfx.PermissionRejectOnce},
				},
			})
		if err != nil {
			return acpfx.StopReasonEndTurn
		}

		granted <- outcome

		return acpfx.StopReasonEndTurn
	}

	worker := connectACPWorker(t, agent, "")

	if err := worker.SendQueryStart(t.Context(), t.TempDir(), "sess-test", ""); err != nil {
		t.Fatalf("SendQueryStart: %v", err)
	}

	if err := worker.PushMessage("write a file"); err != nil {
		t.Fatalf("PushMessage: %v", err)
	}

	events := collectEvents(t, worker, func(seen []WorkerEvent) bool {
		return hasType(seen, "permission_request")
	})

	request := findType(t, events, "permission_request")

	// The envelope must be the daemon's, field for field.
	if request["toolName"] != "Write" || request["toolUseId"] != "tu-1" {
		t.Fatalf("permission_request is not the daemon's shape: %v", request)
	}

	requestID, _ := request["requestId"].(string)
	if requestID == "" {
		t.Fatalf("permission_request carries no requestId: %v", request)
	}

	if err := worker.PermissionResponse(requestID, "allow", ""); err != nil {
		t.Fatalf("PermissionResponse: %v", err)
	}

	select {
	case outcome := <-granted:
		if outcome.Outcome != "selected" || outcome.OptionID != "yes" {
			t.Fatalf("agent got %+v, want the allow_once option it offered", outcome)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("the decision never reached the agent")
	}
}

// TestUnmappablePermissionCancelsRatherThanAllows pins the failure direction.
//
// ACP forbids inventing an outcome: a client selects an option the agent
// offered, or cancels. So a decision that maps to nothing must cancel. The
// daemon's own path had this backwards -- an empty decision was rewritten to
// "allow" -- which granted permission the user was never asked for.
func TestUnmappablePermissionCancelsRatherThanAllows(t *testing.T) {
	offered := []acpfx.PermissionOption{
		{OptionID: "yes", Name: "Allow", Kind: acpfx.PermissionAllowOnce},
		{OptionID: "no", Name: "Deny", Kind: acpfx.PermissionRejectOnce},
	}

	for _, behavior := range []string{"", "nonsense", "maybe"} {
		outcome := resolvePermission(behavior, offered)
		if outcome.Outcome != "cancelled" {
			t.Fatalf("behavior %q produced %+v, want cancelled", behavior, outcome)
		}
	}

	// An agent that offers nothing usable must also not be taken as consent.
	if got := resolvePermission("allow", nil); got.Outcome != "cancelled" {
		t.Fatalf("allow with no options produced %+v, want cancelled", got)
	}
}

// TestDenyRememberIsDistinctFromDeny pins the fix for a defect the plan named.
//
// wt_attach forwarded deny_remember verbatim as a behavior string the SDK did
// not recognise, so "deny and stop asking" was indistinguishable from "deny".
// ACP has a kind for exactly this.
func TestDenyRememberIsDistinctFromDeny(t *testing.T) {
	offered := []acpfx.PermissionOption{
		{OptionID: "once", Name: "Deny", Kind: acpfx.PermissionRejectOnce},
		{OptionID: "always", Name: "Deny always", Kind: acpfx.PermissionRejectAlways},
	}

	if got := resolvePermission("deny", offered); got.OptionID != "once" {
		t.Fatalf("deny selected %q, want the reject_once option", got.OptionID)
	}

	if got := resolvePermission("deny_remember", offered); got.OptionID != "always" {
		t.Fatalf("deny_remember selected %q, want the reject_always option", got.OptionID)
	}
}

// TestPermissionFallsBackWithinItsOwnDirection pins that a missing option kind
// degrades to the nearest one that means the same thing, never to its opposite.
func TestPermissionFallsBackWithinItsOwnDirection(t *testing.T) {
	onlyAlways := []acpfx.PermissionOption{
		{OptionID: "always", Name: "Allow always", Kind: acpfx.PermissionAllowAlways},
		{OptionID: "reject", Name: "Deny", Kind: acpfx.PermissionRejectOnce},
	}

	if got := resolvePermission("allow", onlyAlways); got.OptionID != "always" {
		t.Fatalf("allow selected %q; it must never fall back to a reject option", got.OptionID)
	}

	onlyRejectAlways := []acpfx.PermissionOption{
		{OptionID: "allow", Name: "Allow", Kind: acpfx.PermissionAllowOnce},
		{OptionID: "always", Name: "Deny always", Kind: acpfx.PermissionRejectAlways},
	}

	if got := resolvePermission("deny", onlyRejectAlways); got.OptionID != "always" {
		t.Fatalf("deny selected %q; it must never fall back to an allow option", got.OptionID)
	}
}

// TestACPWorkerResumesTheAgentSession pins that session resume is real.
//
// The live path passes "" for resume (wt_attach.go), so continuity today comes
// from replaying the ledger into a fresh agent that has never seen the
// conversation. Remembering the agent's own session id and loading it is what
// makes session/load do the job the ledger replay was standing in for.
func TestACPWorkerResumesTheAgentSession(t *testing.T) {
	dataDir := t.TempDir()
	root := t.TempDir()

	first := &scriptedAgent{loadSession: true} //nolint:exhaustruct
	worker := connectACPWorker(t, first, dataDir)
	worker.root = root

	if err := worker.SendQueryStart(t.Context(), root, "sess-test", ""); err != nil {
		t.Fatalf("first SendQueryStart: %v", err)
	}

	if len(first.loadedSessions()) != 0 {
		t.Fatal("a first session must not try to resume anything")
	}

	_ = worker.Close()

	// A second worker for the same (root, session) -- what a daemon restart or a
	// re-attach produces.
	second := &scriptedAgent{loadSession: true} //nolint:exhaustruct
	resumed := connectACPWorker(t, second, dataDir)
	resumed.root = root

	if err := resumed.SendQueryStart(t.Context(), root, "sess-test", ""); err != nil {
		t.Fatalf("second SendQueryStart: %v", err)
	}

	loaded := second.loadedSessions()
	if len(loaded) != 1 || loaded[0] != "agent-session-1" {
		t.Fatalf(
			"second attach loaded %v, want the agent session the first one opened", loaded,
		)
	}
}

// TestACPWorkerDoesNotResumeWhenTheAgentCannot pins that the capability is
// respected: calling session/load on an agent that never advertised it is a
// protocol violation, and the turn must still happen.
func TestACPWorkerDoesNotResumeWhenTheAgentCannot(t *testing.T) {
	dataDir := t.TempDir()
	root := t.TempDir()

	first := &scriptedAgent{loadSession: false} //nolint:exhaustruct
	worker := connectACPWorker(t, first, dataDir)
	worker.root = root

	if err := worker.SendQueryStart(t.Context(), root, "sess-test", ""); err != nil {
		t.Fatalf("first SendQueryStart: %v", err)
	}

	_ = worker.Close()

	second := &scriptedAgent{loadSession: false} //nolint:exhaustruct
	resumed := connectACPWorker(t, second, dataDir)
	resumed.root = root

	if err := resumed.SendQueryStart(t.Context(), root, "sess-test", ""); err != nil {
		t.Fatalf("second SendQueryStart: %v", err)
	}

	if got := second.loadedSessions(); len(got) != 0 {
		t.Fatalf("called session/load on an agent that does not support it: %v", got)
	}
}

// TestPushMessageDoesNotBlockOnARunningTurn pins a liveness property.
//
// PushMessage is called from the WebTransport read loop -- the same loop that
// carries the stop command. A turn runs for minutes, so blocking here would
// make an agent mid-turn impossible to cancel: the message asking it to stop
// could never be read.
func TestPushMessageDoesNotBlockOnARunningTurn(t *testing.T) {
	release := make(chan struct{})

	agent := &scriptedAgent{ //nolint:exhaustruct
		turn: func(
			ctx context.Context, _ *acpfx.PromptRequest, _ acpfx.UpdateFunc,
		) acpfx.StopReason {
			select {
			case <-release:
			case <-ctx.Done():
				return acpfx.StopReasonCancelled
			}

			return acpfx.StopReasonEndTurn
		},
	}

	worker := connectACPWorker(t, agent, "")
	defer close(release)

	if err := worker.SendQueryStart(t.Context(), t.TempDir(), "sess-test", ""); err != nil {
		t.Fatalf("SendQueryStart: %v", err)
	}

	if err := worker.PushMessage("first"); err != nil {
		t.Fatalf("PushMessage: %v", err)
	}

	returned := make(chan error, 1)

	go func() { returned <- worker.PushMessage("second") }()

	select {
	case err := <-returned:
		if err != nil {
			t.Fatalf("second PushMessage: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("PushMessage blocked on the running turn")
	}
}

// TestEmitDuringShutdownDoesNotPanic pins the fix for a crash that takes the
// whole daemon with it.
//
// Several goroutines emit and a different one closes the channel when the agent
// dies, so the two genuinely race. The natural guard --
//
//	select {
//	case w.events <- event:
//	case <-w.done:
//	}
//
// does not work: a send on a closed channel panics rather than blocking, which
// makes that case permanently *ready*, so the runtime is free to pick it. The
// window is exactly "an agent died while a turn was still streaming", which is
// what a crashing agent looks like.
func TestEmitDuringShutdownDoesNotPanic(t *testing.T) {
	worker := newACPWorker("sess-race", t.TempDir(), "", logfx.NewLogger())

	// Drain, so the queue does not simply fill up and turn every send into the
	// harmless full-queue branch -- that would make this test pass against the
	// broken version for the wrong reason.
	go func() {
		for range worker.Events() { //nolint:revive
		}
	}()

	var writers sync.WaitGroup

	for range 8 {
		writers.Add(1)

		go func() {
			defer writers.Done()

			for range 500 {
				worker.emit(map[string]any{"type": "sdk_event"})
			}
		}()
	}

	worker.closeEvents()
	writers.Wait()
}

// TestACPWorkerEndsWhenTheAgentDies pins the session-death signal.
//
// runPump treats a closed Events channel as "the session is over" -- it is what
// closes the ledger, releases attached clients and removes the session. An agent
// that dies without closing it leaks the session for the daemon's lifetime.
func TestACPWorkerEndsWhenTheAgentDies(t *testing.T) {
	agent := &scriptedAgent{} //nolint:exhaustruct
	worker := connectACPWorker(t, agent, "")

	// The agent's stdout goes away, which is what the daemon sees when the agent
	// process crashes or is killed.
	_ = agent.stdout.Close()

	deadline := time.After(15 * time.Second)

	for {
		select {
		case _, ok := <-worker.Events():
			if !ok {
				return
			}
		case <-deadline:
			t.Fatal("the events channel stayed open after the agent died")
		}
	}
}

// TestMissingAgentErrorIsActionable pins the error for an EXTERNAL agent that
// is not installed.
//
// This is now the only path that can fail this way. The default agent is the
// in-process shim, which cannot be missing -- it is linked in. Only
// NOSKILLS_ACP_COMMAND, which points at a third-party binary like gemini or
// claude-agent-acp, reintroduces a thing that can be absent, so the message has
// to say both what is missing and that unsetting the variable is a way out.
func TestMissingAgentErrorIsActionable(t *testing.T) {
	// Empty PATH so the agent is unresolvable regardless of the machine, and a
	// command name nothing could shadow.
	t.Setenv("PATH", t.TempDir())
	t.Setenv(envACPCommand, "definitely-not-installed-acp-agent")

	_, err := spawnACPWorker(
		t.Context(), "sess-missing", t.TempDir(), "", logfx.NewLogger(),
	)
	if err == nil {
		t.Fatal("spawning a missing agent reported success")
	}

	if !errors.Is(err, ErrACPAgentMissing) {
		t.Fatalf("error %v is not ErrACPAgentMissing", err)
	}

	message := err.Error()

	for _, want := range []string{
		"definitely-not-installed-acp-agent", // what is missing
		envACPCommand,                        // the override that selected it
		"unset",                              // how to fall back to the built-in
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("error %q does not mention %q", message, want)
		}
	}
}
